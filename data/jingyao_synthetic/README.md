# Synthetic dispatch datasets — H-02 / Jingyao0610

Every record in this folder is **SYNTHETIC**. No patient information or real dispatch records are used. One row represents one dispatched response, not necessarily one distinct call. Invalid examples deliberately remain in the edge dataset.

| File | Contents / purpose |
|---|---|
| `stable.csv` | 12,000 rows, unchanged generating conditions; 2 zones × 2 priorities × 30 days × 100 responses. |
| `zone_shift.csv` | 12,000 rows; exactly the same 8,000 baseline records as stable. Only A/P1 monitoring durations can change. |
| `edge_cases.csv` | 5,118 deterministic rows demonstrating insufficient/degenerate groups, exclusions and time boundaries. |
| `generate.py` | Standard-library generator, seed 5300; regenerates all three CSVs. |
| `verify.py` | Reproduction, generation rules, boundary checks and complete core/API parity for five dataset/priority combinations. Also exports API requests. |
| `VERIFICATION.txt` | Actual local verification output; does not certify browser or live deployment acceptance. |

## Codebook and collection notes

CSV header: `incident_id,zone,priority,dispatched_at,on_scene_at`. Strings are case-sensitive after surrounding whitespace is stripped. Timestamps require ISO 8601 with UTC offset; grouping uses dispatch date in **America/New_York**. Units are elapsed minutes, calculated by the core from timestamp instants.

| Field | Type / unit / synthetic values | Who would collect it, when and how |
|---|---|---|
| `incident_id` | Unique text response ID; `SYN-` prefix, except intentional blank/duplicates | Computer-aided dispatch system creates a unique response ID at dispatch; associate each responding unit with its own record. |
| `zone` | Text service zone, A/B; edge labels below | Dispatcher/system records assigned service zone at dispatch using a documented zone map/version. |
| `priority` | Text category P1/P2; synthetic labels have no clinical meaning | Dispatcher logs the assigned category at dispatch under local policy; retain category definitions and changes for comparability. |
| `dispatched_at` | Offset-aware timestamp, seconds; September 2026 for regular data | Dispatch system logs the dispatch event from a synchronized clock. Preserve UTC/offset and audit corrections. |
| `on_scene_at` | Offset-aware arrival timestamp, seconds; may cross midnight | Responding crew marks arrival via mobile terminal/radio; dispatch system records the timestamp, source and subsequent corrections. |

In practice, reconcile duplicate IDs, delayed/manual entry, unit clock offsets, missing arrivals, category changes and historical corrections before interpreting results. Preserve missing values rather than impute zero. Validate against the source log; use access controls and de-identification before any real-data use. These files contain no such real-data collection.

## Generation and fixed analysis settings

```bash
python3 data/jingyao_synthetic/generate.py
python3 data/jingyao_synthetic/verify.py  # after installing app/requirements.txt
```

Optional `--output-dir PATH` regenerates to another folder. Seed is fixed at **5300**, with Python's local `random.Random` instance. The generator never searches seeds or filters results for attractive charts. Checked with Python 3.13.7; the byte comparison is authoritative for a given runtime.

Regular datasets: baseline September 1–20, monitoring September 21–30, 2026. Dispatches are uniformly sampled at second resolution in [08:00,20:00). For each row draw a uniform lateness variable and two positive integer durations: on-time 60–600 seconds, late 601–1800 seconds. Lateness probability is 0.15 everywhere except A/P1 monitoring in `zone_shift.csv`, where it is 0.35. Both files reuse the same random draws; increasing that probability changes only affected arrivals, preserving IDs and dispatches. Conditional durations and Bernoulli observations are simplified independent synthetic assumptions, without weekday, demand, traffic or case-mix effects.

Use `target_minutes=10`, `selected_priority=P1` (repeat P2), `baseline_end=2026-09-21T00:00:00-04:00`, `as_of=2026-10-01T00:00:00-04:00`. Review A and B baselines before requesting formal verdicts. Exactly ten minutes is on time. The ten-minute target is illustrative, not a clinical standard. Generation probabilities differ from realized proportions; stable conditions can still produce chance signals.

## Edge scenarios

Use P1, target 10, the same baseline cutoff, and **`as_of=2026-10-01T12:00:00-04:00`**. This explicit noon cutoff lets the cross-midnight response finish and makes October 1 provisional. Do not substitute the regular datasets' midnight cutoff: that changes exclusions.

| Group / ID | Intended coverage |
|---|---|
| EDGE | 20 baseline days, 10/100 late each; September 21 n=49 fails expected-count condition. October 1 is provisional, 20/100 late. |
| SHORT | 19 baseline days (5/50 late), insufficient baseline length; monitoring n=1. |
| ZERO / ONE | 20 baseline days of 0/50 or 50/50 late; degenerate proportions, no formal verdict. |
| NEW / BOUNDARY | No baseline. BOUNDARY includes exactly ten minutes, ten minutes plus one second, a dispatch exactly at the cutoff, and September 30 23:55 → October 1 00:05, grouped on September 30. |
| Invalid `SYN-*` rows | Missing arrival/dispatch, malformed/offset-free/reversed/future timestamps, empty ID/zone/priority; both rows sharing `SYN-duplicate` are excluded. |

Actual counts: overall **5118 total / 5107 usable / 11 excluded**; selected P1 **5117 / 5107 / 10**, plus one unassigned-priority row. Every excluded row is counted once. See verification output for actual statuses and reasons. Exact K0–K4 fixtures remain under `tests/fixtures/qc/`; random datasets are not substitutes for known-answer tests. All data describe recorded completed responses only, not all calls, cancellations or outstanding dispatches.

## Separate publication in the team repository

This collection was supplied by Shifeng as Jingyao's `Data(1).zip` and published with his authorization. All seven archive payloads matched Jingyao0610's previously reviewed commit `4eee6e2b143df64833eaddec055f3095d04012d2`. The CSVs, generator and original verification transcript are unchanged. Only repository-root discovery/import paths and the commands above were adapted for `data/jingyao_synthetic/`; directory-local Git attributes preserve LF line endings. macOS archive metadata is omitted.

Import one CSV at a time. The stable and shifted scenarios deliberately reuse baseline records and incident IDs, so do not concatenate them. This is a separate collection from [Shifeng's synthetic data](../shifeng_synthetic/README.md) and [Hayden's real NYC extract](../README_real_nyc.md). See the [data index](../README.md) for the three collections. No choice of a canonical demonstration set or browser acceptance is implied by publication.

Relocation validation on 2026-10-16: running `python data/jingyao_synthetic/verify.py` from the repository root passed byte-for-byte reproduction and all five complete core/API comparisons. Observed formal signals remain stable P1/P2: 0; shifted P1: 8, shifted P2: 0; edge P1: 0 with 5,107 usable / 11 excluded out of 5,118 rows. `VERIFICATION.txt` is the unchanged original transcript. Browser acceptance remains pending.
