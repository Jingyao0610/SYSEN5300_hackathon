"""Regenerate the frontend MOCK fixtures from the verified core.

Run from the repository root:  python3 app/frontend/scripts/make_fixtures.py

Every response in src/mock/ is the actual output of app.qc.analyze_response on
synthetic records (built with tests/fixtures/qc/qc_cases.py helpers), with only
meta.is_mock switched to true because the page did not get it through the API.
Each scenario's records are also written as CSV so the same input can be
imported in real mode and compared with the API.
"""

import csv
import json
import sys
from itertools import combinations
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tests" / "fixtures" / "qc"))

from app.qc import analyze_response  # noqa: E402
from qc_cases import baseline_records, day_records, record  # noqa: E402

OUT = ROOT / "app" / "frontend" / "src" / "mock"
COLUMNS = ["incident_id", "zone", "priority", "dispatched_at", "on_scene_at"]


def demo():
    """K1 (zone A, n=100) and K3 (zone B, n=400) points plus every no-verdict state."""
    rows = baseline_records(zone="A")
    for day, n, late in [
        ("2026-09-21", 100, 9), ("2026-09-22", 100, 1), ("2026-09-23", 100, 19),
        ("2026-09-24", 100, 20), ("2026-09-25", 100, 25), ("2026-09-26", 100, 0),
        ("2026-09-27", 100, 14), ("2026-09-28", 49, 5),  # n=49: expected late 4.9 < 5
        ("2026-09-29", 50, 5),                            # n=50: eligible
        ("2026-09-30", 100, 20),                          # current day at as_of: provisional
    ]:
        rows += day_records(day, n, late, zone="A")
    rows += baseline_records(zone="B")
    for day, late in [("2026-09-21", 21), ("2026-09-22", 22), ("2026-09-23", 58), ("2026-09-24", 59)]:
        rows += day_records(day, 400, late, zone="B")
    # Zone C: only 12 baseline days -> baseline_fewer_than_20_days
    rows += baseline_records([(20, 2)] * 12, start="2026-09-09", zone="C")
    rows += day_records("2026-09-22", 20, 4, zone="C")
    # Row-level errors and another priority, so overall and selected counts differ
    rows += [
        record("DUP-1", dispatched_at="2026-09-22T10:00:00-04:00"),
        record("DUP-1", dispatched_at="2026-09-22T11:00:00-04:00"),
        record("REV-1", dispatched_at="2026-09-23T10:00:00-04:00", on_scene_at="2026-09-23T09:50:00-04:00"),
        record("NAIVE-1", dispatched_at="2026-09-24T10:00:00", on_scene_at="2026-09-24T10:08:00-04:00"),
        record("MISS-1", dispatched_at="2026-09-25T10:00:00-04:00", on_scene_at=""),
        record("FUT-1", dispatched_at="2026-10-02T10:00:00-04:00"),
        record("P2-1", priority="P2", dispatched_at="2026-09-21T10:00:00-04:00"),
        record("P2-2", priority="P2", dispatched_at="2026-09-21T10:00:00-04:00", on_scene_at="soon"),
    ]
    return rows, {"as_of": "2026-09-30T18:00:00-04:00"}, ["A", "B"]


def small():
    req = json.loads((ROOT / "tests" / "fixtures" / "qc" / "small_request.json").read_text())
    return req["records"], {"as_of": req["as_of"]}, []


def empty():
    rows = [
        record("E-1", on_scene_at=""),
        record("E-2", dispatched_at="2026-09-21T10:00:00"),
    ]
    return rows, {"as_of": "2026-10-01T00:00:00-04:00"}, []


SCENARIOS = {
    "demo": ("All states: K1/K3 signals, insufficient, unreviewed, provisional, row errors", demo),
    "small": ("Interface example: 3 rows, 2 usable, 1 excluded", small),
    "empty": ("No usable records", empty),
}


def main():
    index = {}
    for name, (label, build) in SCENARIOS.items():
        rows, extra, reviewable = build()
        settings = {
            "target_minutes": 10,
            "selected_priority": "P1",
            "baseline_end": "2026-09-21T00:00:00-04:00",
            **extra,
        }
        responses = {}
        for k in range(len(reviewable) + 1):
            for zones in combinations(reviewable, k):
                key = ",".join(sorted(zones))
                res = analyze_response(records=rows, reviewed_zones=list(zones), **settings)
                res["meta"]["is_mock"] = True
                responses[key] = res
        with open(OUT / f"{name}.csv", "w", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(COLUMNS)
            for r in rows:
                w.writerow(["" if r.get(c) is None else r[c] for c in COLUMNS])
        (OUT / f"{name}.responses.json").write_text(json.dumps(responses, separators=(",", ":")))
        index[name] = {"label": label, "settings": settings}
        print(f"{name}: {len(rows)} rows, {len(responses)} response variant(s)")
    (OUT / "scenarios.json").write_text(json.dumps(index, indent=2) + "\n")


if __name__ == "__main__":
    main()
