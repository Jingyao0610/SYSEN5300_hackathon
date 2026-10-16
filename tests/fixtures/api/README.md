# Synthetic API fixtures

The API tests reuse H-03's reviewed fixtures in `tests/fixtures/qc/` without modifying them:

- `small_request.json` and `small_expected.json`: exact 3 imported / 2 usable / 1 excluded example.
- `qc_cases.py`: deterministic K1/K3 baselines and daily counts, plus explicit edge records.

The API clock is injected as `2026-10-16T16:00:00+00:00`. These are invented test inputs, not dispatch logs.
K1 checks 0/1/19/20 late out of 100; K3 checks 21/22/58/59 out of 400.
Every successful HTTP body is compared directly with the independently verified core.

Published team datasets now have a reusable live-HTTP runner, `verify_datasets.py`.
See `DATASET_ACCEPTANCE.md` for actual results and browser evidence, and
`DATASET_ACCEPTANCE.json` for exact settings, CSV hashes and numeric results.
