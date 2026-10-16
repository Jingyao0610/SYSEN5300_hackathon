# real_nyc_brooklyn_queens_sev2.csv — REAL public data (not synthetic)

This is the fourth test dataset. Unlike `stable.csv`, `zone_shift.csv` and `edge_cases.csv`, it is **real, public
dispatch data**. It shows that the five inputs our tool asks for are fields a 911 computer-aided dispatch (CAD)
system already records.

## Source

- **Dataset:** NYC Open Data, "EMS Incident Dispatch Data", dataset id `76xm-jjuj`
  (https://data.cityofnewyork.us/d/76xm-jjuj), published by the City of New York from the FDNY EMS CAD system.
- **Retrieved:** 2026-10-16, through the Socrata API.
- **Privacy:** the City aggregates locations above street level (HIPAA). There is no patient information.

### Raw extract (SoQL query, reproducible)

```
GET https://data.cityofnewyork.us/resource/76xm-jjuj.csv
$where = borough in ('BROOKLYN','QUEENS')
         AND initial_severity_level_code = '2'
         AND incident_datetime >= '2026-08-01T00:00:00'
         AND incident_datetime <  '2026-10-01T00:00:00'
$order = incident_datetime, incident_id
$limit = 100000
```

The raw extract has 27,231 rows and is not committed (about 5 MB). Run the query again to rebuild it, then run
`python data/clean_nyc_ems.py RAW.csv data/real_nyc_brooklyn_queens_sev2.csv`.

**Why severity 2:** severity 1 has only about 15 calls per borough per day, which is too few for a daily p chart.
Severity 2 is still high-acuity and has about 250 (Brooklyn) and 180 (Queens) valid responses per day, so
`n·p̄ ≥ 5` holds on every day.

## Cleaning (`data/clean_nyc_ems.py`)

Each dropped row is counted under the first rule it fails.

| Rule | Keeps | Dropped |
|---|---|---|
| R1 | FDNY marks the response time valid (`valid_incident_rspns_time_indc = 'Y'`) | 797 |
| R2 | Both assignment and on-scene times are present | 0 (covered by R1) |
| R3 | Normal incident: not `CANCEL` disposition, not standby, not reopened | 115 |
| R4 | On-scene time is strictly after assignment (0-minute arrivals are treated as entry artifacts) | 110 |
| R5 | Dispatch date is 2026-08-01 to 2026-09-30 (New York) | 0 |
| R6 | `incident_id` is unique | 0 |
| **Kept** | **26,209 rows (Brooklyn 15,351, Queens 10,858)** | 1,022 |

Long response times are **kept**. The longest is 139 minutes. Extreme delays are what the tool must surface,
not noise to delete.

## Column mapping

| Our column | Source field | Notes |
|---|---|---|
| `incident_id` | `incident_id` | CAD incident number |
| `zone` | `borough` | `BROOKLYN`, `QUEENS` |
| `priority` | `initial_severity_level_code` | Dispatcher's initial code; 1 is most severe. All rows are `2` |
| `dispatched_at` | `first_assignment_datetime` | First unit assigned. Recorded automatically by CAD when the dispatcher assigns a unit |
| `on_scene_at` | `first_on_scene_datetime` | First unit on scene. Recorded when the crew presses "on scene" or radios arrival |

**Time zone:** the source timestamps carry no UTC offset. We attach America/New_York, which is `-04:00` (daylight
time) for this whole window.

## Demo settings and what the real core returns

Settings: `selected_priority = 2`, `target_minutes = 10`, `baseline_end = 2026-08-21T00:00:00-04:00` (20 baseline
days), `as_of = 2026-10-02T00:00:00-04:00`, `reviewed_zones = [BROOKLYN, QUEENS]`.

These are actual `analyze_response` output values, checked on 2026-10-16. They were not chosen in advance.

| Zone | Baseline p̄ (late / n) | Monitoring late rate | High-signal days |
|---|---|---|---|
| Brooklyn | 0.222 (1,134 / 5,106) | 0.241 | 6: Sep 4, 7, 11, 14, 29, 30 |
| Queens | 0.345 (1,254 / 3,632) | 0.368 | 2: Sep 6, 15 |

All 26,209 rows are usable (0 excluded).

**Hand check (Brooklyn, 2026-09-04):** n = 286, late = 85, rate = 0.2972.
UCL = 0.2221 + 3·√(0.2221·0.7779/286) = 0.2958, so 0.2972 > 0.2958 and the day is a high signal.

**Reading it:**
- Queens has a higher *baseline* late rate than Brooklyn. A p chart compares each zone with its own baseline, so
  it is not a ranking of zone quality.
- Brooklyn's September signals mean its late share rose above its own August pattern on those days.

## Limitations

- Severity is the initial dispatcher code, not the final assessment.
- Only completed responses with a valid FDNY response-time flag are included.
- Daily responses may not be independent; for example, a citywide surge raises lateness everywhere.
- The 10-minute target is an illustrative operational target, not a clinical standard.
