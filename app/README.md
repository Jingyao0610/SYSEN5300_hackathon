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
`http://127.0.0.1:8000/docs`. The startup script forces real API mode. Frontend schema migration
and K1/K3 browser parity are a separate Pingchuan handoff; startup alone does not establish H-04 completion.
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

This initial backend README is handed to Jingyao for H-07 completion and demo documentation.
Adapted from `demos/fastapi/`; HTTP validation follows
[FastAPI error handlers](https://fastapi.tiangolo.com/tutorial/handling-errors/) and
[Pydantic strict validation](https://docs.pydantic.dev/latest/concepts/strict_mode/).
