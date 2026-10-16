# Shifeng supplemental synthetic emergency-response datasets

**All records in this directory are fictional. They are software demonstration and validation inputs, not patient records, measured EMS performance, or evidence about a real city.** Each incident identifier starts with `SYN-`. Import one CSV at a time; do not concatenate the alternative scenarios, which deliberately reuse incident identifiers.

## Provenance and scope

These files are generated locally by `generate.py` for Chinese Can Fly, following the team's existing `SPEC.md` and `docs/plan.md`. No external dataset, scraped website, actual dispatch log, patient identifier, location coordinate, or proprietary database was used. Python's standard library creates the fictional records. No third-party data license or attribution is being represented as permission to reuse real EMS records.

The schema resembles measurements a dispatch service can record, but the rates, volumes and duration distributions below are deliberately illustrative and are **not calibrated to a real service**. The 10-minute threshold is an adjustable demonstration setting, not a medical or legal response standard. These files were initially prepared locally; Shifeng authorized GitHub publication on 2026-10-16. This separate directory preserves his reviewed version for comparison and supplemental testing. It does not replace Jingyao's candidate datasets or Hayden's real-data extract, and it does not settle the team's final demonstration dataset selection.

## Files and intended comparison

| File | Rows | Purpose |
|---|---:|---|
| `stable.csv` | 12,000 | Unchanged generating conditions through baseline and monitoring; random sampling can still produce an alarm. |
| `zone_shift.csv` | 12,000 | Same baseline and non-target groups as `stable.csv`; only A/P1 monitoring has a higher generating probability of lateness. |
| `edge_cases.csv` | 2,934 | Deliberately constructed boundaries, insufficient data, provisional observations and invalid rows. Invalid rows are intentional and must remain visible in the exclusion report. |
| `settings.json` | — | Exact analysis settings, available priority labels, synthetic-data notice and generating assumptions. |
| `generate.py` | — | Deterministic generator; existing differing output is not silently overwritten. |
| `verify.py` | — | Reproduction, schema, scenario isolation, accounting, hand-calculation and core-result checks. |
| `VALIDATION.md` | — | Observed numerical results, execution evidence and the limits of the local checks. |

## CSV codebook

UTF-8 CSV, comma separated, one header row and exactly these five columns. Each data row represents one fictional dispatched response, including intentionally invalid examples in `edge_cases.csv`. Read identifiers as strings and preserve blank cells; blanks are not zero.

| Column | Type / unit | Meaning and rules | How a real service could collect it |
|---|---|---|---|
| `incident_id` | String; no physical unit | Synthetic response identifier. Unique within an ordinary scenario; duplicate pairs in the edge file test exclusion of **both** copies. | A response-level identifier from the computer-aided dispatch system; replace any linkable operational identifier with an appropriate study identifier. |
| `zone` | String; nominal category | Fictional service area. A/B are ordinary scenarios; additional clearly named edge groups exercise missing or inadequate baselines. No geographic meaning is assigned. | Service zone recorded at dispatch; use a consistent zone definition across baseline and monitoring. |
| `priority` | String; nominal category | Fictional P1/P2 categories. Analyze one at a time; they are not definitions of real triage severity. | The recorded priority classification, with the actual system's definitions and revisions documented. |
| `dispatched_at` | ISO 8601 timestamp with UTC offset | Time the response is dispatched; determines the day and baseline/monitoring phase after conversion to `America/New_York`. | Dispatch timestamp from the dispatch/event log, with timezone and clock synchronization recorded. |
| `on_scene_at` | ISO 8601 timestamp with UTC offset | Recorded arrival on scene. Must be at or after dispatch and no later than the analysis `as_of`. A blank arrival is excluded, not interpreted as instantaneous arrival. | Arrival event from the response/event log, using a consistent arrival definition and synchronized clock. |

The application derives response minutes from elapsed UTC time and defines late as `response_minutes > target_minutes`. Exactly 10 minutes is on time when the target is 10; 10 minutes 1 second is late. An overnight response belongs to its **dispatch** date. CSV fields are raw inputs; no response time, chart limit or signal is precomputed inside the CSV.

Real collection would also need operator authorization, access controls, a documented extraction process, and an assessment of missing or outstanding responses. These synthetic examples do not supply those approvals or establish that a real operational dataset is complete.

## Generating assumptions

- Seed: `5300`. Each ordinary scenario covers 2026-09-01 through 2026-09-30, with A/B × P1/P2 × 100 responses per group per day. These fixed volumes keep the demo easy to audit; they are not demand forecasts.
- Baseline: 20 nonempty days, September 1–20. Exclusive cutoff: `2026-09-21T00:00:00-04:00`. Monitoring: September 21–30.
- Dispatches are placed between 08:00 and 20:00 local time. Duration draws are positive integer seconds: on-time examples span 2–10 minutes and late examples span 601–1,800 seconds. This simple construction demonstrates a binary late/on-time outcome; it is not a fitted travel-time distribution.
- Stable generating probability: 0.15 in every group. Shifted probability: 0.35 for A/P1 after the cutoff only. Paired scenarios share random draws so their baseline and unaffected groups remain identical. The random seed is fixed before examining signals; it is not searched or changed to produce attractive charts.
- The two ordinary files share the same fictional incidents and are alternative scenarios. Comparing them illustrates a planted change; it is not a causal evaluation of an intervention.
- The edge file is deterministic rather than an empirical sample. It includes a known-answer A baseline with 200 late out of 2,000 responses, zero/all-late baselines, fewer than 20 baseline days, a new zone, a one-record monitoring day, current-day records, a midnight crossing and deliberately invalid records.

These constructions simplify independence, changing demand, case mix, weekends, seasonality, traffic, record completeness and reporting delays. Their purpose is to test correct app behavior, not to certify the assumptions of a real p chart. A zero-signal result means no tested limit crossing, not proof that a process is in control.

## Run locally

From the repository root, with the application's Python environment available (install app/requirements.txt):

```bash
python data/shifeng_synthetic/generate.py
python data/shifeng_synthetic/verify.py
```

For a separately generated copy, use a new output directory:

```bash
python data/shifeng_synthetic/generate.py --output /path/to/new-directory
```

For analysis, select the CSV's exact settings from `settings.json`. Ordinary scenarios use `as_of = 2026-10-01T00:00:00-04:00`; the edge scenario uses `as_of = 2026-10-01T12:00:00-04:00` so its completed morning responses are valid but the current day remains provisional. All times shown for calendar grouping are New York time.

For the reviewed demonstration, use the listed `reviewed_zones` **after inspecting the synthetic baseline**. Re-run with an empty list to see the unreviewed state. The setting is an explicit demo confirmation, not evidence that a human reviewed real operations. Changing the data, target, priority or cutoff requires a new review and analysis.

## Expected demonstration results

With the exact settings above, `stable.csv` produces no formal signals for either priority. `zone_shift.csv` produces ten high signals for A/P1, September 21–30; P2 and B/P1 remain unchanged. This is the observed result for the fixed seed, not a guarantee for every random sample.

For `edge_cases.csv`, overall coverage is 2,922 usable / 12 excluded out of 2,934. Selecting P1 shows 2,922 usable / 10 excluded out of 2,932; the other two rows are one P2 duplicate and one row with a missing priority. Both copies of the duplicate incident are excluded. Selecting P2 therefore yields no usable observations while preserving coverage information.

The edge A/P1 baseline is 200/2,000 = 0.10. Its 100-response monitoring day's limits are 0.01 and 0.19; 19/100 is exactly on the upper limit and produces **no signal**. Current-day, sparse and inadequate-baseline examples have separate statuses and also produce no formal signals. Detailed counts and the local HTTP comparison are in [VALIDATION.md](VALIDATION.md).

## Method reference

The app applies the [NIST p-chart method](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm) using a weighted frozen baseline and strict 3-sigma limit crossings. NIST is a method reference, not the source of these dispatch records. The project's minimum of 20 nonempty baseline days, expected-count checks and handling of unreviewed/current-day data are specified in `SPEC.md` and `docs/interfaces.md`. Core verification remains in `tests/fixtures/qc/REVIEW.md`.
