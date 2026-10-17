# Emergency Response application

The FastAPI service transports requests to the plain `app/qc.py` statistical function. React
provides Data & Settings, Zone Monitoring, Incident Review and an optional Live Simulation.
The [root README](../README.md) explains the user, method, all inputs, assumptions and datasets;
the [walkthrough](../demo/README.md) gives fixed settings and actual results.

## Installation and one-command startup

From the repository root, use Python 3.12/3.13, Node.js 22+ compatible with Vite 6, npm and Bash:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r app/requirements.txt
npm --prefix app/frontend ci
bash app/testme.sh
```

Open http://127.0.0.1:5173/ for the dashboard; http://127.0.0.1:8000/docs for API docs.
For an empty UI, use http://127.0.0.1:5173/?example=none; the default first visit loads an example.
Keep the activated environment for subsequent runs of `bash app/testme.sh`. Ctrl-C stops both
child processes. All commands below run from the repository root unless stated otherwise.

For Windows Git Bash, create the environment with `py -3.12 -m venv .venv`, activate using
`source .venv/Scripts/activate`, install the same dependencies, then set `PYTHON_BIN=python` on
startup if `python3` is unavailable. Bash, Node and npm must be on PATH. Windows execution has
not been newly checked by this documentation contribution.

| Startup variable | Default | Purpose |
|---|---|---|
| `PYTHON_BIN` | `python3` | Interpreter with installed backend requirements |
| `API_PORT` | `8000` | Loopback Uvicorn port |
| `FRONTEND_PORT` | `5173` | Loopback Vite port; occupied ports fail rather than silently change |
| `BACKEND_ONLY` | `0` | Set to `1` to start just the API |

Examples:

```bash
BACKEND_ONLY=1 bash app/testme.sh
# Or start the full tool on other local ports:
API_PORT=8001 FRONTEND_PORT=5174 bash app/testme.sh
```

Full startup sets `VITE_API_URL` to the local API and `VITE_MOCK=0`. Development MOCK mode is
separate (`npm --prefix app/frontend run dev:mock`); it is visibly labeled and unsuitable for
formal demonstrations. Real mode has no automatic mock fallback after failure.

## API and function reference

Live API base: **https://connect.systems-apps.com/content/60e1dac5-58e2-42d7-b83d-4f95318a4a31/**.
Append paths below to that base, retaining the content prefix. Local base is `http://127.0.0.1:8000`.

| Method/path | Result |
|---|---|
| `GET /` | Service message and docs path |
| `GET /health` | `{"status":"ok","schema_version":"1.0","analysis_mode":"real"}` when the core is available; mode is `unavailable` otherwise |
| `POST /analyze` | Core analysis for imported records and six-field request below |
| `GET /docs`, `/redoc` | Interactive Swagger UI and ReDoc |
| `GET /openapi.json` | OpenAPI schema |
| `GET /__docs__/` | Compatibility redirect to `/docs` |

A healthy HTTP response alone does not validate numeric results. Use known-answer and dataset
checks below. This demonstration service has no user accounts or persistent application database;
CORS allows public demo clients. Submit only the supplied demo data unless separately authorized
for an appropriate real-data environment.

### Request and pure function

```python
from app.qc import analyze_response

result = analyze_response(
    records, target_minutes, selected_priority,
    baseline_end, reviewed_zones, as_of,
)
```

All six arguments are explicit in the pure function; it reads no clock and imports no web
framework. Invalid overall parameters raise `ValueError`. The API supplies the server clock
when `as_of` is omitted and rejects a supplied time later than that clock.

| JSON field | Type / requirement |
|---|---|
| `records` | Required list of objects. Each row uses `incident_id`, `zone`, `priority`, `dispatched_at`, `on_scene_at`; extra record fields are ignored statistically. `[]` is permitted. |
| `target_minutes` | Required finite numeric value greater than zero; no numeric strings or booleans. |
| `selected_priority` | Required nonblank string; case-sensitive after trimming. Unknown category with usable data returns 422. |
| `baseline_end` | Required offset-aware ISO datetime that is New York local midnight; exclusive and no later than the start of the local `as_of` day. |
| `reviewed_zones` | Optional list of nonblank zone strings, default `[]`; confirmations apply to these data/settings. |
| `as_of` | Optional offset-aware ISO datetime; omission uses one server-time sample. Explicit null or blank is invalid. |

Only these six top-level fields are accepted. Explicit null is not omission. IDs/categories
are trimmed, case-sensitive text. Timestamps must have offsets; UTC instants determine duration,
New York dispatch dates determine groups. Zero elapsed duration is usable by the core; a reversed
interval is not. All normalized duplicate-ID rows are excluded, even across priorities.

Use the checked fixture to reproduce three imported rows, two usable, one excluded:

```bash
curl --fail-with-body http://127.0.0.1:8000/health
curl --fail-with-body -H 'Content-Type: application/json' \
  --data-binary @tests/fixtures/qc/small_request.json \
  http://127.0.0.1:8000/analyze
```

The fixture is synthetic and includes all six settings. It has an insufficient baseline and
therefore no formal signals; exclusions are results, not HTTP failures.

### Response

| Section | Meaning |
|---|---|
| `meta` | Schema version, timezone, observation time, target, selected priority, cutoff and reviewed zones |
| `quality` | Overall and selected-priority total/usable/excluded counts, coverage fractions and unassigned-priority rows |
| `excluded_records` | Original row numbers/identifiers and explicit exclusion reasons; each excluded row counted once |
| `zone_baselines` | Weighted baseline counts/proportion, nonempty days, review status, daily and weekday diagnostics |
| `daily_points` | Monitoring date/zone, n, late, rate, limits, expected counts, closure/review flags, status and reasons |
| `signals` | Only formally eligible high/low daily crossings |
| `late_incidents` | Usable late completed responses with elapsed minutes, timestamps, zone/date and baseline/monitoring phase |

Rates and limits are proportions (0–1), displayed as percentages; durations are minutes.
Uncomputable quantities are `null`. `high`, `low`, `no_signal` are formal daily verdicts;
`insufficient_data`, `unreviewed_baseline`, `provisional_current_day` are not. The latter states
can carry multiple reasons; never interpret absence of a formal signal as normal performance.
Overall total = usable + excluded; selected-priority counts have their own denominator.

### Errors

| HTTP | Code / behavior |
|---|---|
| 200 | Recognizable input with row-level errors returns exclusions; all-invalid/empty data return empty analysis with reasons. |
| 422 | `invalid_request`: invalid settings/types, unsupported envelope fields or structurally missing required columns. |
| 503 | `analysis_unavailable`: the core cannot be called. |
| 500 | `analysis_failed`: generic unexpected analysis/serialization failure; no traceback or imported records echoed. |

Error envelope: `{"error":{"code":"invalid_request","message":"…","fields":["target_minutes"]}}`.
See [interface v1.0](../docs/interfaces.md) for all field types, null behavior, status precedence
and exact category/empty-input rules. There are no write/delete data endpoints.

## Verification and independent reproduction

```bash
python -m pytest tests
npm --prefix app/frontend test
npm --prefix app/frontend run build
python data/jingyao_synthetic/verify.py
python tests/fixtures/api/verify_datasets.py
python tests/fixtures/qc/export_handoff.py
```

The final command prints a new temporary folder containing exact K1/K3 requests, CSVs, expected
responses and a manifest. Import `k1_high.records.csv`, apply the manifest settings, run and confirm
A: baseline 200/2000=10%, monitoring 20/100=20%, limits 1%/19%, high. `k1_boundary` at 19/100 has
no crossing; K3 n=400 limits are 5.5%/14.5%. Keep each case's observation time explicit. The small
fixture above demonstrates 3/2/1 accounting and row exclusion. Follow the full
[demo](../demo/README.md) for Jingyao stable → shift → edge → Hayden NYC, with different NYC settings.

`node app/frontend/acceptance/simulation_core_check.mjs` checks actual generated records against
the Python core and an in-process FastAPI test client; no running API server is required. Set
`PYTHON_BIN` to the interpreter with the backend dependencies if it is not the default `python3`. The simulation uses seed 5300 by default, A/B P1,
10-minute target, a September 1–20 baseline, six-hour steps and its own historical observation
clock. Seed accepts integers 0–4294967295; speed changes waiting time (0.5/1.5/3 seconds), not
statistics; scenario affects only future generated records. Run cap is 40 steps / 6000 records.
See [Live Simulation](../docs/live-simulation.md) for all controls, reset, export and error recovery.

For independent H-07 acceptance, a teammate should clone a fresh folder, follow installation,
start both services with the one command, reproduce K1 and 3/2/1, then follow the four-file demo.
Record commit, runtime versions, commands/output and discrepancies for Shifeng's ledger update.
Author-run checks support that handoff but do not replace the independent teammate check.

## Documentation verification — October 16, 2026

The documentation author used a fresh clone of team commit `8413391` with Python 3.13.7,
standard Node.js 22.23.3 and npm 10.9.9. Dependency installation completed; the original
`bash app/testme.sh` started both services. The frontend and health URLs returned HTTP 200;
local K1 and the 3/2/1 fixture matched complete core responses. Checks printed:

```text
Python: 175 passed, 1 existing dependency deprecation warning
Frontend: 7 test files passed; 54 tests passed
Production build: passed
Simulation: 10/10 generated-stream core/API cases PASS
```

The supplied public dashboard and API docs were reachable without credentials. Live API K1
high/boundary, K3 high and 3/2/1 results also matched the complete core responses. These are
actual author-run checks; the separate teammate fresh-clone acceptance and H-05 recording/
independent playback remain pending. No deployment or team-ledger status was changed here.

## Deployment and live access

- [Public dashboard](https://connect.systems-apps.com/content/fbeb8e54-b833-4b0f-8d87-8ca4617354a8/)
- [Public API health](https://connect.systems-apps.com/content/60e1dac5-58e2-42d7-b83d-4f95318a4a31/health)
- [Public API docs](https://connect.systems-apps.com/content/60e1dac5-58e2-42d7-b83d-4f95318a4a31/docs)
- [Walkthrough](../demo/README.md) and [recording status/script](../demo/recordings/README.md)

These are user-facing application URLs supplied by the team, not publishing credentials.
Hayden owns the API manifest/runtime and release workflows. The API uses `app/` with flat entry
point `app:app` and Python 3.12; the static frontend builds from `app/frontend/` using a relative
asset base for Connect's content path. Configure `VITE_API_URL` as the deployed API base at build
time; changing it requires rebuilding. `VITE_MOCK=0` is required for formal analysis.

| Four-script contract | Purpose / owner |
|---|---|
| `bash app/testme.sh` | Local API + UI startup; Julian |
| `bash app/manifestme.sh` | Generate API deployment manifest; coordinate with Hayden before changing his artifact |
| `bash app/deployme.sh` | Publish API using rsconnect and configured credentials; Hayden's deployment handoff |
| `app/README.md` | Setup, API and operation documentation; Jingyao |

The deployment scripts additionally require `rsconnect-python`; local development does not.
Workflows are [deploy-fastapi.yml](../.github/workflows/deploy-fastapi.yml) and
[deploy-react-static.yml](../.github/workflows/deploy-react-static.yml).
Publishing credentials/configuration belong in GitHub Actions secrets (`CONNECT_SERVER`,
`CONNECT_API_KEY`) and variables (`VITE_API_URL`), not committed files. A green workflow or
health-only response is not a complete deployment acceptance check; use the
[live browser evidence](frontend/acceptance/README.md) and [simulation verification](../docs/live-simulation.md).

## Troubleshooting

- Backend import error: activate `.venv` and install `app/requirements.txt`; ensure `PYTHON_BIN`
  points to that interpreter. Install the declared `tzdata` dependency for New York timezone data.
- Vite missing: run `npm --prefix app/frontend ci`. Port busy: stop the conflicting process or
  use the port overrides above. Both servers must remain running for local analysis.
- UI cannot reach API: check `/health`, the chosen API port and frontend build-time `VITE_API_URL`.
  A deployed page calling `127.0.0.1` needs its API URL configured and a new build.
- Empty/no-result view: inspect exclusions and selected priority; reapply settings and rerun after
  import/edit. Reconfirm eligible baselines only after reviewing them.
- Today's observations: provisional is intentional. Use the walkthrough's historical `as_of` to
  reproduce its outputs, and use the NYC-specific priority/cutoff for the real extract.

Adapted from `demos/fastapi/`. Method, assumptions and sources: [root README](../README.md).
Framework references: [FastAPI error handlers](https://fastapi.tiangolo.com/tutorial/handling-errors/)
and [Pydantic strict validation](https://docs.pydantic.dev/latest/concepts/strict_mode/).
