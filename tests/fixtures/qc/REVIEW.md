# H-03 independent statistical review

Reviewed on 2026-10-16. **OVERALL: PASS — implementation ready for check-in.**

A fresh, read-only reviewer generated synthetic records independently of `qc_cases.py`,
called `app.qc.analyze_response` directly, checked the formulas against `SPEC.md` and
`docs/plan.md`, and ran the automated suite. The lead agent separately ran that suite.
This is verification of the statistical core; HTTP, frontend and deployment acceptance
belong to later tasks and have not been performed here.

## Formulas checked

| Quantity | Implemented definition | Verdict |
|---|---|---|
| Response time and lateness | UTC elapsed seconds / 60; late only when minutes > target | PASS |
| Daily rate | Usable late / usable completed; null for n=0 | PASS |
| Baseline | Sum of baseline late / sum of baseline completed, dispatch before cutoff | PASS |
| Standard error | sqrt(p_bar * (1 - p_bar) / n) | PASS |
| Control limits | max(0, p_bar - 3 SE), min(1, p_bar + 3 SE), subject to expected-count eligibility | PASS |
| Signals | Strict crossing with absolute proportion tolerance 1e-12; reviewed baseline, closed date and data gates required | PASS |
| Weekday rate | Sum of weekday late / sum of weekday completed | PASS |
| Coverage | Usable imported rows / imported rows; null for empty input | PASS |

## Independent numerical results

Values below are actual observed outputs; displayed decimal differences in limits are ordinary
binary floating-point representation. Boundary decisions were checked without display rounding.

| Check | Expected | Observed | Verdict |
|---|---|---|---|
| K0 target equality, one second over, zero duration | n=3, late=1, rate=1/3; late time 10.016666666666667 min | Same | PASS |
| K1 baseline | 200/2000=0.1 across 20 days | 200/2000=0.1 | PASS |
| K1, n=100 limits | SE=0.03; [0.01, 0.19] | SE=0.03; [0.009999999999999995, 0.19] | PASS |
| K1, late=0 / 1 / 19 / 20 | low / no_signal / no_signal / high | Same, rates 0 / .01 / .19 / .20 | PASS |
| K2 unequal baseline sizes | 400/4000=0.1, not mean of daily rates | 400/4000=0.1 | PASS |
| K2 append valid unique monitoring rows | Baseline and same-n limits unchanged | p_bar=.1; [.009999999999999995, .19] unchanged | PASS |
| K3, n=400 limits | SE=.015; [.055, .145] | SE inferred from upper=.015000000000000005; [.055, .14500000000000002] | PASS |
| K3, late=21 / 22 / 58 / 59 | low / no_signal / no_signal / high | Same, rates .0525 / .055 / .145 / .1475 | PASS |
| K4 same weekday pooling | 2 dates, 40/400=.1; seven slots, six null rates | Same | PASS |
| D1 p_bar=.1, n=49 | Expected counts 4.9/44.1; null limits; insufficient | Same | PASS |
| D1 p_bar=.1, n=50 | Expected counts 5/45; eligible | 5/45; limits [0, .22727922061357855]; no_signal | PASS |
| D1 p_bar=.9, n=49 | Expected counts 44.1/4.9; null limits; insufficient | Same | PASS |
| D1 p_bar=.9, n=50 | Expected counts 45/5; eligible | 45/5; limits [.7727207793864215, 1]; no_signal | PASS |
| D1 empty input | Zero rows, null coverage, empty analysis | Same; empty_input | PASS |
| D1 one response / new zone | Observed rate=1; baseline and limits null; no verdict | Same; zero signals | PASS |
| D1 constant baseline | p_bar=0 or 1 retained; null limits; no verdict | Observed rate=.5; insufficient; zero signals | PASS |
| D1 19 baseline dates | No formal verdict | 19 dates, rate=.2, baseline_fewer_than_20_days | PASS |
| D1 observed excluded-only date | n=0, late=0, null rate and limits | Same; insufficient | PASS |
| D2 global row accounting | 10 total / 1 usable / 9 excluded; coverage=.1 | Same | PASS |
| D2 selected row accounting | 8 total / 1 usable / 7 excluded; coverage=.125 | Same | PASS |
| D2 duplicate IDs across priorities | Every copy excluded; each row counted once | Same; reason order correct | PASS |
| D2 all selected rows excluded | Empty analysis; selected 1/0/1 | Same; no_usable_selected_records | PASS |
| D3 current date, 20/100 | Rate=.2, provisional, zero formal signals | Same with reviewed and unreviewed baselines | PASS |
| Closed but unreviewed, 20/100 | Rate=.2, unreviewed, zero signals | Same | PASS |
| D3 crossing midnight / cutoff equality | 10 minutes assigned October 15; equality is monitoring | October 15 baseline late=0; October 16 monitoring | PASS |
| D3 spring and autumn DST | 10 elapsed minutes in both cases | 10 / 10 | PASS |
| UTC dispatch date conversion | September 22 03:55Z belongs September 21 New York; 12 minutes | September 21; 12 minutes | PASS |
| Complete schema example | 3 total / 2 usable / 1 excluded; coverage=2/3 | 3/2/1/.6666666666666666 | PASS |
| Response shape / JSON | Seven top-level containers and documented keys; finite JSON | Same; strict JSON serialization passes | PASS |
| Invalid overall settings | Readable ValueError | Invalid target, cutoff and category produce ValueError | PASS |

## Defect found and corrected

The first independent review found that `datetime.fromisoformat` normalized malformed UTC
offset components such as `+00:60` and `+00:00:60`. In the reproduction, those rows incorrectly
remained usable and produced 308- and 249-minute durations. Explicit offset-component bounds
now reject them before parsing. Individual bad rows return exclusions; bad analysis settings
raise `ValueError`.

The regression suite was run before the correction and printed:

```text
18 failed, 14 passed, 80 deselected in 0.11s
```

After the correction, the reviewer independently checked 14 malformed-offset row cases,
four bad-setting cases, and six valid offset forms. All passed; valid forms retained their
expected 12-minute durations. The full suite contains 38 added regression cases.

## Required test command and actual output

From the repository root: `pytest tests/test_qc.py`.

The review environment used Python 3.12.14, pytest 9.1.1, and available IANA timezone data.
Here `pytest` was a process-local PowerShell wrapper around that runtime's `python -m pytest`.
No project dependency file was changed; H-04 owns dependency setup.

```text
============================= test session starts =============================
platform win32 -- Python 3.12.14, pytest-9.1.1, pluggy-1.7.0
rootdir: D:\Chrome-Download\SYSTEM 5300\SYSEN5300_hackathon
configfile: pytest.ini
collected 112 items

tests\test_qc.py ....................................................... [ 49%]
.........................................................                [100%]

============================= 112 passed in 0.77s =============================
```

The lead agent's separate final run printed `112 passed in 0.78s`.
No remaining substantive H-03 defect was found. This result does not certify baseline stability,
response independence, completeness of dispatch logs, or team understanding of the method.
