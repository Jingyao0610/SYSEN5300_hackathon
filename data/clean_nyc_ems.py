"""Clean a raw NYC EMS Incident Dispatch extract into our five-column input.

Source: NYC Open Data "EMS Incident Dispatch Data" (dataset 76xm-jjuj), City of New York / FDNY EMS CAD.
Raw extract: borough in (BROOKLYN, QUEENS), initial_severity_level_code = 2,
incident_datetime in [2026-08-01, 2026-10-01) local New York time.

Usage:
    python data/clean_nyc_ems.py RAW.csv data/real_nyc_brooklyn_queens_sev2.csv

Cleaning rules, applied in this order (each dropped row is counted under its FIRST failing rule):
  R1  FDNY marks the incident response time valid      valid_incident_rspns_time_indc == 'Y'
  R2  both timestamps present                           first_assignment_datetime, first_on_scene_datetime
  R3  normal completed dispatch                         disposition != CANCEL, standby != Y, reopen != Y
  R4  positive dispatch-to-scene time                   on_scene > assignment (0-minute arrivals dropped)
  R5  dispatch date inside the study window             2026-08-01 .. 2026-09-30 (New York local date)
  R6  unique incident_id                                first occurrence kept
Long response times are NOT removed: extreme delays are exactly what the tool must surface.
Timestamps in the source carry no UTC offset; America/New_York is attached (-04:00 in this window).
"""
import csv
import sys
from collections import Counter
from datetime import date, datetime
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
START, END = date(2026, 8, 1), date(2026, 9, 30)
OUT = ["incident_id", "zone", "priority", "dispatched_at", "on_scene_at"]


def parse(s):
    return datetime.fromisoformat(s.split(".")[0]).replace(tzinfo=NY)


def main(raw_path, out_path):
    raw = list(csv.DictReader(open(raw_path, encoding="utf-8")))
    dropped, seen, kept = Counter(), set(), []
    for r in raw:
        if r["valid_incident_rspns_time_indc"] != "Y":
            dropped["R1 response time not valid (FDNY flag)"] += 1; continue
        if not r["first_assignment_datetime"] or not r["first_on_scene_datetime"]:
            dropped["R2 missing assignment or on-scene time"] += 1; continue
        if r["incident_disposition_code"] == "CANCEL" or r["standby_indicator"] == "Y" or r["reopen_indicator"] == "Y":
            dropped["R3 cancelled / standby / reopened incident"] += 1; continue
        d, s = parse(r["first_assignment_datetime"]), parse(r["first_on_scene_datetime"])
        if s <= d:
            dropped["R4 on-scene not after assignment"] += 1; continue
        if not (START <= d.date() <= END):
            dropped["R5 dispatch date outside study window"] += 1; continue
        if r["incident_id"] in seen:
            dropped["R6 duplicate incident_id"] += 1; continue
        seen.add(r["incident_id"])
        kept.append({"incident_id": r["incident_id"], "zone": r["borough"],
                     "priority": r["initial_severity_level_code"],
                     "dispatched_at": d.isoformat(), "on_scene_at": s.isoformat()})
    kept.sort(key=lambda x: (x["dispatched_at"], x["incident_id"]))
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=OUT); w.writeheader(); w.writerows(kept)
    print(f"raw rows: {len(raw)}")
    for k in sorted(dropped): print(f"  dropped {k}: {dropped[k]}")
    print(f"kept rows: {len(kept)}  -> {out_path}")
    print("kept by zone:", dict(Counter(k['zone'] for k in kept)))
    assert len(raw) == len(kept) + sum(dropped.values())


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
