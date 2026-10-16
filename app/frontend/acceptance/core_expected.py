"""Compute the core's expected responses for every data/ CSV (browser acceptance input).

Run from the repository root:
    python3 app/frontend/acceptance/core_expected.py OUT_DIR

For each run it writes OUT_DIR/<name>.first.json (nothing reviewed) and
<name>.final.json (after confirming the zones the page can confirm), plus
OUT_DIR/plan.json with the settings datasets.mjs enters into the page.
Settings come from each collection's codebook in data/.
"""

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from app.qc import analyze_response  # noqa: E402

REGULAR = dict(target_minutes=10, baseline_end="2026-09-21T00:00:00-04:00", as_of="2026-10-01T00:00:00-04:00")
EDGE = dict(REGULAR, as_of="2026-10-01T12:00:00-04:00")
NYC = dict(target_minutes=10, baseline_end="2026-08-21T00:00:00-04:00", as_of="2026-10-02T00:00:00-04:00")


def runs():
    """(csv path under data/, run name, settings, zones the codebook lists as reviewed or None for 'all usable')."""
    out = []
    for coll in ["jingyao_synthetic", "shifeng_synthetic"]:
        who = coll.split("_")[0]
        for f in ["stable", "zone_shift"]:
            for pr in ["P1", "P2"]:
                out.append((f"{coll}/{f}.csv", f"{who}-{f}-{pr}", dict(REGULAR, selected_priority=pr), ["A", "B"]))
    out.append(("jingyao_synthetic/edge_cases.csv", "jingyao-edge-P1", dict(EDGE, selected_priority="P1"), None))
    out.append(("shifeng_synthetic/edge_cases.csv", "shifeng-edge-P1", dict(EDGE, selected_priority="P1"),
                ["A", "B", "C", "NEW", "SHORT"]))
    out.append(("real_nyc_brooklyn_queens_sev2.csv", "hayden-nyc-2", dict(NYC, selected_priority="2"),
                ["BROOKLYN", "QUEENS"]))
    return out


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    plan = []
    for path, name, settings, listed in runs():
        rows = list(csv.DictReader(open(ROOT / "data" / path, encoding="utf-8")))
        first = analyze_response(records=rows, reviewed_zones=[], **settings)
        # The page only lets a usable baseline be confirmed (interfaces v1.0 section 10).
        confirmable = [b["zone"] for b in first["zone_baselines"] if b["status"] in ("ready", "unreviewed_baseline")]
        confirm = [z for z in confirmable if listed is None or z in listed]
        final = analyze_response(records=rows, reviewed_zones=confirm, **settings)
        (out / f"{name}.first.json").write_text(json.dumps(first))
        (out / f"{name}.final.json").write_text(json.dumps(final))
        plan.append(dict(name=name, csv=path, settings=settings, confirm=confirm,
                         listed_but_not_confirmable=[z for z in (listed or []) if z not in confirmable]))
        q = final["quality"]["selected_priority"]
        print(f"{name:24} {q['usable_rows']}/{q['excluded_rows']}/{q['total_rows']}  confirm={confirm}  signals={len(final['signals'])}")
    (out / "plan.json").write_text(json.dumps(plan, indent=1))


if __name__ == "__main__":
    main(sys.argv[1])
