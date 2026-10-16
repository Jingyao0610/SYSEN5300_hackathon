# Synthetic statistical fixtures

These inputs are invented, deterministic hand-answer cases, not real dispatch records or the
random demonstration datasets owned by H-02. No random seed is needed: counts are exact.
`qc_cases.py` uses Python's standard library and the `America/New_York` timezone database.

- `record(...)`: one response, normally 8 minutes; keyword overrides introduce specific errors.
- `day_records(date, n, late, ...)`: exactly `n` responses; the first `late` take 12 minutes,
  the remainder 8 minutes. IDs include the zone, priority, date, and row index.
- `baseline_records(...)`: by default, September 1–20, 2026, with 10/100 late each day.
  Optional `(n, late)` pairs create weighted and degenerate baseline cases.
- `analysis_request(records, ...)`: the six core/API settings with 10-minute target,
  September 21 exclusive cutoff, October 1 fixed observation time, P1, and zone A reviewed.
- `k1_request(n=100, late=20, ...)`: complete K1 input; use n=400 for K3.
- `small_request.json` and `small_expected.json`: the complete hand-calculated 3/2/1 example
  copied from `docs/interfaces.md`; this fixture checks the entire response schema.

To import the helpers from another test without changing ownership of package files, load
`qc_cases.py` with `importlib.util.spec_from_file_location`, or add this fixture directory to
the test process's module search path and use `from qc_cases import k1_request`.
The application entry point is `from app.qc import analyze_response`; call
`analyze_response(**k1_request())`. API tests can POST that same dictionary.

Expected K1 baseline: 200/2000=0.10; n=100 limits [0.01, 0.19]. Expected K3 limits:
[0.055, 0.145] at n=400. Review must include closed/reviewed eligibility, strict boundaries,
weighted weekday rates, all excluded duplicate copies, and current-day suppression.
All figures are proportions until the display converts them to percentages.

## Handoff to Julian (H-04)

The core imports only Python's standard library. The runtime must supply the IANA
`America/New_York` timezone database; install `tzdata` on Windows or minimal environments
that lack it. `pytest` is needed to run `pytest tests/test_qc.py` from the repository root.
Julian owns the eventual declared dependencies in `app/requirements.txt`; H-03 does not edit it.
The current verification runtime is Python 3.12.14 with pytest 9.1.1 and timezone data available.
Call the core with explicit `reviewed_zones` and `as_of`; the API supplies the default clock value
and rejects a user-supplied future value. No API or frontend implementation is included in H-03.
