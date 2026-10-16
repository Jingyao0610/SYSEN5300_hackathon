# Data collections

Three separate collections are available: two synthetic collections and one real public-data extract. There are seven CSVs in total. Each analysis should import one CSV with the settings from its own codebook. Do not concatenate the alternative scenarios or mix real and synthetic records.

| Collection | Files and row counts | Codebook |
|---|---|---|
| Shifeng — synthetic | [stable.csv](shifeng_synthetic/stable.csv): 12,000; [zone_shift.csv](shifeng_synthetic/zone_shift.csv): 12,000; [edge_cases.csv](shifeng_synthetic/edge_cases.csv): 2,934 | [Shifeng codebook and settings](shifeng_synthetic/README.md) |
| Jingyao — synthetic | [stable.csv](jingyao_synthetic/stable.csv): 12,000; [zone_shift.csv](jingyao_synthetic/zone_shift.csv): 12,000; [edge_cases.csv](jingyao_synthetic/edge_cases.csv): 5,118 | [Jingyao codebook and settings](jingyao_synthetic/README.md) |
| Hayden — real NYC extract | [real_nyc_brooklyn_queens_sev2.csv](real_nyc_brooklyn_queens_sev2.csv): 26,209 cleaned rows | [Source, cleaning rules and settings](README_real_nyc.md) |

The two synthetic collections were generated independently for software demonstration and validation; neither was fitted to the NYC extract. They have different realized rates, row identifiers and edge fixtures. Keeping them separate preserves reproducibility. The real extract remains in its existing location so its source and cleaning instructions continue to work. The primary H-02 demonstration bundle is Jingyao's three CSVs. Shifeng's synthetic bundle and Hayden's real extract are supplementary scenarios, preserved separately. All seven CSVs have completed API/core and browser acceptance; see the dated [H-02 acceptance record](H02_ACCEPTANCE.md).

## Primary H-02 demonstration bundle

Use the three files in `data/jingyao_synthetic/` for the required stable, planted-shift and edge-case demonstration. This fulfills the 2–3-dataset requirement while keeping the seven CSVs in their separate collections.

| File | Rows | Analysis time in America/New_York | Expected result after permitted baseline confirmations |
|---|---:|---|---|
| `jingyao_synthetic/stable.csv` | 12,000 | `2026-10-01T00:00:00-04:00` | P1 and P2: 0 formal signals |
| `jingyao_synthetic/zone_shift.csv` | 12,000 | `2026-10-01T00:00:00-04:00` | P1: 8 high-rate days in A; P2: 0 signals |
| `jingyao_synthetic/edge_cases.csv` | 5,118 | `2026-10-01T12:00:00-04:00` | P1: 5,107 usable / 11 excluded overall, 0 signals; insufficient and provisional states remain explicit |

All three use target 10 minutes and baseline cutoff `2026-09-21T00:00:00-04:00`. For regular files, review A and B; for the edge file only EDGE has a usable baseline that the UI can confirm. The edge file contains no P2 category. Its selected-P1 accounting is 5,117 total / 5,107 usable / 10 excluded, plus one unassigned-priority row in overall coverage.

Reproduce and verify without overwriting these source CSVs:

```bash
ls data/jingyao_synthetic/*.csv
python data/jingyao_synthetic/verify.py
```

The [complete codebook](jingyao_synthetic/README.md) defines seed 5300, generation assumptions, field collection procedures, the fixed settings and edge scenarios. Formal browser evidence is linked in [H02_ACCEPTANCE.md](H02_ACCEPTANCE.md). Other collections must use their own codebook settings; none were merged or recalibrated during acceptance.

## Shared input columns

| Column | Type / unit | Interpretation and potential real collection |
|---|---|---|
| incident_id | Text identifier; no physical unit | Identifies a record. Synthetic rows represent dispatched responses; the NYC extract identifies incidents. A dispatch system supplies the identifier; these levels are not interchangeable for incidents with multiple units. |
| zone | Text category | Fictional A/B or edge groups in synthetic files; Brooklyn/Queens borough labels in the real extract. An operational system records the service area. |
| priority | Text category | Synthetic P1/P2 have no clinical meaning. The real extract uses the source's initial severity code, stored as the string `"2"`. Preserve source classification definitions. |
| dispatched_at | Offset-aware ISO 8601 timestamp, second resolution | Synthetic dispatch event; mapped to first_assignment_datetime in the NYC extract. A dispatch system timestamps assignment events. |
| on_scene_at | Offset-aware ISO 8601 timestamp, second resolution | Synthetic arrival event; mapped to first_on_scene_datetime in the NYC extract. An operational system records arrival events. |

The application derives elapsed response time in minutes and groups by New York dispatch date. A completed response is late only when its duration is greater than the chosen target. Use each collection's exact baseline cutoff, selected priority and as_of value; the illustrative 10-minute target is not a clinical standard. Missing or invalid fields are not zero-time responses.

The real extract has already undergone upstream cleaning; zero app exclusions would not mean zero exclusions from the original source. Its incident-level first-assignment-to-first-arrival metric also differs from unit-level response records when several units respond. Read the source-specific codebook before making comparisons.
