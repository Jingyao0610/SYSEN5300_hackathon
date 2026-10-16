# Emergency Response API — H-04 starter handoff

For dispatch supervisors reviewing **recorded completed responses**. The API calls the verified
`app/qc.py` daily p-chart analysis and returns interface v1.0 unchanged. All calculations live
in that core. An individual late response does not imply a statistical signal; missing records
can bias the imported completed-response rates. This service has no database or mock fallback.

From the repository root, use Python 3.12 or 3.13. The local backend was verified
on Python 3.13; frontend dependencies were installed with Node.js 24.22.0:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r app/requirements.txt
npm --prefix app/frontend ci
bash app/testme.sh
```

Open the frontend at `http://127.0.0.1:5173`, or interactive API docs at
`http://127.0.0.1:8000/docs`. The startup script forces real API mode. The frontend uses interface v1.0; startup alone does not establish H-04 completion.
For API only, run `BACKEND_ONLY=1 bash app/testme.sh`. Optional environment variables:
`PYTHON_BIN`, `API_PORT`, `FRONTEND_PORT`.

```bash
python -m pytest tests
curl http://127.0.0.1:8000/health
curl -H 'Content-Type: application/json' --data-binary @tests/fixtures/qc/small_request.json http://127.0.0.1:8000/analyze
```

`POST /analyze` accepts `records`, positive numeric `target_minutes`, string
`selected_priority`, New York midnight `baseline_end`, optional `reviewed_zones` (default `[]`),
and optional offset-aware `as_of` (default one server-clock instant). Explicit nulls, future
`as_of`, extra request fields and malformed overall inputs return 422. Row-level errors remain
200 with exclusions. All schema fields and units are in `docs/interfaces.md`.

`GET /health` returns `{"status":"ok","schema_version":"1.0","analysis_mode":"real"}`.
Errors use `{"error":{"code":"invalid_request","message":"…","fields":["target_minutes"]}}`;
503 uses `analysis_unavailable`, and unexpected runtime failures use generic `analysis_failed` (500).
No traceback or imported data are returned on runtime errors. CORS permits public demo clients.

Deployment belongs to Hayden: `bash app/manifestme.sh` writes his manifest;
`bash app/deployme.sh` publishes using configured rsconnect credentials/environment.
These scripts require separately installed `rsconnect-python` and are not run by startup.
Keep credentials outside source and chat. The flat deployment entry point is `app:app`.

This README incorporates the backend starter handoff and Jingyao’s data/demo documentation.
Adapted from `demos/fastapi/`; HTTP validation follows
[FastAPI error handlers](https://fastapi.tiangolo.com/tutorial/handling-errors/) and
[Pydantic strict validation](https://docs.pydantic.dev/latest/concepts/strict_mode/).

## Dashboard and demonstration — H-07 documentation contribution

Use [root setup](../README.md) for fresh-clone installation. The UI has **Data & Settings**, **Zone Monitoring**, and **Incident Review**. Import a CSV to replace the session, or add a completed response using Save/Cancel. Choose priority, target, exclusive baseline cutoff and historical as-of; run analysis. Inspect baseline daily/weekday diagnostics, confirm each reviewed zone, then inspect daily points and incidents. Filter by zone/date, sort incidents, clear filters and return to the chart. Export CSV to retain browser-session records. Imports, edits and settings changes clear stale analysis and confirmations.

All views use America/New_York and show analysis time, target and quality counts. Unreviewed, insufficient and provisional current-day states must remain distinct. The UI parses/exports and displays data; all durations, exclusions and statistical results come from `app/qc.py`. Full input/parameter coverage is in the [root README](../README.md) and [interface](../docs/interfaces.md).

`POST /analyze` returns `meta`, `quality`, `excluded_records`, `zone_baselines`, `daily_points`, `signals`, and `late_incidents`. Daily proportions use 0–1 units in JSON and percentages on screen; uncomputable quantities are null. No automatic example-data fallback is allowed.

Run [the three-dataset demo](../demo/README.md) using its fixed cutoffs. `python data/verify.py` performs complete API/core comparisons using the actual FastAPI TestClient; `python -m pytest tests` checks the existing core/API suite. Local result for this contribution: 175 passed, one upstream deprecation warning. The upstream interface records Pingchuan's browser campaign; this contribution's H-02 dataset browser verification remains pending.

Live API/frontend access and the final recording are pending Hayden/Pingchuan handoff. H-07 independent fresh-clone acceptance is also pending. No credential or actual course-server configuration belongs in this document.
