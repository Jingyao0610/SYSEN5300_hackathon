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
| `src/status.js` | labels for the v1.0 status enums and reason codes; only high/low/no_signal are verdicts |
| `src/components/PChart.jsx` | SVG p chart of the API's rate/lower/upper/p_bar |
| `src/views/*.jsx` | the three pages |
| `src/mock/` | MOCK scenarios: input CSVs and the core's responses (generated, see below) |
| `scripts/make_fixtures.py` | regenerates `src/mock/` by running `app/qc.py` |
| `src/schema.test.js` | fails if the core returns a status or reason code the page has no label for |

Request and response shapes follow [`docs/interfaces.md`](../../docs/interfaces.md) v1.0.

## MOCK mode

`npm run dev:mock` loads `.env.mock` (`VITE_MOCK=1`) and shows a red banner.
Pick a scenario in the banner: it loads that scenario's records and fixed
settings, and Run analysis returns the response `app/qc.py` produced for them
(with `meta.is_mock` set to true). The API is not called, so edits to the
records are not analysed. A failed real API call shows an error and never
falls back to mock data; MOCK code is not in the production build.

After any change to `app/qc.py`, regenerate the fixtures from the repo root:

```bash
python3 app/frontend/scripts/make_fixtures.py
```

The scenario CSVs in `src/mock/` can also be imported in real mode, to check
that the live API returns the same numbers.
