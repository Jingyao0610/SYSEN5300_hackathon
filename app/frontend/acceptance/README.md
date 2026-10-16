# Browser acceptance (H-04)

Checks that the real page, the real API and `app/qc.py` agree, with mock mode
off. The scripts drive headless Chrome through the same steps a supervisor
takes: import a CSV, enter the settings, run the analysis, confirm baselines,
read the charts and tables, open Incident Review, export the CSV. They compare
every `/analyze` response the browser receives with the core's own result.

## Results (commit `e189c4b`, `main`, started with `bash app/testme.sh`)

| Script | What | Result |
|---|---|---|
| [`datasets.mjs`](datasets.mjs) | All 7 `data/` CSVs with each codebook's settings, plus P2 for the four regular synthetic files: 11 runs | **110/110** — [results](results/datasets_e189c4b.txt) |
| [`handoff.mjs`](handoff.mjs) | Shifeng's 9 core handoff cases (K1/K3 high and boundary, insufficient, unreviewed, current day, 3/2/1, empty) plus an extra-CSV-column round trip | **70/70** — [results](results/handoff_e189c4b.txt) |

### Live site after the dashboard redesign (`9d5ca9e`)

The redesigned dashboard (light and dark themes) was redeployed and retested live, with no local servers:
- `datasets.mjs`: **110/110** ([results](results/live_datasets_9d5ca9e.txt));
- `handoff.mjs`: **70/70** ([results](results/live_handoff_9d5ca9e.txt)).

The scripts were updated for the new layout:
- the zone is selected with `select[name=zone]`;
- signals are counted from the "Days to review" feed;
- the chart shows monitoring days by default.

They also block browser downloads.

### Live site (Posit Connect), first deployment

The deployed page and API, built from `a08ece2`, were tested with nothing running locally, so every request went from the live page to the live API. Both suites pass with the same expected results:
- `datasets.mjs`: **110/110** ([results](results/live_datasets_a08ece2.txt));
- `handoff.mjs`: **70/70** ([results](results/live_handoff_a08ece2.txt)).

Also confirmed:
- the live page answers HTTP 200 without logging in;
- the live bundle contains no mock code and calls the deployed API, not `127.0.0.1`;
- the live API's `/health` reports `"analysis_mode":"real"`.

The deployment URLs are not written here; use `FRONTEND_URL` and `API_URL` to rerun.

Per dataset run, `datasets.mjs` checks:
- **import:** the row count shown on the page;
- **analysis:** the responses before and after confirming baselines are identical to the core's;
- **coverage counts** on the page;
- **signals listed**;
- **table rows:** every displayed monitoring row's n, late, rate, limits and status;
- **charts:** one marker per day that has a rate, the limits for each day, and the p̄ line;
- **Incident Review:** the length of the late-response list;
- **export:** the exported CSV is identical to the imported file;
- **mock and errors:** no MOCK banner and no page errors.

Formal signals: Jingyao `zone_shift` P1 8, Shifeng `zone_shift` P1 10, NYC
priority 2 8 (6 Brooklyn, 2 Queens); every `stable`, P2 and edge run 0.

**Edge-case review note:** Shifeng's `edge_cases` settings list B, C, NEW and SHORT as reviewed. Their baselines are not usable, so the page does not offer the confirm checkbox for them (`docs/interfaces.md` section 10). The comparison therefore uses the zones the page can confirm. Verdicts are unaffected: those zones stay `insufficient_data`.

Screenshots: [zone_shift zone A, 8 high days](screenshots/jingyao_zone_shift_P1_zoneA.png) ·
[edge-case coverage](screenshots/jingyao_edge_cases_coverage.png) ·
[real NYC, Brooklyn](screenshots/nyc_real_brooklyn.png) ·
[K3 exactly on the limit: no signal](screenshots/handoff_k3_boundary.png)

## Run it again

Needs Python 3.10+ with `app/requirements.txt`, Node 20+, and Google Chrome.
From the repository root:

```bash
npm --prefix app/frontend ci
npm --prefix app/frontend install --no-save puppeteer-core@23   # drives your installed Chrome
bash app/testme.sh                                             # leave running; new terminal for the rest

python3 app/frontend/acceptance/core_expected.py /tmp/acc/expected
node app/frontend/acceptance/datasets.mjs /tmp/acc/expected /tmp/acc/datasets "$(git rev-parse --short HEAD)"

python3 tests/fixtures/qc/export_handoff.py --output /tmp/acc/handoff
node app/frontend/acceptance/handoff.mjs /tmp/acc/handoff /tmp/acc/handoff-out "$(git rev-parse --short HEAD)"
```

Each script writes `RESULTS.txt` to its output folder and exits non-zero on a failure.

**Environment variables (optional):**
- `CHROME_PATH`: the path to Chrome. The default is the macOS location.
- `FRONTEND_URL`: the page to test. The default is `http://127.0.0.1:5173/`.
- `API_URL`: the API, used by `handoff.mjs` only. The default is `http://127.0.0.1:8000`.
- `SCREENSHOT_RUNS`: which `datasets.mjs` runs save screenshots.
