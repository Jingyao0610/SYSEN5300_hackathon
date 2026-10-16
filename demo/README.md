# H-05 walkthrough — recording-aligned draft

**Recording order: Jingyao stable → Jingyao zone shift → Jingyao edge cases → Hayden NYC.**
This draft follows the four-dataset order requested for Pingchuan's recording. It uses the
settings and actual numbers accepted in **H-04 at `7d537af`**. The current team paths below
are intentional: do not substitute the independently generated Shifeng collection.

Pingchuan's [`demo/recordings/SCRIPT.md`](recordings/SCRIPT.md) is on team main (added in `326e7cd`,
aligned with this walkthrough in `1a10468`); this document aligns with that recording plan and committed
browser evidence, without claiming a line-by-line review of the script.
Pingchuan owns the recording script and video. Independent playback and live deployment
acceptance remain pending; H-04 completion alone does not complete H-05 or H-06.

## 1. Exact files, order and settings

All times below are **America/New_York**, UTC offset **−04:00** for these dates. Target is
**10 minutes for all four files**, an illustrative operational target, not a clinical standard.
Baseline cutoffs are exclusive local midnight. Preserve the explicit historical `as_of` after
baseline confirmation. Never replace it with today's date or infer it from the last row.

| Order | CSV path | Priority | `baseline_end` | `as_of` | Confirm usable baselines |
|---|---|---|---|---|---|
| 1 | `data/jingyao_synthetic/stable.csv` | `P1` | `2026-09-21T00:00:00-04:00` | `2026-10-01T00:00:00-04:00` | A, B |
| 2 | `data/jingyao_synthetic/zone_shift.csv` | `P1` | `2026-09-21T00:00:00-04:00` | `2026-10-01T00:00:00-04:00` | A, B |
| 3 | `data/jingyao_synthetic/edge_cases.csv` | `P1` | `2026-09-21T00:00:00-04:00` | `2026-10-01T12:00:00-04:00` | EDGE only |
| 4 | `data/real_nyc_brooklyn_queens_sev2.csv` | string `"2"` | `2026-08-21T00:00:00-04:00` | `2026-10-02T00:00:00-04:00` | BROOKLYN, QUEENS |

**The NYC settings differ from the synthetic settings.** The NYC file has no P1 category and
uses an August baseline. Its verified numbers below require the fourth row's settings.
The edge file's noon cutoff keeps October 1 provisional and admits the completed cross-midnight
response. Only EDGE has a usable baseline that the UI can confirm; leave the other edge groups
insufficient rather than trying to confirm them.

## 2. Start the real application

From the repository root, after Python/Node dependencies are installed as described in
[app/README.md](../app/README.md):

```bash
bash app/testme.sh
```

Open **http://127.0.0.1:5173**; API documentation is at **http://127.0.0.1:8000/docs**.
The startup script sets `VITE_MOCK=0`. Confirm the page is connected in real mode.
No verified public deployment or final recording URL has been supplied for this draft.

For each dataset:

1. On **Data & Settings**, import the exact file from the table. Import replaces the session.
2. Select that row's priority, target, baseline date and observation time. Date/time controls
   use New York wall time: enter, for example, `2026-10-01T12:00:00` for edge `as_of`.
3. Click **Run analysis**. Before confirmation, baselines are unreviewed and no formal signal
   should be reported. Check overall and selected-priority coverage separately.
4. Open **Zone Monitoring**, inspect baseline daily rates, sample sizes and weekday summaries,
   then confirm only the usable zones listed above. Wait for the updated analysis and verify
   that the historical observation time is unchanged. These are demonstration confirmations,
   not proof that the real process is stable or independent.
5. Inspect the daily chart and signal list; open **Incident Review**, apply zone/date filters,
   sort by response minutes, clear filters and return to the chart. Export from Data & Settings
   to retain a CSV copy. Reimporting or changing settings clears prior results/reviews.

## 3. On-screen results and narration

All counts in this document use **total / usable / excluded** order. The page may label them
in a different order; read the labels. Results come from the committed
[110/110 browser campaign](../app/frontend/acceptance/results/datasets_e189c4b.txt),
[HTTP/core report](../tests/fixtures/api/DATASET_ACCEPTANCE.json), and
[H-04 acceptance review](../tests/fixtures/api/H04_CHECKIN.md).

### 1 — Stable synthetic conditions

- Overall **12000 / 12000 / 0**; selected P1 **6000 / 6000 / 0**.
- A baseline **291/2000 = 14.55%**; B baseline **305/2000 = 15.25%**.
- Twenty baseline days; monitoring sample size **100 per zone/day**; **0 formal signals**.

Say: “This is synthetic data with unchanged generating conditions. No crossing signal was
found; that does not prove the process is in control or meeting its operational target.”

### 2 — Synthetic deterioration in A/P1

- Import the shifted file and restore/review the same settings. Overall and selected counts,
  and both baselines, remain identical to stable.
- A/P1 has **8 high-signal days**, with n=100 each:

| September date, 2026 | 22 | 23 | 25 | 26 | 27 | 28 | 29 | 30 |
|---|---|---|---|---|---|---|---|---|
| Late count | 41 | 30 | 31 | 37 | 43 | 33 | 39 | 42 |

- A's n=100 limits are **3.971873%–25.128127%**, approximately. Decisions use unrounded values.
  September 21 and 24 do not signal. B/P1 has no crossing signals.
- For the incident drill-down, select **A / September 22**: **41 late incidents**.
  An individual late incident is not automatically a statistical outlier.

Say: “Only A/P1's monitoring lateness probability changed, from 0.15 to 0.35. The fixed
baseline exposes days needing review; it does not identify the cause of the delay.”

### 3 — Synthetic quality and boundary cases

- Use **October 1 at noon**, P1; confirm **EDGE only**.
- Overall **5118 / 5107 / 11**; selected P1 **5117 / 5107 / 10**;
  **1 unassigned-priority row**. Both rows sharing `SYN-duplicate` are excluded.
- EDGE has a **200/2000 = 10%** baseline across 20 days. September 21 has **n=49** and is
  insufficient. October 1 shows **20/100 = 20%**, `provisional_current_day`, with no formal signal.
- SHORT has 19 baseline days; ZERO/ONE have baseline proportions 0/1;
  NEW/BOUNDARY have no baseline. These do not receive formal verdicts. **0 signals overall**.
- `SYN-equal` is on time at exactly 10 minutes; `SYN-plus-second` is late at **10.0166667** minutes.
  `SYN-midnight` is 10 minutes and belongs to September 30; an exact-cutoff dispatch is monitoring.

Say: “Exclusions remain visible. Small samples, missing baselines and the current day do not
become green normal results. The chart covers usable recorded completed responses.”

### 4 — Hayden's real NYC public-data extract

Label this segment **REAL public data**, unlike the preceding three synthetic files.
Use priority **`2`**, baseline cutoff **August 21**, as-of **October 2 midnight**.
Confirm BROOKLYN and QUEENS after reviewing the baseline diagnostics.

- Overall and selected-priority counts: **26209 / 26209 / 0**.
- Brooklyn baseline **1134/5106 ≈ 22.2092%**; Queens baseline **1254/3632 ≈ 34.5264%**.
- **8 high-signal days**: Brooklyn **September 4, 7, 11, 14, 29, 30**;
  Queens **September 6, 15**.
- Brooklyn September 4: **85/286 ≈ 29.7203%**, above its daily UCL of approximately **29.5826%**.
  Daily limits vary with n; do not reuse the synthetic n=100 limits.
- The source had **27231 rows**; Hayden's cleaning removed **1022**, leaving 26209.
  Zero app exclusions means zero *additional* exclusions after that cleaning.
- This is incident-level **first assignment to first on-scene arrival**. Synthetic rows represent
  dispatched responses; multiple responding units make those observation units different.

Say: “Public NYC records supply the same five columns, with a different observation unit.
Each borough is compared with its own baseline; this is not a ranking of borough quality.
Pre-cleaning and completed-record coverage still limit interpretation.”

Source and mapping: [Hayden's NYC codebook](../data/README_real_nyc.md).

## 4. Suggested recording timing

Keep the same order even if individual narration is shortened:

| Time | Screen / message |
|---|---|
| 0:00–0:15 | Dispatch-supervisor use case, completed-record coverage, three synthetic files plus one real extract |
| 0:15–0:40 | Stable import/settings, baseline review and zero signals |
| 0:40–1:20 | Shift, eight signals, A/September 22 incident drill-down |
| 1:20–2:00 | Edge exclusions, n=49, provisional 20%, target equality |
| 2:00–2:45 | Switch to NYC-specific settings, eight signals and pre-cleaning/observation-unit caveats |
| 2:45–3:00 | Baseline-relative interpretation and limits; point to the walkthrough for reproducibility |

Pingchuan may adjust pacing in the recording script. Dataset order, filenames, settings and numeric
claims above should remain synchronized. Additional P2 and Shifeng cases are covered by H-04's
[seven-file acceptance procedure](../tests/fixtures/api/DATASET_ACCEPTANCE.md); they are not added
to this four-file recording sequence.

## 5. Reproduce the exact settings through the API

From the repository root, with the real API running, this standard-library command sends the
same four files in order. It confirms only the usable baselines selected in the browser.
The observation cutoffs are fixed and not taken from the computer clock.

```bash
python - <<'PY'
import csv
import json
from pathlib import Path
from urllib.request import Request, urlopen

cases = [
    ('data/jingyao_synthetic/stable.csv', 'P1', '2026-09-21', '2026-10-01T00:00:00-04:00', ['A', 'B']),
    ('data/jingyao_synthetic/zone_shift.csv', 'P1', '2026-09-21', '2026-10-01T00:00:00-04:00', ['A', 'B']),
    ('data/jingyao_synthetic/edge_cases.csv', 'P1', '2026-09-21', '2026-10-01T12:00:00-04:00', ['EDGE']),
    ('data/real_nyc_brooklyn_queens_sev2.csv', '2', '2026-08-21', '2026-10-02T00:00:00-04:00', ['BROOKLYN', 'QUEENS']),
]
for filename, priority, baseline, as_of, reviewed in cases:
    with Path(filename).open(newline='', encoding='utf-8') as source:
        records = list(csv.DictReader(source))
    payload = dict(records=records, selected_priority=priority, target_minutes=10,
                   baseline_end=baseline+'T00:00:00-04:00', as_of=as_of, reviewed_zones=reviewed)
    request = Request('http://127.0.0.1:8000/analyze',
                      data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
    with urlopen(request, timeout=60) as response:
        result = json.load(response)
    print(filename, json.dumps({'quality': result['quality'], 'signals': len(result['signals'])}))
PY
```

Expected overall counts and signal counts, in order: **12000/12000/0, 0**;
**12000/12000/0, 8**; **5118/5107/11, 0**; **26209/26209/0, 8**.
For a complete-response comparison using all seven published files:

```bash
python tests/fixtures/api/verify_datasets.py
```

This starts its own temporary API and should report **12 successful combinations + 1 expected
rejection; 37 live HTTP calls; 7 CSVs unchanged**. P2 is absent from Jingyao edge and correctly
returns HTTP 422. That verifier confirms all listed edge labels; the recording only confirms
EDGE, matching the browser. Other groups remain insufficient either way, but review metadata
and reasons can differ; compare complete responses only with identical `reviewed_zones`.

## 6. Recording and independent playback handoff

H-04 is accepted; the previously pending seven-file browser checks are complete. The evidence is
Pingchuan's committed browser campaign, not a new browser replay by the author of this document.
This draft is ready for Pingchuan to align the recording narration and for Hayden to independently
follow. H-05 remains pending the recording/playback acceptance; Shifeng updates `CONTRACT.yaml`.

When the script/video is committed, add its exact commit and accessible link. Hayden should record
playback date, tested commit, environment, counts/signals for each of the four files, discrepancies,
and the final recording URL. An eventual live walkthrough requires H-06 verification first.
