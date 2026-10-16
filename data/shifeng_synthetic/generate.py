"""Generate local SYNTHETIC demonstration CSVs; never overwrite differing files."""

import argparse
import csv
from datetime import date, datetime, timedelta
import io
import json
from pathlib import Path
import random

SEED = 5300
COLUMNS = ["incident_id", "zone", "priority", "dispatched_at", "on_scene_at"]
DATA_DIR = Path(__file__).resolve().parent


def record(identifier, zone, dispatch, seconds, priority="P1"):
    return {"incident_id": identifier, "zone": zone, "priority": priority,
            "dispatched_at": dispatch.isoformat(),
            "on_scene_at": (dispatch + timedelta(seconds=seconds)).isoformat()}


def random_pair():
    """Share every random draw; only the A/P1 monitoring late threshold changes."""
    rng = random.Random(SEED)
    stable, shifted = [], []
    for day_number in range(30):
        day = date(2026, 9, 1) + timedelta(days=day_number)
        start = datetime.fromisoformat(f"{day}T08:00:00-04:00")
        for zone in ("A", "B"):
            for priority in ("P1", "P2"):
                for index in range(100):
                    draw = rng.random()
                    dispatch = start + timedelta(seconds=rng.randint(0, 12 * 3600))
                    on_time_seconds = rng.randint(120, 600)
                    late_seconds = rng.randint(601, 1800)
                    identifier = f"SYN-R-{day:%Y%m%d}-{zone}-{priority}-{index:03d}"
                    stable_seconds = late_seconds if draw < .15 else on_time_seconds
                    changed_group = zone == "A" and priority == "P1" and day_number >= 20
                    threshold = .35 if changed_group else .15
                    shift_seconds = late_seconds if draw < threshold else on_time_seconds
                    stable.append(record(identifier, zone, dispatch, stable_seconds, priority))
                    shifted.append(record(identifier, zone, dispatch, shift_seconds, priority))
    return stable, shifted


def edge_group(zone, day, n, late, tag):
    start = datetime.fromisoformat(f"{day}T08:00:00-04:00")
    return [record(f"SYN-E-{tag}-{zone}-{day.replace('-', '')}-{index:03d}", zone,
                   start + timedelta(seconds=index), 720 if index < late else 480)
            for index in range(n)]


def edge_records():
    rows = []
    for index in range(20):
        day = (date(2026, 9, 1) + timedelta(days=index)).isoformat()
        rows.extend(edge_group("A", day, 100, 10, "BASE"))
        rows.extend(edge_group("B", day, 10, 0, "BASE"))
        rows.extend(edge_group("C", day, 10, 10, "BASE"))
        if index < 19:
            rows.extend(edge_group("SHORT", day, 10, 1, "BASE"))
    boundary = edge_group("A", "2026-09-21", 100, 19, "BOUNDARY")
    for index, identifier, seconds in ((0, "SYN-E-TARGET-PLUS-ONE-SECOND", 601),
                                        (19, "SYN-E-EXACT-TARGET", 600)):
        dispatch = datetime.fromisoformat(boundary[index]["dispatched_at"])
        boundary[index] = record(identifier, "A", dispatch, seconds)
    rows.extend(boundary)
    rows.extend(edge_group("A", "2026-09-22", 1, 1, "ONE"))
    rows.extend(edge_group("A", "2026-10-01", 100, 20, "CURRENT"))
    rows.append(record("SYN-E-CROSS-MIDNIGHT", "A",
                       datetime.fromisoformat("2026-09-30T23:55:00-04:00"), 600))
    for zone, n, late in (("B", 10, 0), ("C", 10, 10), ("SHORT", 100, 20), ("NEW", 10, 2)):
        rows.extend(edge_group(zone, "2026-09-21", n, late, "MONITOR"))

    # Every bad row retains a synthetic ID. Blank fields are deliberate CSV cells.
    bad_cases = [
        ("EXCLUDED-DAY", {"dispatched_at": "2026-09-23T09:00:00-04:00", "on_scene_at": ""}),
        ("MISSING-ZONE", {"zone": ""}),
        ("MISSING-PRIORITY", {"priority": ""}),
        ("MISSING-DISPATCH", {"dispatched_at": ""}),
        ("MALFORMED-ARRIVAL", {"on_scene_at": "not-a-timestamp"}),
        ("NAIVE-ARRIVAL", {"on_scene_at": "2026-09-24T09:08:00"}),
        ("REVERSED", {"on_scene_at": "2026-09-24T08:59:59-04:00"}),
        ("FUTURE-DISPATCH", {"dispatched_at": "2026-10-02T09:00:00-04:00",
                             "on_scene_at": "2026-10-02T09:08:00-04:00"}),
        ("FUTURE-ARRIVAL", {"on_scene_at": "2026-10-01T12:00:01-04:00"}),
        ("INVALID-OFFSET", {"on_scene_at": "2026-09-24T09:08:00+00:60"}),
        ("DUPLICATE", {}),
        ("DUPLICATE", {"priority": "P2"}),
    ]
    for label, changes in bad_cases:
        row = record(f"SYN-E-{label}", "A", datetime.fromisoformat("2026-09-24T09:00:00-04:00"), 480)
        row.update(changes)
        rows.append(row)
    return rows


def settings_document():
    common = {"target_minutes": 10, "selected_priority": "P1",
              "baseline_end": "2026-09-21T00:00:00-04:00", "reviewed_zones": ["A", "B"],
              "as_of": "2026-10-01T00:00:00-04:00"}
    return {
        "schema_version": "1.0", "synthetic": True, "seed": SEED, "timezone": "America/New_York",
        "notice": "Entirely invented demonstration records. No patient, call, or third-party dataset is used.",
        "generation": {
            "scope": "Illustrative volumes and distributions, not empirical service assumptions.",
            "random_engine": "Python standard-library random.Random(5300)",
            "days": ["2026-09-01", "2026-09-30"], "zones": ["A", "B"], "priorities": ["P1", "P2"],
            "responses_per_zone_priority_day": 100, "baseline_dates": ["2026-09-01", "2026-09-20"],
            "dispatch_window_local": ["08:00:00", "20:00:00"],
            "duration_seconds_inclusive": {"on_time": [120, 600], "late": [601, 1800]},
            "stable_late_probability": .15, "shifted_late_probability": .35,
            "shift_scope": "Only A/P1 dispatched September 21-30; only arrival timestamps can differ.",
            "coupling": "One latent uniform draw and both candidate durations per row are shared by stable and shift.",
            "seed_policy": "Seed fixed before inspection; retain any naturally occurring false alarms.",
            "edge_policy": "Deterministic hand-counted fixtures; random generation rules do not apply to edge_cases.csv.",
        },
        "datasets": {
            "stable.csv": {"description": "Unchanged generating conditions; false alarms remain possible.",
                           "available_priorities": ["P1", "P2"], "settings": common},
            "zone_shift.csv": {"description": "Same baseline and all other records; A/P1 monitoring probability rises to .35.",
                               "available_priorities": ["P1", "P2"], "settings": dict(common)},
            "edge_cases.csv": {
                "description": "Boundary, sparse, degenerate, current-day, new-zone, and invalid-row fixtures.",
                "available_priorities": ["P1", "P2"],
                "priority_note": "P2 appears only on one excluded duplicate copy; selecting P2 returns empty analysis with coverage.",
                "settings": {**common, "reviewed_zones": ["A", "B", "C", "NEW", "SHORT"],
                             "as_of": "2026-10-01T12:00:00-04:00"},
                "inspectable_ids": ["SYN-E-EXACT-TARGET", "SYN-E-TARGET-PLUS-ONE-SECOND",
                                    "SYN-E-CROSS-MIDNIGHT", "SYN-E-EXCLUDED-DAY", "SYN-E-DUPLICATE"],
            },
        },
    }


def csv_bytes(rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def write_bundle(destination):
    destination = Path(destination).resolve()
    stable, shifted = random_pair()
    datasets = {"stable.csv": stable, "zone_shift.csv": shifted, "edge_cases.csv": edge_records()}
    payloads = {name: csv_bytes(rows) for name, rows in datasets.items()}
    payloads["settings.json"] = (json.dumps(settings_document(), indent=2, allow_nan=False) + "\n").encode("utf-8")
    # Check every collision first; never partially replace an existing dataset.
    for name, content in payloads.items():
        path = destination / name
        if path.exists() and (not path.is_file() or path.read_bytes() != content):
            raise FileExistsError(f"Refusing to overwrite nonmatching file: {path}")
    destination.mkdir(parents=True, exist_ok=True)
    for name, content in payloads.items():
        path = destination / name
        if not path.exists():
            with path.open("xb") as output:
                output.write(content)
    return {name: len(rows) for name, rows in datasets.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DATA_DIR, help="Destination; differing files are never overwritten.")
    args = parser.parse_args()
    try:
        counts = write_bundle(args.output)
    except FileExistsError as error:
        parser.error(str(error))
    for name, count in counts.items():
        print(f"PASS {name}: {count} SYNTHETIC records generated or already identical.")
    print(f"Output: {args.output.resolve()}")


if __name__ == "__main__":
    main()
