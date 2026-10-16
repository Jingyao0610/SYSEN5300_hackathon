# Chinese Can Fly — Emergency Response Review

For ambulance dispatch supervisors reviewing unusual changes in the daily proportion of late **recorded completed responses**, separately by zone within one priority category. The Python/FastAPI API calls one verified statistical core; the React dashboard supports CSV import/export, manual response entry, zone monitoring and incident review. All bundled datasets are **synthetic**.

## Run locally

Requires Python 3.12/3.13, Node.js and npm; the backend was checked here on Python 3.13.7. From a fresh clone:

```bash
git clone https://github.com/Jingyao0610/SYSEN5300_hackathon.git
cd SYSEN5300_hackathon
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r app/requirements.txt
npm --prefix app/frontend ci
bash app/testme.sh
```

On Windows use a Bash environment for startup and the appropriate virtual-environment activation path. Dependencies must be installed before the one-command startup. Open http://127.0.0.1:5173; API docs: http://127.0.0.1:8000/docs. Ctrl-C stops both services. See [app README](app/README.md) for API-only mode and ports.

## Inputs and analysis

| Input | Meaning |
|---|---|
| `incident_id` | Unique text ID per dispatched response |
| `zone` | Text service zone |
| `priority` | Text priority label; demo P1/P2 have no clinical meaning |
| `dispatched_at`, `on_scene_at` | ISO 8601 timestamps with explicit UTC offsets |
| `target_minutes` | Positive numeric operational target; demo 10 minutes, illustrative |
| `selected_priority` | Single priority to analyze |
| `baseline_end` | Exclusive baseline cutoff at New York local midnight |
| `reviewed_zones` | Zone baselines reviewed by supervisor; default empty |
| `as_of` | Offset-aware observation cutoff; API defaults to server time, explicit future values rejected |

CSV requires the five record columns. Settings are separate from CSV. [Full codebook](data/README.md) covers units, collection responsibilities, seed, assumptions and all files. [Interface v1.0](docs/interfaces.md) defines every request/response field and missing-state rule.

Response minutes are elapsed arrival minus dispatch time; strictly greater than the target means late. The plain `app.qc.analyze_response(records, target_minutes, selected_priority, baseline_end, reviewed_zones, as_of)` computes every statistic. Daily grouping is **America/New_York**. For each zone/priority the baseline is total baseline late divided by total baseline responses; a daily p chart uses frozen-baseline three-standard-error limits. Only strict crossings signal.

Formal verdicts require a reviewed baseline, at least 20 nonempty baseline days, a closed local day, nondegenerate baseline, and both expected counts at least five. Review baseline daily and weekday displays for comparability; confirmation and thresholds do not prove independence or stability. Changing settings or records clears stale analysis and baseline reviews. The current day is provisional. Missing, invalid, reversed, future or duplicate-ID records are explicitly excluded; counts reconcile. No usable observations means no result, never invented zero performance.

## Demonstrate and verify

[Demo script](demo/README.md) gives exact settings, API commands, clicks and actual results for all three CSVs. Stable/shift use baseline cutoff September 21 and as-of October 1 midnight, 2026, New York. Edge uses October 1 noon to expose provisional-day behavior. Never infer analysis time from the dataset's final day.

```bash
python data/generate.py
python data/verify.py
python -m pytest tests
npm --prefix app/frontend test
npm --prefix app/frontend run build
```

Actual local data/core/API checks: reproducible CSVs; identical 8,000-row baseline; five complete core/API response comparisons; target, exclusions and time-boundary checks. Python suite: **175 passed, 1 upstream deprecation warning**. [Verification output](data/VERIFICATION.txt). Browser/live playback and independent fresh-clone acceptance remain pending; these checks do not claim H-05/H-07 release acceptance.

## Access, limits and references

Personal contribution fork: [Jingyao0610/SYSEN5300_hackathon](https://github.com/Jingyao0610/SYSEN5300_hackathon). Team source: [haydenYang666/SYSEN5300_hackathon](https://github.com/haydenYang666/SYSEN5300_hackathon). A verified public live application and final recording are **not yet supplied**. Hayden owns release access and Posit Connect deployment; keep course configuration/credentials in GitHub Secrets. Local instructions above work without deployment credentials.

The tool supports operational record review, without clinical triage or automatic dispatch. Completed-record coverage excludes outstanding responses, cancellations and unlogged calls; missingness can bias rates. A stable late rate can still miss the operational target. Individual lateness is not a statistical outlier, and a baseline-relative signal is not proof of cause. No login or persistent database; export session records for reuse.

Method: [NIST p charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm), a cited extension beyond the listed course glossary. Project [SPEC](SPEC.md), [team ownership](docs/team.en.md), [known-answer review](tests/fixtures/qc/REVIEW.md), [event README](docs/HACKATHON_README.md). Built from the MIT-licensed Six Sigma Hackathon starter and `demos/fastapi/`; see [LICENSE](LICENSE).
