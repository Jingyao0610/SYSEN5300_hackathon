# H-05 walkthrough — recording-aligned draft

**Recording order:** Jingyao stable → Jingyao zone shift → Jingyao edge cases → Hayden NYC.

This draft follows the four-dataset order requested for Pingchuan's recording. It uses the
settings and actual numbers accepted in H-04 at `7d537af`. The current team paths below
are intentional: do not substitute the independently generated Shifeng collection.

Pingchuan's recording script is [`demo/recordings/SCRIPT.md`](recordings/SCRIPT.md) (on main at `326e7cd`);
this document aligns with that recording plan and the committed browser evidence.
Pingchuan owns the recording script and video. Independent playback and live deployment
acceptance remain pending; H-04 completion alone does not complete H-05 or H-06.

## 1. Exact files, order and settings

All times below are America/New_York, UTC offset −04:00 for these dates. Target is
10 minutes for all four files, an illustrative operational target, not a clinical standard.
Baseline cutoffs are exclusive local midnight. Preserve the explicit historical `as_of` after
baseline confirmation. Never replace it with today's date or infer it from the last row.

| Order | CSV path | Priority | `baseline_end` | `as_of` | Confirm usable baselines |
|---|---|---|---|---|---|
| 1 | `data/jingyao_synthetic/stable.csv` | `P1` | `2026-09-21T00:00:00-04:00` | `2026-10-01T00:00:00-04:00` | A, B |
| 2 | `data/jingyao_synthetic/zone_shift.csv` | `P1` | `2026-09-21T00:00:00-04:00` | `2026-10-01T00:00:00-04:00` | A, B |
| 3 | `data/jingyao_synthetic/edge_cases.csv` | `P1` | `2026-09-21T00:00:00-04:00` | `2026-10-01T12:00:00-04:00` | EDGE only |
| 4 | `data/real_nyc_brooklyn_queens_sev2.csv` | string `"2"` | `2026-08-21T00:00:00-04:00` | `2026-10-02T00:00:00-04:00` | BROOKLYN, QUEENS |

The NYC settings differ from the synthetic settings. The NYC file has no P1 category and
uses an August baseline. Its verified numbers below require the fourth row's settings.
The edge file's noon cutoff keeps October 1 provisional and admits the completed cross-midnight
response. Only EDGE has a usable baseline that the UI can confirm; leave the other edge groups
insufficient rather than trying to confirm them.

## 2. Start the real application

From the repository root, after Python/Node dependencies are installed as described in
[`app/README.md`](../app/README.md):

```bash
bash app/testme.sh
```

Open http://127.0.0.1:5173; API documentation is at http://127.0.0.1:8000/docs.
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
[HTTP/core report](../tests/fixtures/api/DATASET_ACCEPTANCE.md), and
[H-04 acceptance review](../tests/fixtures/api/H04_CHECKIN.md).

### 1 — Stable synthetic conditions

- Overall 12000 / 12000 / 0; selected P1 6000 / 6000 / 0.
- A baseline 291/2000 = 14.55%; B baseline 305/2000 = 15.25%.
- Twenty baseline days; monitoring sample size 100 per zone/day; **0 formal signals**.

Say: “This is synthetic data with unchanged generating conditions. No crossing signal was
found; that does not prove the process is in control or meeting its operational target.”

### 2 — Synthetic deterioration in A/P1

Import the shifted file and restore/review the same settings. Overall and selected counts,
and both baselines, remain identical to stable.

A/P1 has **8 high-signal days**, with n=100 each:

| September date, 2026 | 22 | 23 | 25 | 26 | 27 | 28 | 29 | 30 |
|---|---|---|---|---|---|---|---|---|
| Late count | 41 | 30 | 31 | 37 | 43 | 33 | 39 | 42 |

A's n=100 limits are 3.971873%–25.128127%, approximately. Decisions use unrounded values.
September 21 and 24 do not signal. B/P1 has no crossing signals.
For the incident drill-down, select A / September 22: 41 late incidents.
An individual late incident is not automatically a statistical outlier.

Say: “Only A/P1's monitoring lateness probability changed, from 0.15 to 0.35. The fixed
baseline exposes days needing review; it does not identify the cause of the delay.”

### 3 — Synthetic quality and boundary cases

Use October 1 at noon, P1; confirm EDGE only.

- Overall 5118 / 5107 / 11; selected P1 5117 / 5107 / 10; 1 unassigned-priority row.
  Both rows sharing `SYN-duplicate` are excluded.
- EDGE has a 200/2000 = 10% baseline across 20 days. September 21 has n=49 and is
  insufficient. October 1 shows 20/100 = 20%, `provisional_current_day`, with no formal signal.
- SHORT has 19 baseline days; ZERO/ONE have baseline proportions 0/1;
  NEW/BOUNDARY have no baseline. These do not receive formal verdicts. **0 signals overall.**
- `SYN-equal` is on time at exactly 10 minutes; `SYN-plus-second` is late at 10.0166667 minutes.
  `SYN-midnight` is 10 minutes and belongs to September 30; an exact-cutoff dispatch is monitoring.

Say: “Exclusions remain visible. Small samples, missing baselines and the current day do not
become green normal results. The chart covers usable recorded completed responses.”

### 4 — Hayden's real NYC public-data extract

Label this segment **REAL public data**, unlike the preceding three synthetic files.
Use priority 2, baseline cutoff August 21, as-of October 2 midnight.
Confirm BROOKLYN and QUEENS after reviewing the baseline diagnostics.

- Overall and selected-priority counts: 26209 / 26209 / 0.
- Brooklyn baseline 1134/5106 ≈ 22.2092%; Queens baseline 1254/3632 ≈ 34.5264%.
- **8 high-signal days:** Brooklyn September 4, 7, 11, 14, 29, 30; Queens September 6, 15.
- Brooklyn September 4: 85/286 ≈ 29.7203%, above its daily UCL of approximately 29.5826%.
  Daily limits vary with n; do not reuse the synthetic n=100 limits.
- The source had 27231 rows; Hayden's cleaning removed 1022, leaving 26209.
  Zero app exclusions means zero additional exclusions after that cleaning.
- This is incident-level first assignment to first on-scene arrival. Synthetic rows represent
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
