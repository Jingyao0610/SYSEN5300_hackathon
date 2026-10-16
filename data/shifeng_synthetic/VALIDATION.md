# H-02 local data validation

Initial local validation date: 2026-10-16. Existing statistical core and API revision: `148c2d2308a11b0525f4695fcaaa2f125899b85d`. The initial H-02 files were local additions, not part of that revision. All records are synthetic. No external dataset was used. The evidence below records the initial local validation; publication was subsequently authorized, as described in README.md.

## Reproduction and coverage

Executed from the repository root using the application's Python dependencies:

```bash
python data/shifeng_synthetic/verify.py
```

The local execution supplied `--temp-root` pointing to a writable scratch directory. That flag only selects where a comparison copy is retained. The validator checks byte-identical reproduction of all three CSVs and `settings.json`, refuses to overwrite differing files, recomputes counts and Decimal-based limits, and compares them with `app.qc.analyze_response`. It does not make network requests.

Actual output, with the machine-specific scratch path omitted:

```text
PASS: 3 synthetic CSVs; byte-identical seed-5300 reproduction; five columns; overwrite refusal.
PASS: 8000 shared baseline rows; 3000 unchanged other monitoring rows; 233 A/P1 arrivals changed.
PASS stable.csv P1: overall 12000/12000/0; selected 6000/6000/0; signals=0; unreviewed=0
PASS stable.csv P2: overall 12000/12000/0; selected 6000/6000/0; signals=0; unreviewed=0
PASS zone_shift.csv P1: overall 12000/12000/0; selected 6000/6000/0; signals=10; unreviewed=0
PASS zone_shift.csv P2: overall 12000/12000/0; selected 6000/6000/0; signals=0; unreviewed=0
PASS edge_cases.csv P1: overall 2934/2922/12; selected 2932/2922/10; signals=0; unreviewed=0
PASS edge_cases.csv P2: overall 2934/2922/12; selected 1/0/1; signals=0; unreviewed=0
PASS: independent counts/Decimal limits, weekdays, edge statuses, target equality, exclusions and priority isolation.
```

Coverage triplets above mean total / usable / excluded. One edge record has no priority and contributes to overall coverage but neither selected-priority count. The two duplicate copies are excluded across priorities.

Before relocation to the supplemental directory, the task's required `ls data/*.csv` command printed exactly (these are historical paths):

```text
data/edge_cases.csv
data/stable.csv
data/zone_shift.csv
```

The codebook check printed `PASS H-02 definition_of_done: 3 CSVs, every filename and all 5 columns documented with units and real-collection explanation.` The repository ledger checker printed `PASS check.sh`; `git diff --check` passed. At initial validation H-02 remained `in_progress` and no commit or push was made, because the user had requested local preparation. Publication was subsequently authorized. H-02 acceptance still depends on the team selecting its canonical dataset set and completing its existing definition of done.

## Frozen baselines and planted shift

Both ordinary scenarios have the same 20 nonempty baseline days for every group. Their 8,000 baseline records and 3,000 monitoring records outside A/P1 are identical. Only 233 A/P1 arrival timestamps differ between scenarios; no identifiers, dispatch timestamps, priorities or zones change.

| Priority | Zone | Baseline late / n | Weighted baseline rate |
|---|---|---:|---:|
| P1 | A | 277 / 2,000 | 0.1385 |
| P1 | B | 298 / 2,000 | 0.1490 |
| P2 | A | 311 / 2,000 | 0.1555 |
| P2 | B | 313 / 2,000 | 0.1565 |

For `zone_shift.csv`, A/P1 monitoring days September 21–30 have late counts **33, 42, 39, 48, 41, 38, 39, 28, 40, 39**, each out of 100. All ten exceed the upper control limit. Changing `reviewed_zones` to `[]` suppresses formal signals in every dataset/priority combination.

The generating probabilities 0.15 and 0.35 are not asserted to equal realized sample proportions. The random seed was fixed rather than selected to obtain the displayed signals. A lack of signals is not proof of process stability.

## Edge-case checks

| Case | Expected and observed behavior |
|---|---|
| A/P1 baseline | 200 late / 2,000 = 0.10 across 20 days. |
| Exact upper boundary | At n = 100, limits = 0.10 ± 3√(0.10×0.90/100) = 0.01 / 0.19. September 21 has 19/100 = 0.19 and `no_signal`. |
| Exact time threshold | `SYN-E-EXACT-TARGET` is 600 seconds, on time; `SYN-E-TARGET-PLUS-ONE-SECOND` is 601 seconds, late. |
| Midnight crossing | September 30 23:55 to October 1 00:05 is 600 seconds, on time and grouped under September 30. |
| One usable response | A September 22 and September 30 each have n = 1, null control limits and `insufficient_data`. |
| Excluded-only observed dates | A September 23 and September 24 remain visible with n = 0, null rate and `no_usable_observations`. |
| Current day | A October 1 has 20/100 = 0.20 but `provisional_current_day`; it is not a formal signal. |
| Zero/all-late baseline | B = 0/200; C = 200/200. Both have `baseline_rate_degenerate` and no formal signal. |
| Short baseline | SHORT = 19/190 across 19 nonempty days; `baseline_fewer_than_20_days`. |
| No baseline | NEW has no baseline observations; `no_baseline`. |
| Invalid records | 12 rows excluded for missing fields, invalid/naive timestamps, reversed time, future time or duplicate IDs; each reason is checked. |
| Priority with no usable records | P2 has one excluded duplicate, no usable records, empty analysis containers and `no_usable_selected_records`. |

## Local API comparison

A temporary Uvicorn process was bound only to `127.0.0.1` and stopped after the checks. `/health` returned `analysis_mode=real`. Each CSV was sent to `/analyze` twice, once for each listed priority, with its exact `settings.json` values. The entire decoded JSON response was compared to a direct call to `analyze_response` for the same input.

```text
PASS /health: analysis_mode=real
PASS stable.csv P1: HTTP 200, full response deep-equal to analyze_response; signals=0
PASS stable.csv P2: HTTP 200, full response deep-equal to analyze_response; signals=0
PASS zone_shift.csv P1: HTTP 200, full response deep-equal to analyze_response; signals=10
PASS zone_shift.csv P2: HTTP 200, full response deep-equal to analyze_response; signals=0
PASS edge_cases.csv P1: HTTP 200, full response deep-equal to analyze_response; signals=0
PASS edge_cases.csv P2: HTTP 200, full response deep-equal to analyze_response; signals=0
PASS 6/6 local HTTP/core parity cases; no browser UI claim and no upload.
```

This demonstrates local CSV/core/API agreement. It does **not** claim browser import, display or export acceptance for these new files, deployment acceptance, or completion of H-04. The dataset does not establish clinical validity or represent actual service performance.

## Independent computational review

A separate read-only reviewer agent independently reconstructed CSV counts, exclusions, limits and signal decisions. All 90 monitoring points and 91 weekday summaries matched. In-memory regeneration matched every CSV and `settings.json` byte for byte. The reviewer also checked these known answers directly against the core without relying only on the data validator:

| Check | Expected and observed |
|---|---|
| n = 100, baseline rate 0.10 | Limits 0.01 / 0.19; late counts 0, 1, 19, 20 produce low / no_signal / no_signal / high. |
| n = 400, baseline rate 0.10 | Limits 0.055 / 0.145; late counts 21, 22, 58, 59 produce low / no_signal / no_signal / high. |
| Unequal daily baseline sizes | Weighted 400/4,000 = 0.10, not the unweighted daily mean 0.0866666666667; adding monitoring data does not change it. |
| Expected-count boundary | At baseline rate 0.10, n = 49 gives expected late 4.9 and is insufficient; n = 50 gives 5.0 and is eligible. |
| Empty and one-response cases | No formal signal or unjustified chart verdict. |

This computational review is not a claim that a human teammate has completed the team's review/check-in step.

## Publication preparation (2026-10-16)

Shifeng subsequently authorized GitHub synchronization. This bundle is published under `data/shifeng_synthetic/` as a separate supplemental version. The three CSVs, `settings.json`, and `generate.py` are byte-identical to the initially verified local bundle. The verifier now discovers the repository root when run from this nested location; no statistical or data-generation behavior changed.

Before publication, `python data/shifeng_synthetic/verify.py --temp-root <writable-scratch-directory>` passed from a clean worktree based on `e5d020e`. It again reported byte-identical reproduction, 8,000 shared baseline rows, 233 changed A/P1 arrivals, zero stable signals, ten shifted A/P1 signals, and edge coverage 2,934/2,922/12. The ledger check printed `PASS check.sh`; `git diff --check` passed. Existing core/API code and real-data files were unchanged.

This publication does not change the team's canonical dataset selection or mark H-02 browser acceptance complete.

The current bundle listing is `ls data/shifeng_synthetic/*.csv`, which prints the same three filenames under their new directory. Directory-local Git attributes keep all bundle text files at LF line endings so byte reproduction remains valid on Windows clones.
