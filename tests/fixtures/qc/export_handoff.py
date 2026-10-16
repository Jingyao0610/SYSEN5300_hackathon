"""Export SYNTHETIC core fixtures for later API/UI comparison; no HTTP calls."""

import argparse
import csv
import json
import math
from pathlib import Path
import sys
import tempfile

FIXTURES = Path(__file__).resolve().parent
sys.path[:0] = [str(FIXTURES.parents[2]), str(FIXTURES)]

from app.qc import analyze_response
from qc_cases import analysis_request, k1_request

COLUMNS = ["incident_id", "zone", "priority", "dispatched_at", "on_scene_at"]
NOTICE = "SYNTHETIC test fixtures; verified against the core; NOT HTTP/UI verified."


def cases():
    """Requests plus independent hand-answer constants (not new statistics)."""
    variants = [
        ("k1_high", 100, 20, {}, "high", .01, .19),
        ("k1_boundary", 100, 19, {}, "no_signal", .01, .19),
        ("k3_high", 400, 59, {}, "high", .055, .145),
        ("k3_boundary", 400, 58, {}, "no_signal", .055, .145),
        ("insufficient", 49, 5, {}, "insufficient_data", None, None),
        ("unreviewed", 100, 20, {"reviewed_zones": []}, "unreviewed_baseline", .01, .19),
        ("current_day", 100, 20, {"as_of": "2026-09-21T12:00:00-04:00"},
         "provisional_current_day", .01, .19),
    ]
    result = []
    for name, n, late, settings, status, lower, upper in variants:
        expected = {"n": n, "late": late, "status": status, "lower": lower, "upper": upper,
                    "accounting": (2000 + n, 2000 + n, 0)}
        result.append((name, k1_request(n, late, **settings), expected))
    small = json.loads((FIXTURES / "small_request.json").read_text(encoding="utf-8"))
    result.append(("small_3_2_1", small, {"n": 1, "late": 1, "status": "insufficient_data",
                                       "lower": None, "upper": None, "accounting": (3, 2, 1)}))
    result.append(("empty", analysis_request([], reviewed_zones=[]),
                   {"status": None, "accounting": (0, 0, 0)}))
    return result


def check_expected(name, request, response, expected):
    """Stop export if the real core no longer matches the hand-answer cases."""
    overall = response["quality"]["overall"]
    assert tuple(overall[key] for key in ("total_rows", "usable_rows", "excluded_rows")) == expected["accounting"], name
    assert response["quality"]["selected_priority"] == overall, name
    assert response["meta"]["is_mock"] is False, name
    if name == "empty":
        assert all(response[key] == [] for key in ("zone_baselines", "daily_points", "signals", "late_incidents"))
        assert overall["usable_fraction"] is None
        assert response["quality"]["reasons"] == ["empty_input"]
        return
    assert len(response["daily_points"]) == 1, name
    point = response["daily_points"][0]
    for key in ("n", "late", "status"):
        assert point[key] == expected[key], (name, key)
    for key in ("lower", "upper"):
        value = expected[key]
        assert (point[key] is None if value is None else
                math.isclose(point[key], value, rel_tol=0, abs_tol=1e-12)), (name, key)
    assert response["signals"] == ([point] if expected["status"] == "high" else []), name
    assert point["baseline_reviewed"] == ("A" in request["reviewed_zones"]), name
    if name == "small_3_2_1":
        saved = json.loads((FIXTURES / "small_expected.json").read_text(encoding="utf-8"))
        assert response == saved
    else:
        baseline = response["zone_baselines"][0]
        assert (baseline["n"], baseline["late"], baseline["nonempty_days"], baseline["p_bar"]) == (2000, 200, 20, .1)
    required_reason = {"insufficient": "expected_late_below_5", "unreviewed": "baseline_unreviewed",
                       "current_day": "current_day_provisional"}.get(name)
    if required_reason:
        assert point["reasons"] == [required_reason], name


def write_json(path, value):
    with path.open("x", encoding="utf-8") as output:
        json.dump(value, output, indent=2, allow_nan=False)
        output.write("\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="New or empty destination; never overwrite existing files.")
    args = parser.parse_args()
    if args.output is None:
        destination = Path(tempfile.mkdtemp(prefix="qc-handoff-"))
    else:
        destination = args.output.expanduser().resolve()
        if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
            parser.error(f"Refusing to overwrite nonempty or non-directory destination: {destination}")
        destination.mkdir(parents=True, exist_ok=True)
    manifest = {"schema_version": "1.0", "notice": NOTICE, "synthetic": True,
                "verification": {"core_expectations_checked": True, "http_verified": False, "ui_verified": False},
                "files_relative_to": "manifest.json directory", "cases": []}
    for name, request, expected in cases():
        response = analyze_response(**request)
        check_expected(name, request, response, expected)
        write_json(destination / f"{name}.request.json", request)
        write_json(destination / f"{name}.expected.json", response)
        with (destination / f"{name}.records.csv").open("x", newline="", encoding="utf-8") as output:
            writer = csv.DictWriter(output, fieldnames=COLUMNS)
            writer.writeheader()
            writer.writerows({column: row.get(column) for column in COLUMNS} for row in request["records"])
        manifest["cases"].append({
            "name": name, "notice": NOTICE,
            "files": {kind: f"{name}.{filename}" for kind, filename in
                      (("request", "request.json"), ("expected", "expected.json"), ("records", "records.csv"))},
            "settings": {key: value for key, value in request.items() if key != "records"},
            "expected": {"primary_point": response["daily_points"][0] if response["daily_points"] else None,
                         "signal_count": len(response["signals"]), "signals": response["signals"],
                         "quality": response["quality"], "resolved_meta": response["meta"]},
        })
        point = response["daily_points"][0] if response["daily_points"] else None
        print(f"PASS {name}: {point['status'] if point else 'empty'}; rows={expected['accounting']}")
    write_json(destination / "manifest.json", manifest)
    print(f"PASS: {len(manifest['cases'])} SYNTHETIC cases exported; core expectations checked.")
    print("HTTP/UI verification: NOT PERFORMED.")
    print(f"Output: {destination}")


if __name__ == "__main__":
    main()
