# H-04 published dataset acceptance — 2026-10-16

Source: team main `e189c4b630f219435fcc89b8d216c41cabfde26a`.
No dataset, statistical core, frontend, ledger or deployment configuration was edited.

## Actual HTTP acceptance

Run from the repository root with the declared backend dependencies installed:

```bash
python tests/fixtures/api/verify_datasets.py --report tests/fixtures/api/DATASET_ACCEPTANCE.json
```

The runner starts and stops its own temporary local API. Optional `--endpoint` checks an
existing complete analysis endpoint without recording its address. It does not deploy.
Each successful case compares the entire decoded JSON with the reviewed core, first with
no reviewed zones, then with confirmed zones and the returned UTC `meta.as_of`, then on replay.
Exact settings, CSV SHA256 hashes, baselines and signal details are in the JSON report.

| Collection / case | Overall total / usable / excluded | Formal signals |
|---|---|---|
| Jingyao stable, P1 / P2 | 12000 / 12000 / 0 | 0 / 0 |
| Jingyao shifted, P1 / P2 | 12000 / 12000 / 0 | 8 / 0 |
| Jingyao edge, P1 | 5118 / 5107 / 11 | 0 |
| Jingyao edge, P2 | Expected HTTP 422: category absent | No analysis |
| Shifeng stable, P1 / P2 | 12000 / 12000 / 0 | 0 / 0 |
| Shifeng shifted, P1 / P2 | 12000 / 12000 / 0 | 10 / 0 |
| Shifeng edge, P1 / P2 | 2934 / 2922 / 12 | 0 / 0 |
| Real NYC, priority string `"2"` | 26209 / 26209 / 0 | 8 |

Actual command conclusion:

```text
PASS 12 successful combinations + 1 expected rejection; 37 live HTTP calls; 7 CSVs unchanged
```

## Browser evidence executed in this session

The application was started with `bash app/testme.sh` using the installed Python environment,
with mock mode disabled. `data/shifeng_synthetic/edge_cases.csv` was imported through the actual
file picker. Settings: P1, target 10 minutes, New York baseline cutoff September 21, and
October 1 at noon as the explicit observation time. Baseline A was confirmed through the checkbox.

Observed page results, matching the core/API case:

- Overall 2934 total / 2922 usable / 12 excluded; selected P1 2932 / 2922 / 10.
- A baseline: 200 late / 2000, 20 days, rate 10%; unreviewed before confirmation and reviewed afterward.
- September 21: 19/100, limits 1% and 19%, no signal after confirmation.
- September 22 and September 30: n=1, null limits, insufficient data.
- September 23 and September 24: n=0, null rate, no usable observations.
- October 1: 20/100, provisional at noon, no formal signal.
- Observation time remained October 1 noon after baseline confirmation.
- Incident Review, zone A: 240 late responses shown.

Screenshots: `DATASET_BROWSER_OVERVIEW.jpg` and `DATASET_BROWSER.jpg` (full page).
The real NYC CSV also imported successfully in Chrome with 26209 rows and priority `2`,
but that import alone is not a completed real-data browser analysis.

## Limits and handoff

All seven CSVs passed actual HTTP/core comparisons. Full browser analysis of every CSV is not
claimed: a large-file request failed in the in-app browser, and Chrome automation was constrained
by local file permissions and date-input handling. The cause of the large-file browser failure
was not established; the successful HTTP tests do not resolve that browser observation.
Pingchuan should confirm the large synthetic and real-data browser flows in the normal browser.

Zero exclusions for the real CSV means zero additional app exclusions after upstream cleaning.
Its incident-level first-assignment-to-first-arrival metric differs from synthetic response-level
records. Test baseline confirmations do not establish operational stability or independence.

This is H-04 acceptance evidence, not a deployment or H-02 canonical-selection claim. Shifeng
maintains CONTRACT.yaml and decides final task check-in using the team's acceptance evidence.
