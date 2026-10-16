"""Verify SYNTHETIC files locally; --json prints a machine-readable core report."""

import argparse
from collections import Counter, defaultdict
import csv
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import sys
import tempfile
from zoneinfo import ZoneInfo

DATA_DIR = Path(__file__).resolve().parent
REPO_ROOT = next((parent for parent in DATA_DIR.parents if (parent / "app" / "qc.py").is_file()), None)
if REPO_ROOT is None:
    raise SystemExit("Run this bundle inside the project repository; app/qc.py is required.")
sys.path[:0] = [str(REPO_ROOT), str(DATA_DIR)]
from app.qc import analyze_response
from generate import COLUMNS, SEED, write_bundle

NY = ZoneInfo("America/New_York")
UTC = timezone.utc
BAD_REASONS = {
    "SYN-E-EXCLUDED-DAY": ["missing_on_scene_at"],
    "SYN-E-MISSING-ZONE": ["missing_zone"],
    "SYN-E-MISSING-PRIORITY": ["missing_priority"],
    "SYN-E-MISSING-DISPATCH": ["missing_dispatched_at"],
    "SYN-E-MALFORMED-ARRIVAL": ["invalid_on_scene_at"],
    "SYN-E-NAIVE-ARRIVAL": ["naive_on_scene_at"],
    "SYN-E-REVERSED": ["reversed_timestamps"],
    "SYN-E-FUTURE-DISPATCH": ["future_dispatched_at", "future_on_scene_at"],
    "SYN-E-FUTURE-ARRIVAL": ["future_on_scene_at"],
    "SYN-E-INVALID-OFFSET": ["invalid_on_scene_at"],
    "SYN-E-DUPLICATE": ["duplicate_incident_id"],
}


def load_rows(path):
    with path.open(newline="", encoding="utf-8") as source:
        reader = csv.DictReader(source)
        assert reader.fieldnames == COLUMNS, f"Wrong columns: {path.name}"
        rows = list(reader)
    assert all(set(row) == set(COLUMNS) and None not in row.values() for row in rows)
    assert all(row["incident_id"].startswith("SYN-") for row in rows)
    return rows


def duration_seconds(row):
    dispatch = datetime.fromisoformat(row["dispatched_at"]).astimezone(UTC)
    arrival = datetime.fromisoformat(row["on_scene_at"]).astimezone(UTC)
    return (arrival - dispatch).total_seconds()


def close(actual, expected):
    assert actual is not None and abs(actual - float(expected)) <= 1e-12, (actual, expected)


def manual_crosscheck(valid_rows, response, settings, empty_days=()):
    """Independent integer counts/Decimal checks only; official output stays in app.qc."""
    cutoff = datetime.fromisoformat(settings["baseline_end"])
    baseline_days, monitoring_days = defaultdict(lambda: [0, 0]), defaultdict(lambda: [0, 0])
    selected = [row for row in valid_rows if row["priority"] == settings["selected_priority"]]
    for row in selected:
        dispatch = datetime.fromisoformat(row["dispatched_at"])
        day = dispatch.astimezone(NY).date().isoformat()
        group = baseline_days if dispatch < cutoff else monitoring_days
        counts = group[(row["zone"], day)]
        counts[0] += 1
        counts[1] += int(duration_seconds(row) > settings["target_minutes"] * 60)
    zones = {row["zone"] for row in selected}
    assert {baseline["zone"] for baseline in response["zone_baselines"]} == zones
    baseline_totals = {}
    for baseline in response["zone_baselines"]:
        days = [(day, counts) for (zone, day), counts in baseline_days.items() if zone == baseline["zone"]]
        n, late = sum(counts[0] for _, counts in days), sum(counts[1] for _, counts in days)
        baseline_totals[baseline["zone"]] = (n, late)
        assert (baseline["n"], baseline["late"], baseline["nonempty_days"]) == (n, late, len(days))
        if n:
            close(baseline["p_bar"], Decimal(late) / n)
        else:
            assert baseline["p_bar"] is None
        for weekday in baseline["weekday"]:
            matching = [counts for day, counts in days if datetime.fromisoformat(day).weekday() == weekday["weekday"]]
            wn, wl = sum(count[0] for count in matching), sum(count[1] for count in matching)
            assert (weekday["n"], weekday["late"], weekday["nonempty_days"]) == (wn, wl, len(matching))
            assert weekday["rate"] == (wl / wn if wn else None)
    expected_dates = set(monitoring_days) | (set(empty_days) if selected else set())
    assert {(point["zone"], point["date"]) for point in response["daily_points"]} == expected_dates
    for point in response["daily_points"]:
        n, late = monitoring_days.get((point["zone"], point["date"]), [0, 0])
        assert (point["n"], point["late"], point["rate"]) == (n, late, late / n if n else None)
        baseline_n, baseline_late = baseline_totals[point["zone"]]
        eligible = (n > 0 and baseline_n > 0 and 0 < baseline_late < baseline_n
                    and n * baseline_late >= 5 * baseline_n
                    and n * (baseline_n - baseline_late) >= 5 * baseline_n)
        if eligible:
            p_bar = Decimal(baseline_late) / baseline_n
            se = (p_bar * (1 - p_bar) / n).sqrt()
            close(point["lower"], max(Decimal(0), p_bar - 3 * se))
            close(point["upper"], min(Decimal(1), p_bar + 3 * se))
        else:
            assert point["lower"] is None and point["upper"] is None
    assert response["signals"] == [point for point in response["daily_points"] if point["status"] in ("high", "low")]


def check_random_pair(stable, shifted):
    assert len(stable) == len(shifted) == 12000
    groups, changed = Counter(), 0
    exact_targets = 0
    for first, second in zip(stable, shifted):
        assert first["incident_id"] == second["incident_id"]
        for column in COLUMNS[:-1]:
            assert first[column] == second[column]
        dispatch = datetime.fromisoformat(first["dispatched_at"]).astimezone(NY)
        day = dispatch.date().isoformat()
        assert "2026-09-01" <= day <= "2026-09-30"
        assert (8, 0, 0) <= (dispatch.hour, dispatch.minute, dispatch.second) <= (20, 0, 0)
        groups[(first["zone"], first["priority"], day)] += 1
        for row in (first, second):
            seconds = duration_seconds(row)
            assert seconds.is_integer() and 120 <= seconds <= 1800
        exact_targets += duration_seconds(first) == 600
        if first != second:
            changed += 1
            assert first["zone"] == "A" and first["priority"] == "P1" and day >= "2026-09-21"
            assert duration_seconds(first) <= 600 < duration_seconds(second)
    assert len(groups) == 120 and set(groups.values()) == {100}
    assert sum(count for (_, _, day), count in groups.items() if day < "2026-09-21") == 8000
    assert exact_targets > 0, "Fixed-seed fixture should contain inspectable exact-target responses."
    return {"shared_baseline_rows": 8000, "unchanged_other_monitoring_rows": 3000,
            "changed_A_P1_monitoring_rows": changed, "stable_exact_target_rows": exact_targets}


def check_edge(rows, response):
    assert len(rows) == 2934
    counts = response["quality"]
    assert counts["overall"] == {"total_rows": 2934, "usable_rows": 2922, "excluded_rows": 12, "usable_fraction": 2922/2934}
    assert counts["selected_priority"]["total_rows"] == 2932
    assert counts["selected_priority"]["excluded_rows"] == 10
    assert counts["unassigned_priority_rows"] == 1
    excluded_ids = Counter(item["incident_id"] for item in response["excluded_records"])
    assert excluded_ids == Counter({identifier: 2 if identifier == "SYN-E-DUPLICATE" else 1 for identifier in BAD_REASONS})
    for item in response["excluded_records"]:
        assert item["reasons"] == BAD_REASONS[item["incident_id"]]
    baselines = {item["zone"]: item for item in response["zone_baselines"]}
    assert [(baselines[z]["n"], baselines[z]["late"], baselines[z]["nonempty_days"])
            for z in ("A", "B", "C", "SHORT", "NEW")] == [(2000, 200, 20), (200, 0, 20), (200, 200, 20), (190, 19, 19), (0, 0, 0)]
    points = {(point["zone"], point["date"]): point for point in response["daily_points"]}
    boundary = points[("A", "2026-09-21")]
    assert (boundary["n"], boundary["late"], boundary["rate"], boundary["status"]) == (100, 19, .19, "no_signal")
    close(boundary["upper"], .19)
    current = points[("A", "2026-10-01")]
    assert (current["n"], current["late"], current["rate"], current["status"]) == (100, 20, .2, "provisional_current_day")
    assert current["reasons"] == ["current_day_provisional"]
    for day in ("2026-09-22", "2026-09-30"):
        point = points[("A", day)]
        assert point["n"] == 1 and point["status"] == "insufficient_data" and point["upper"] is None
    for day in ("2026-09-23", "2026-09-24"):
        point = points[("A", day)]
        assert point["n"] == 0 and point["rate"] is None and point["reasons"] == ["no_usable_observations"]
    for zone, reason in (("B", "baseline_rate_degenerate"), ("C", "baseline_rate_degenerate"),
                         ("SHORT", "baseline_fewer_than_20_days"), ("NEW", "no_baseline")):
        point = points[(zone, "2026-09-21")]
        assert point["status"] == "insufficient_data" and reason in point["reasons"]
    assert response["signals"] == []
    by_id = {row["incident_id"]: row for row in rows}
    assert duration_seconds(by_id["SYN-E-EXACT-TARGET"]) == 600
    assert duration_seconds(by_id["SYN-E-TARGET-PLUS-ONE-SECOND"]) == 601
    assert duration_seconds(by_id["SYN-E-CROSS-MIDNIGHT"]) == 600
    late_ids = {row["incident_id"] for row in response["late_incidents"]}
    assert "SYN-E-TARGET-PLUS-ONE-SECOND" in late_ids
    assert "SYN-E-EXACT-TARGET" not in late_ids and "SYN-E-CROSS-MIDNIGHT" not in late_ids
    assert points[("A", "2026-09-30")]["late"] == 0
    assert all(point["date"] <= "2026-10-01" for point in response["daily_points"])


def verify(data_dir, temp_root=None):
    settings = json.loads((data_dir / "settings.json").read_text(encoding="utf-8"))
    assert settings["synthetic"] is True and settings["seed"] == SEED == 5300
    assert set(settings["datasets"]) == {"stable.csv", "zone_shift.csv", "edge_cases.csv"}
    reproduction = Path(tempfile.mkdtemp(prefix="qc-data-reproduce-", dir=temp_root))
    write_bundle(reproduction)
    names = [*settings["datasets"], "settings.json"]
    for name in names:
        assert (data_dir / name).read_bytes() == (reproduction / name).read_bytes(), f"Reproduction differs: {name}"
    write_bundle(reproduction)  # A second run must accept matching files unchanged.
    collision = reproduction / "overwrite_check"
    collision.mkdir()
    sentinel = collision / "stable.csv"
    sentinel.write_bytes(b"existing local file\n")
    try:
        write_bundle(collision)
    except FileExistsError:
        assert sentinel.read_bytes() == b"existing local file\n"
        assert sorted(path.name for path in collision.iterdir()) == ["stable.csv"]
    else:
        raise AssertionError("Generator did not refuse nonmatching output")
    datasets = {name: load_rows(data_dir / name) for name in settings["datasets"]}
    pair = check_random_pair(datasets["stable.csv"], datasets["zone_shift.csv"])
    report = {"status": "PASS", "synthetic": True, "seed": SEED,
              "reproduction_directory": str(reproduction), "byte_identical_files": names,
              "overwrite_refused": True, "http_ui_verified_by_this_script": False,
              "paired_generation": pair, "results": {}}
    for name, rows in datasets.items():
        valid = [row for row in rows if name != "edge_cases.csv" or row["incident_id"] not in BAD_REASONS]
        report["results"][name] = {}
        for priority in settings["datasets"][name]["available_priorities"]:
            params = {**settings["datasets"][name]["settings"], "selected_priority": priority}
            response = analyze_response(records=rows, **params)
            empty_days = [("A", "2026-09-23"), ("A", "2026-09-24")] if name == "edge_cases.csv" else []
            manual_crosscheck(valid, response, params, empty_days)
            for scope, original, usable in (("overall", rows, valid),
                    ("selected_priority", [r for r in rows if r["priority"] == priority], [r for r in valid if r["priority"] == priority])):
                quality = response["quality"][scope]
                assert (quality["total_rows"], quality["usable_rows"], quality["excluded_rows"]) == (len(original), len(usable), len(original)-len(usable))
            if name == "edge_cases.csv" and priority == "P1":
                check_edge(rows, response)
            elif name == "edge_cases.csv":
                assert response["quality"]["reasons"] == ["no_usable_selected_records"]
                assert response["quality"]["selected_priority"]["total_rows"] == 1
            else:
                assert response["excluded_records"] == []
                assert len(response["daily_points"]) == 20
                for point in response["daily_points"]:
                    expected = "high" if point["rate"] - point["upper"] > 1e-12 else "low" if point["lower"] - point["rate"] > 1e-12 else "no_signal"
                    assert point["status"] == expected
            unreviewed = analyze_response(records=rows, **{**params, "reviewed_zones": []})
            assert unreviewed["signals"] == []
            assert all("baseline_unreviewed" in point["reasons"] for point in unreviewed["daily_points"])
            report["results"][name][priority] = {
                "settings": params, "quality": response["quality"],
                "baselines": [{key: item[key] for key in ("zone", "n", "late", "nonempty_days", "p_bar", "status", "reasons")} for item in response["zone_baselines"]],
                "daily_points": response["daily_points"], "signals": response["signals"],
                "late_incident_count": len(response["late_incidents"]), "unreviewed_signal_count": 0,
            }
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--temp-root", type=Path, help="Optional writable parent for retained reproduction files.")
    parser.add_argument("--json", action="store_true", help="Print JSON only; do not save an extra report file.")
    args = parser.parse_args()
    report = verify(args.data_dir.resolve(), args.temp_root)
    if args.json:
        print(json.dumps(report, indent=2, allow_nan=False))
        return
    print("PASS: 3 synthetic CSVs; byte-identical seed-5300 reproduction; five columns; overwrite refusal.")
    pair = report["paired_generation"]
    print(f"PASS: 8000 shared baseline rows; 3000 unchanged other monitoring rows; {pair['changed_A_P1_monitoring_rows']} A/P1 arrivals changed.")
    for name, priorities in report["results"].items():
        for priority, output in priorities.items():
            quality = output["quality"]["overall"]
            selected = output["quality"]["selected_priority"]
            print(f"PASS {name} {priority}: overall {quality['total_rows']}/{quality['usable_rows']}/{quality['excluded_rows']}; selected {selected['total_rows']}/{selected['usable_rows']}/{selected['excluded_rows']}; signals={len(output['signals'])}; unreviewed=0")
            print("  Baselines: " + "; ".join(f"{b['zone']} {b['late']}/{b['n']} p_bar={b['p_bar']} days={b['nonempty_days']}" for b in output["baselines"]))
            if output["signals"]:
                print("  Signals: " + ", ".join(f"{p['zone']} {p['date']} {p['status']} {p['late']}/{p['n']}" for p in output["signals"]))
    print("PASS: independent counts/Decimal limits, weekdays, edge statuses, target equality, exclusions and priority isolation.")
    print("Core-only verification; no HTTP/UI verification or upload performed.")
    print(f"Reproduction files retained: {report['reproduction_directory']}")


if __name__ == "__main__":
    main()
