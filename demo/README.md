# Synthetic-data demonstration — Jingyao / H-05 text

This script uses actual local core/API results, with mock mode disabled. H-05 remains **pending independent playback by Hayden, live deployment verification and Pingchuan's recording**. No live URL or video is claimed. Dataset checks are in [VERIFICATION.txt](../data/VERIFICATION.txt).

## Start and reproduce

Follow [app setup](../app/README.md), then from the repository root:

```bash
bash app/testme.sh
```

Open http://127.0.0.1:5173 (frontend), http://127.0.0.1:8000/docs (API). In another activated terminal:

```bash
python data/verify.py
python data/verify.py --request stable > /tmp/jingyao-stable.request.json
curl --fail-with-body -H 'Content-Type: application/json' --data-binary @/tmp/jingyao-stable.request.json http://127.0.0.1:8000/analyze
python data/verify.py --request zone_shift > /tmp/jingyao-shift.request.json
curl --fail-with-body -H 'Content-Type: application/json' --data-binary @/tmp/jingyao-shift.request.json http://127.0.0.1:8000/analyze
python data/verify.py --request edge_cases > /tmp/jingyao-edge.request.json
curl --fail-with-body -H 'Content-Type: application/json' --data-binary @/tmp/jingyao-edge.request.json http://127.0.0.1:8000/analyze
```

The request exporter calls no statistics and writes just JSON. Repeat with `--request stable P2` or `--request zone_shift P2` to check P2. API responses must match the verifier; an HTTP 200 alone is not acceptance.

## Recording sequence (approximately 2–3 minutes)

1. **0:00–0:25 / user and coverage.** Say: “This tool helps dispatch supervisors review recorded completed responses. All demo data are synthetic. Ten minutes is an illustrative operational target.” On Data & Settings, import `data/stable.csv`, select P1, target 10, cutoff `2026-09-21T00:00:00-04:00`, historical as-of `2026-10-01T00:00:00-04:00`. If datetime controls omit offsets, enter the corresponding New York local values. Run analysis.
2. **0:25–0:55 / stable.** Navigate to Zone Monitoring; inspect daily baseline rates, sample sizes and weekday summaries. Confirm A/B baselines reviewed and rerun as the UI requires. Expect imported 12000/12000/0, selected P1 6000/6000/0. A baseline is 291/2000 = 14.55%; B is 305/2000 = 15.25%. Monitoring n=100 for each zone/day; no crossing signals. Explain: “No crossing signal found does not prove a process is in control or meeting its operational target.”
3. **0:55–1:35 / planted shift.** Return to data, import `zone_shift.csv`, reapply the same settings, run, inspect and reconfirm A/B baselines. Prior confirmations must clear on import. Baselines stay identical. A/P1 high signals occur September **22, 23, 25, 26, 27, 28, 29, 30**, with late counts **41, 30, 31, 37, 43, 33, 39, 42** out of 100. A's limits are approximately **3.971873%–25.128127%**. September 21 and 24 do not signal. B/P1 and both P2 zones have no crossing signals. Explain: “Only the A/P1 monitoring generating probability changed; signals suggest investigation, not a cause or zone-quality ranking.”
4. **1:35–1:55 / incidents.** Select A and September 22, open Incident Review, and sort by response minutes. Expect **41** late incidents for that date/zone. Clear filters and return to the chart. Export CSV from data and reimport to demonstrate session-based reuse; reapply settings and review because import invalidates old results.
5. **1:55–2:40 / quality and boundaries.** Import `edge_cases.csv`, P1, target 10, same cutoff, but set historical as-of **October 1, 12:00 New York**. Review the synthetic groups; run and inspect exclusions and monitoring. Expect **5118/5107/11 overall**, selected P1 **5117/5107/10** plus one unassigned-priority row. EDGE September 21 has n=49 and is insufficient. October 1 has 20/100 = 20%, status `provisional_current_day`, no formal signal. SHORT has 19 baseline days; ZERO/ONE are degenerate; NEW has no baseline. Explain: “Invalid rows remain visible, and insufficient or current-day observations are not labeled normal.”
6. **2:40–3:00 / boundary explanation.** `SYN-equal` is on time at 10 minutes; `SYN-plus-second` is late at 10.0166667. `SYN-midnight` is 10 minutes and belongs to September 30. The exact-cutoff response belongs to monitoring. Both duplicate-ID rows are excluded. Close with the recorded-completed-response coverage limitation.

## Acceptance handoff

Jingyao supplied text and actual complete core/API comparisons for stable P1/P2, shift P1/P2 and edge P1. The Python suite passed **175 tests, one upstream deprecation warning**. `data/verify.py` repeats the byte reproduction and boundary checks.

Pingchuan: verify these numbers and clear-state behavior in the real browser, then record into `demo/recordings/` or provide an accessible link. Hayden: after H-06, independently follow this script on the real deployment and record tested commit, numeric comparisons, discrepancies and recording URL. Formal H-05/H-07 acceptance is pending those independent steps; Shifeng owns ledger updates. Team coordination notes are in [HANDOFF.md](HANDOFF.md).
