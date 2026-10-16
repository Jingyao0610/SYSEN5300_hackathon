# Front end (H-04, React + Vite)

Three pages for the dispatch supervisor: **Data & Settings**, **Zone Monitoring**,
**Incident Review**. The page parses and exports CSV, sorts, and displays. Every
count, rate, limit and verdict comes from `POST /analyze`, which calls
`app/qc.py`. There are no statistics in JavaScript.

Needs Node.js 20 or newer.

```bash
cd app/frontend
npm install
npm run dev:mock   # MOCK fixtures, red banner, the API is never called
npm run dev        # real API at VITE_API_URL (default http://127.0.0.1:8000)
npm test           # CSV and New York time helpers
npm run build      # static dist/ for Posit Connect
```

To point at a deployed API, set `VITE_API_URL` in `.env.local` (gitignored) or
in the build environment. Do not commit the server address.

## Files

| File | Job |
|---|---|
| `src/api.js` | the only place the API URL lives; `health()`, `analyze()`; MOCK switch |
| `src/csv.js` | CSV import/export of the five columns (text only, no validation of values) |
| `src/time.js` | New York local time to ISO 8601 with offset, and display |
| `src/status.js` | labels for each `daily_points.status`; only high/low/no_signal are verdicts |
| `src/mock/fixtures.js` | MOCK responses typed in from the SPEC K1-K3 known answers |
| `src/components/PChart.jsx` | SVG p chart of the API's rate/lower/upper/p_bar |
| `src/views/*.jsx` | the three pages |

## MOCK mode

`npm run dev:mock` loads `.env.mock` (`VITE_MOCK=1`). The fixtures follow the
draft response shape until `docs/interfaces.md` is agreed. A failed real API
call shows an error and never falls back to mock data.
