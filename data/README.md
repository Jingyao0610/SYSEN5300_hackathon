# Data collections

Three separate collections are available: two synthetic collections and one real public-data extract. There are seven CSVs in total. Each analysis should import one CSV with the settings from its own codebook. Do not concatenate the alternative scenarios or mix real and synthetic records.

| Collection | Files and row counts | Codebook |
|---|---|---|
| Shifeng — synthetic | [stable.csv](shifeng_synthetic/stable.csv): 12,000; [zone_shift.csv](shifeng_synthetic/zone_shift.csv): 12,000; [edge_cases.csv](shifeng_synthetic/edge_cases.csv): 2,934 | [Shifeng codebook and settings](shifeng_synthetic/README.md) |
| Jingyao — synthetic | [stable.csv](jingyao_synthetic/stable.csv): 12,000; [zone_shift.csv](jingyao_synthetic/zone_shift.csv): 12,000; [edge_cases.csv](jingyao_synthetic/edge_cases.csv): 5,118 | [Jingyao codebook and settings](jingyao_synthetic/README.md) |
| Hayden — real NYC extract | [real_nyc_brooklyn_queens_sev2.csv](real_nyc_brooklyn_queens_sev2.csv): 26,209 cleaned rows | [Source, cleaning rules and settings](README_real_nyc.md) |

The two synthetic collections were generated independently for software demonstration and validation; neither was fitted to the NYC extract. They have different realized rates, row identifiers and edge fixtures. Keeping them separate preserves reproducibility. The real extract remains in its existing location so its source and cleaning instructions continue to work. Final canonical demonstration selection and browser acceptance are separate team steps.

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
