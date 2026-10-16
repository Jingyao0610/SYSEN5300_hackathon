# Emergency Response — core and API interface agreement

**Final implementation contract v1.0 — 2026-10-16; released for H-04 implementation.**
This document makes the [SPEC](../SPEC.md), [implementation plan](plan.md), and
[five-person plan](team.en.md) concrete. The H-03 core implements this response schema and has
passed 112 tests plus an [independent statistical review](../tests/fixtures/qc/REVIEW.md).
Julian owns the backend integration; Pingchuan owns the frontend adaptation. The frontend's earlier
MOCK payload is a prototype, not an alternative API schema. Julian's backend fork has passed
independent HTTP verification (section 9) and is now merged. Pingchuan's real-browser acceptance
report is recorded in section 10; a formal H-02 dataset parity check remains open under H-04.
The separate H-01 team method walkthrough is not claimed complete by this interface release.

The method is a daily p chart of late completed responses, separately for each zone within one
selected priority. All validation of records, response durations, statistical counts, rates, limits,
signals, and weekday summaries come from `app/qc.py`. FastAPI transports the result; React displays it.

## 1. The method in everyday language

Suppose a zone's historical baseline contains 2,000 completed responses over 20 days, of which
200 were late. Its baseline late proportion is `200 / 2000 = 0.10`, or 10%.
For a later day with 100 completed responses, the standard error is
`sqrt(0.10 * 0.90 / 100) = 0.03`. The upper control limit is
`0.10 + 3 * 0.03 = 0.19`, or 19%. Twenty late responses out of 100 exceed that limit;
19 out of 100 are exactly on it and do not signal. The lower limit is 1%.

The **10-minute operational target** decides whether an individual response was late.
The **19% control limit** asks whether a day's proportion of late responses is unusually high
relative to that zone's baseline. These are different quantities. A day with 400 responses has
less sampling variation: its upper limit is 14.5%, and its lower limit is 5.5%.
Daily sample size changes the limits even when the baseline remains fixed.

Those formal verdicts also require a reviewed baseline, a closed day, and the data checks below.
An individual late response need not be a statistical outlier. A stable rate can still miss the
operational target. “No crossing signal found” does not mean “proven in control.”

## 2. Shared types and normalization

- JSON `number` means a finite number; `NaN` and infinity are never valid inputs or outputs.
  Python boolean values do not count as numeric settings. Counts are nonnegative integers.
- Proportions are numbers in `[0, 1]`, not percentages. Display formatting may show `100 * rate`;
  all calculations and decisions use unrounded values. JSON `null` maps to Python `None`.
- Identifiers are strings. Strip surrounding whitespace from `incident_id`, `zone`, `priority`,
  `selected_priority`, and entries in `reviewed_zones`. Empty identifiers are invalid. Preserve
  internal whitespace and case; `A` and `a` are different identifiers. Never coerce a number into an ID.
- Input timestamps are ISO 8601 datetime strings with an explicit UTC offset, including `Z`.
  Date-only strings and datetimes without offsets are invalid. Interpret each value as an instant.
  Convert both incident timestamps to UTC before subtracting them; this preserves elapsed time
  across daylight-saving transitions. Group by the dispatch instant's date in `America/New_York`.
- Output dates are `YYYY-MM-DD`. Output `as_of` and incident timestamps use UTC with `+00:00`.
  Output `baseline_end` uses New York local midnight and its applicable offset.
- No result contains an invented zero rate for an absent or unusable group. `n=0` means
  `late=0`, `rate=null`, and no control verdict. A coverage fraction of zero is meaningful when
  rows were imported but none were usable; it is not a response-performance estimate.

The intended implementation uses Python standard-library arithmetic, `datetime`, and `zoneinfo`.
The runtime must provide the IANA `America/New_York` timezone data. Julian owns dependency setup;
if a runtime needs the `tzdata` package, request it from him rather than editing requirements under H-03.

## 3. Plain function and request fields

```python
analyze_response(
    records, target_minutes, selected_priority,
    baseline_end, reviewed_zones, as_of
) -> dict
```

The six function arguments are explicit. The function reads no clock, filesystem, network, or global
session state and does not modify its input. Repeating the same inputs returns the same response.
API defaults are resolved before calling it. Invalid overall parameters or record-list structure
raise `ValueError` with a readable explanation; row errors return exclusions, not exceptions.
The API maps input-related `ValueError` to HTTP 422. An unavailable timezone database is a runtime
configuration failure, not a bad user input.

| Request/function field | Type | Required/default | Meaning and validation |
|---|---|---|---|
| `records` | array of objects / Python list of mappings | Required; `[]` is valid | Imported rows in original order. Each nonempty object list must collectively contain all five required record keys. Every array element must be a mapping; a non-object element is a structural error |
| `target_minutes` | number | Required | Finite and strictly positive. The UI may initialize it to the illustrative value 10 |
| `selected_priority` | string | Required | One normalized category. Category-presence rules below apply |
| `baseline_end` | offset-aware datetime string | Required | Exclusive cutoff. After conversion to New York it must be exactly local midnight and no later than midnight starting the local `as_of` day |
| `reviewed_zones` | array of nonempty strings | API default `[]`; explicit in core | Zones whose baselines the supervisor has reviewed for these data and settings. Deduplicate and sort for output. Unknown zone names have no effect on absent groups |
| `as_of` | offset-aware datetime string | API may omit; explicit in core | Analysis observation cutoff. API fills an omitted value from its server clock and rejects a supplied future value. Core compares records to this explicit instant and never consults the clock |

Only these six top-level request fields are part of this version's request contract; unsupported
top-level fields return HTTP 422. Defaults apply only to omitted `reviewed_zones` and `as_of`;
explicit null values are invalid. Preserve the documented types instead of coercing a string or
boolean into a numeric setting. Record objects may carry extra imported columns; the core ignores
those columns and the browser retains them for export. The API must not validate every incident
into a strict model that rejects the entire batch for an individually malformed timestamp or missing arrival.

### Record columns

| Record field | Valid value | Required row-level behavior |
|---|---|---|
| `incident_id` | Nonempty string, unique across the whole import | Exclude **every** row with a duplicated normalized ID, even when the duplicates have different priorities or one copy has other errors |
| `zone` | Nonempty string | A previously unseen zone is valid; it can lack a baseline |
| `priority` | Nonempty string | Determines membership in selected-priority counts; not selected does not mean invalid |
| `dispatched_at` | Offset-aware datetime string | Must not be after `as_of`; supplies local date and baseline/monitoring assignment |
| `on_scene_at` | Offset-aware datetime string | Must not precede dispatch or be after `as_of`; equal dispatch and arrival is a usable zero-minute response |

A missing key, `null`, or blank string is a missing field. A present value of the wrong type is
invalid. A parsed datetime without an offset is a separate naive-timestamp error. No arbitrary
maximum duration is imposed. An arrival after the baseline cutoff does not change membership:
the **dispatch instant** alone assigns the response to baseline or monitoring.

### Category presence and empty input

Known category labels are the nonempty string priorities found anywhere in the imported records,
including excluded rows. First validate rows globally, independent of the selection.

1. If the selected label is known, accept it even when every row with that label is excluded.
2. If the label is unknown and at least one globally usable row exists, raise `ValueError` / HTTP 422
   for `selected_priority`. Do not silently substitute another priority.
3. Empty input or an entirely invalid import is allowed to return an empty analysis even when
   there is no known selected label. Do not turn its row-quality explanation into an unknown-category error.

An empty CSV must still contain the five required header names; the browser checks this before
creating `records=[]`. The JSON API cannot recover CSV headers from an empty array. For a nonempty
JSON list, a required key absent from **every** mapping is an overall missing-column error (422).
A required key absent from only some mappings is a row-level exclusion (200).

### Time rules and analysis lifecycle

- A timestamp equal to `as_of` is allowed; a later dispatch or arrival is excluded.
- Baseline records have `dispatched_at < baseline_end`; equality belongs to monitoring.
- The current local date is the date of `as_of` in New York. Earlier dates are closed. Local
  calendar days can be 23 or 25 hours; do not define a day as a fixed 24-hour UTC interval.
- `baseline_end` expressed in a different offset is allowed only if its instant converts to
  exactly New York midnight. For example, `2026-09-21T04:00:00Z` is that day's local midnight.
- The frontend clears baseline confirmations and marks old results stale when data, target,
  priority, or cutoff changes. A historical correction or addition creates an explicitly labeled
  new analysis when the user runs it. The core recomputes only from the request; it persists no baseline.
- Appending valid, uniquely identified monitoring records does not alter the baseline because its
  cutoff remains fixed. Duplicates or corrections affecting baseline validity create a new analysis
  and require renewed review; a new duplicate of a baseline ID excludes both copies globally.
  A date closing alone does not establish that all responses were completed or logged.

## 4. Successful response schema

Every successful response has exactly these top-level containers. Empty arrays are valid.

| Field | Type | Contents |
|---|---|---|
| `meta` | object | Resolved settings, time, version, and mock disclosure |
| `quality` | object | Global and selected-priority row accounting, coverage, empty-result explanation |
| `excluded_records` | array of exclusion objects | Invalid rows from **all** priorities, including every duplicate copy |
| `zone_baselines` | array of baseline objects | Baseline diagnostics for zones represented in the selected analysis |
| `daily_points` | array of daily-point objects | Observed monitoring dates only, for the selected priority |
| `signals` | array of daily-point objects | Exact copies of `daily_points` items whose status is `high` or `low` |
| `late_incidents` | array of incident objects | Usable late records in the selected priority, from both baseline and monitoring |

### `meta`

| Key | Type | Value/meaning |
|---|---|---|
| `schema_version` | string | `"1.0"` |
| `timezone` | string | `"America/New_York"` |
| `as_of` | string | Resolved analysis instant, normalized to UTC |
| `current_local_date` | string | Local date derived from `as_of` |
| `target_minutes` | number | Resolved positive operational target |
| `selected_priority` | string | Normalized chosen label |
| `baseline_end` | string | Resolved exclusive local-midnight cutoff |
| `reviewed_zones` | array of strings | Normalized, unique, sorted confirmations |
| `is_mock` | boolean | `false` from the real core. An explicitly enabled mock API sets it to `true`; React must display MOCK prominently |

`is_mock=false` says that actual computation was used; it does not claim the supplied records are
real-world data. Synthetic datasets remain labeled synthetic in their codebook and the interface.

### `quality`

| Key | Type | Meaning |
|---|---|---|
| `overall` | count object | All imported rows, regardless of priority |
| `selected_priority` | count object | Rows whose normalized priority exactly matches the selected label, including invalid rows |
| `unassigned_priority_rows` | integer | Imported rows with a missing or invalid priority; included in overall exclusions, never assigned to selected counts |
| `reasons` | array of strings | Empty normally; empty-result code as defined below |

Each count object contains exactly:

| Key | Type | Meaning |
|---|---|---|
| `total_rows` | integer | Number of rows in that scope |
| `usable_rows` | integer | Rows passing every row-validity check, regardless of whether a formal chart verdict is possible |
| `excluded_rows` | integer | Invalid rows, counted once per original row |
| `usable_fraction` | number or null | `usable_rows / total_rows`; null only if `total_rows=0` |

For both scopes, `total_rows = usable_rows + excluded_rows`. Multiple reasons never multiply a row's
exclusion count. Other-priority valid rows contribute to global coverage but not selected statistics.
These fractions measure usable coverage of the **import**, not coverage of all dispatched calls.

If no selected-priority usable records remain, `zone_baselines`, `daily_points`, `signals`, and
`late_incidents` are all empty. Preserve counts and all exclusions. `quality.reasons` then contains
one of: `empty_input` if there are no imported rows; `no_usable_imported_records` if the nonempty import
has no usable rows; otherwise `no_usable_selected_records`. No rate of zero is manufactured.

### `excluded_records[]`

| Key | Type | Meaning |
|---|---|---|
| `row_number` | integer | Original array index + 1; excludes the CSV header |
| `incident_id` | string or null | Normalized identifier if it is a valid nonempty string, otherwise null |
| `zone` | string or null | Normalized identifier if valid, otherwise null |
| `priority` | string or null | Normalized identifier if valid, otherwise null |
| `reasons` | array of strings | One or more codes below, deduplicated and in the specified order |

Reason codes have this fixed order:

1. `missing_incident_id`, `invalid_incident_id`, `missing_zone`, `invalid_zone`,
   `missing_priority`, `invalid_priority`.
2. `missing_dispatched_at`, `invalid_dispatched_at`, `naive_dispatched_at`,
   `missing_on_scene_at`, `invalid_on_scene_at`, `naive_on_scene_at`.
3. `reversed_timestamps`, `future_dispatched_at`, `future_on_scene_at`, `duplicate_incident_id`.

For an individual field, missing/invalid/naive are mutually exclusive. Test temporal relationships
only when the needed timestamps parsed with offsets. Future and reversed errors can coexist.
Detect duplicates across all rows with valid normalized IDs before filtering any rows or priorities;
add the duplicate code to every member of a duplicate group. UI may show the original record it
already holds, joined by `row_number`.

### `zone_baselines[]`

| Key | Type | Meaning |
|---|---|---|
| `zone` | string | Selected-priority zone |
| `priority` | string | Same as `meta.selected_priority` |
| `reviewed` | boolean | Whether this zone is in `meta.reviewed_zones` |
| `nonempty_days` | integer | Number of local baseline dates with at least one usable response |
| `n` | integer | Total usable baseline completed responses |
| `late` | integer | Total late baseline completed responses |
| `p_bar` | number or null | `late / n`; null if no usable baseline |
| `status` | string enum | `ready`, `unreviewed_baseline`, or `insufficient_data` |
| `reasons` | array of strings | Baseline reasons, ordered as below |
| `daily` | array of baseline-day objects | Usable nonempty baseline days, in date order |
| `weekday` | array of seven weekday objects | Monday through Sunday, always all seven slots |

Each `daily` item is exactly `{date: string, n: integer, late: integer, rate: number}`.
Each `weekday` item is exactly `{weekday: integer, label: string, nonempty_days: integer,
n: integer, late: integer, rate: number|null}`. Weekdays are `0=Monday` through `6=Sunday`;
`label` is the corresponding full English weekday name. Aggregate by sums:
`rate = sum(late) / sum(n)`, not an average of dates' rates. An unrepresented weekday has
`nonempty_days=0, n=0, late=0, rate=null`. Weekday summaries include baseline records only.

Baseline reasons, in order: `no_baseline` if `n=0`; otherwise `baseline_fewer_than_20_days` if
`nonempty_days<20`, followed by `baseline_rate_degenerate` if `p_bar` is 0 or 1; finally
`baseline_unreviewed` whenever review is absent. The baseline status is `insufficient_data` if
any of the first three reasons applies, otherwise `unreviewed_baseline` if review is absent,
otherwise `ready`. A ready baseline still does not establish independence or process stability.

### `daily_points[]` and `signals[]`

| Key | Type | Meaning |
|---|---|---|
| `zone` | string | Service zone |
| `priority` | string | Selected priority |
| `date` | string | Local dispatch date, on/after the cutoff date |
| `n` | integer | Usable completed responses in this zone/date |
| `late` | integer | Those with `response_minutes > target_minutes` |
| `rate` | number or null | `late / n`; null when `n=0` |
| `p_bar` | number or null | Corresponding zone's fixed baseline estimate |
| `lower` | number or null | Lower control limit at this day's n |
| `upper` | number or null | Upper control limit at this day's n |
| `expected_late` | number or null | `n * p_bar`; null when `n=0` or baseline is absent |
| `expected_on_time` | number or null | `n * (1 - p_bar)`; same null rule |
| `is_closed` | boolean | `date < meta.current_local_date` |
| `baseline_reviewed` | boolean | Corresponding zone's review flag |
| `status` | string enum | `high`, `low`, `no_signal`, `insufficient_data`, `unreviewed_baseline`, or `provisional_current_day` |
| `reasons` | array of strings | Every applicable no-verdict reason, in the order below; empty for formal verdicts |

Use these limits when `n>0`, baseline `n>0`, `0<p_bar<1`, and both expected counts are at least 5:

```text
SE = sqrt(p_bar * (1 - p_bar) / n)
lower = max(0, p_bar - 3 * SE)
upper = min(1, p_bar + 3 * SE)
```

Keep these estimable limits visible even if the baseline has fewer than 20 days, the baseline is
unreviewed, or the day is provisional. The status and reasons prohibit a formal verdict in those
cases. Return null limits when either expected count is below 5, there are no usable daily
observations, no baseline, or a degenerate baseline rate of 0 or 1. The latter provides no usable
variation estimate for this chart policy. Keep `p_bar=0` or 1
and the observed daily rate visible; null limits do not mean the observed rate is missing.

Point reasons have this fixed order:

1. `no_usable_observations` when `n=0`.
2. `no_baseline`, or `baseline_fewer_than_20_days` when a baseline exists but has fewer than 20 nonempty days.
3. `baseline_rate_degenerate` when `p_bar` is 0 or 1.
4. `expected_late_below_5` and then `expected_on_time_below_5` when the respective computed value is below 5.
5. `baseline_unreviewed` when review is absent.
6. `current_day_provisional` when `is_closed=false`.

Keep all applicable reasons even when more than one status condition applies. Choose the single
`status` using this precedence:

1. Any reason from steps 1–4: `insufficient_data`.
2. Otherwise an open current day: `provisional_current_day`.
3. Otherwise an unreviewed baseline: `unreviewed_baseline`.
4. Otherwise `high` if `rate - upper > 1e-12`; `low` if `lower - rate > 1e-12`;
   `no_signal` otherwise.

The absolute tolerance applies only to proportion-boundary comparisons. Expected-count eligibility
uses `expected_late >= 5` **and** `expected_on_time >= 5`. Operational target equality is not late;
there is no 1e-12 tolerance added to the target. No additional run rules apply.
Thus a current-day point can have primary status `insufficient_data` and also carry
`current_day_provisional`; the UI must show both. A high-looking unreviewed or provisional point
never enters `signals`. An empty signals array alone does not mean “no signal”: read point statuses.

### Which zones and dates appear

When at least one selected-priority record is usable, include zones and monitoring dates observed in
that priority whose zone and offset-aware dispatch timestamp are valid and whose dispatch is not
after `as_of`. This can preserve an observed date whose rows all failed other checks: emit `n=0`,
`late=0`, `rate=null`, null limits, and `no_usable_observations`. Such rows do not enter any denominator.
A future dispatch never creates a chart date or a zone; it appears only in exclusions. A valid past
dispatch with a future arrival may identify an observed date, but that row remains excluded.

Do not generate calendar dates between observations or dates before/after the observed range.
Do not infer zero calls on a day absent from the import. Baseline `daily` contains only usable
nonempty days; `nonempty_days` cannot count excluded-only dates. A zone observed only during
monitoring gets a baseline object with `n=0`, `p_bar=null`, no daily baseline items, and seven empty
weekday slots. If there are no selected usable records at all, the empty-analysis rule above takes
precedence and all four analysis arrays are empty.

### `late_incidents[]`

| Key | Type | Meaning |
|---|---|---|
| `row_number` | integer | Original input row number |
| `incident_id` | string | Normalized unique identifier |
| `zone` | string | Normalized zone |
| `priority` | string | Selected priority |
| `dispatched_at` | string | Dispatch instant normalized to UTC |
| `on_scene_at` | string | Arrival instant normalized to UTC |
| `date` | string | Local dispatch date |
| `phase` | string enum | `baseline` or `monitoring`, by dispatch cutoff |
| `response_minutes` | number | UTC elapsed seconds divided by 60, unrounded |

Only usable, selected-priority, late records appear. Being in this table does not imply a control
signal; a record may be late on a no-signal, insufficient, unreviewed, or provisional day.

### Deterministic ordering

Use case-sensitive ordinary Unicode string ordering for identifiers. Sort `reviewed_zones` and
`zone_baselines` by zone. Sort baseline days by date; weekday slots are 0–6. Sort `daily_points`
and `signals` by `(zone, date)`. Sort exclusions by original `row_number`. Sort late incidents by
`(zone, date, dispatched_at UTC instant, incident_id, row_number)`. Input order determines row numbers,
not statistical results. Reason order is fixed above. React may filter or reorder returned items;
it must not recompute aggregations to create new statistical groups.

## 5. HTTP endpoints and errors

### `GET /health`

No request body. HTTP 200 when the service can answer requests:

```json
{"status":"ok","schema_version":"1.0","analysis_mode":"real"}
```

`status` is the string `ok`; `schema_version` is `1.0`; `analysis_mode` is `real`, `mock`, or
`unavailable`. A health-only early deployment can use `unavailable` until the verified core is
integrated. Health reports runtime readiness, not proof that the statistical method was validated
or that the task/deployment is complete.

### `POST /analyze`

Accept `application/json` using the six fields in section 3. Sample the server clock once per
request. Resolve omitted `as_of` to that instant; reject explicit `as_of` later than that instant;
pass its normalized string to the core. The API performs request-envelope validation and clock
resolution; the core handles record validity and all calculations. Return the core response as JSON
without rounding or recalculating it. Tests can inject the API's clock separately from core tests.

| Situation | HTTP status | Behavior |
|---|---|---|
| Valid parameters and usable input | 200 | Full response |
| Row-level errors, insufficient data, or no usable rows | 200 | Full response with exclusions/statuses/empty-result reasons |
| Missing required top-level input, invalid setting, invalid list structure, overall missing required column, unknown selected category under the rule above, or future API `as_of` | 422 | Validation error object; no partial analysis |
| Core not yet available in real mode | 503 | Service-unavailable error; never substitute a mock response |
| Unexpected runtime failure | 500 | Generic analysis-failed error; do not expose a traceback or credentials |

Error responses have one top-level `error` object, containing `code` (string), `message` (readable
string), and `fields` (array of affected top-level field names; may be empty for runtime failures).
Use code `invalid_request` for 422, `analysis_unavailable` for 503, and `analysis_failed` for 500.
Map framework envelope-validation errors into this same shape. For example:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "target_minutes must be a finite number greater than zero.",
    "fields": ["target_minutes"]
  }
}
```

## 6. Complete small request and response

This hand-worked **synthetic interface example** is checked against the real core by an automated
test; an implemented HTTP endpoint has not yet been verified. It has three imported P1 rows:
two usable and one missing arrival. One on-time baseline record
gives `p_bar=0` on only one baseline day; one late monitoring response gives an observed rate of 1.
Neither a valid normal-approximation chart nor a formal control verdict is available.
`as_of` is fixed, all dispatch dates are closed, and no baseline has been confirmed.

Request:

```json
{
  "records": [
    {
      "incident_id": "E001",
      "zone": "A",
      "priority": "P1",
      "dispatched_at": "2026-09-20T10:00:00-04:00",
      "on_scene_at": "2026-09-20T10:08:00-04:00"
    },
    {
      "incident_id": "E002",
      "zone": "A",
      "priority": "P1",
      "dispatched_at": "2026-09-21T10:00:00-04:00",
      "on_scene_at": "2026-09-21T10:12:00-04:00"
    },
    {
      "incident_id": "E003",
      "zone": "A",
      "priority": "P1",
      "dispatched_at": "2026-09-21T11:00:00-04:00",
      "on_scene_at": null
    }
  ],
  "target_minutes": 10,
  "selected_priority": "P1",
  "baseline_end": "2026-09-21T00:00:00-04:00",
  "reviewed_zones": [],
  "as_of": "2026-09-22T08:00:00-04:00"
}
```

Expected HTTP 200 body:

```json
{
  "meta": {
    "schema_version": "1.0",
    "timezone": "America/New_York",
    "as_of": "2026-09-22T12:00:00+00:00",
    "current_local_date": "2026-09-22",
    "target_minutes": 10,
    "selected_priority": "P1",
    "baseline_end": "2026-09-21T00:00:00-04:00",
    "reviewed_zones": [],
    "is_mock": false
  },
  "quality": {
    "overall": {"total_rows": 3, "usable_rows": 2, "excluded_rows": 1, "usable_fraction": 0.6666666666666666},
    "selected_priority": {"total_rows": 3, "usable_rows": 2, "excluded_rows": 1, "usable_fraction": 0.6666666666666666},
    "unassigned_priority_rows": 0,
    "reasons": []
  },
  "excluded_records": [
    {"row_number": 3, "incident_id": "E003", "zone": "A", "priority": "P1", "reasons": ["missing_on_scene_at"]}
  ],
  "zone_baselines": [
    {
      "zone": "A",
      "priority": "P1",
      "reviewed": false,
      "nonempty_days": 1,
      "n": 1,
      "late": 0,
      "p_bar": 0,
      "status": "insufficient_data",
      "reasons": ["baseline_fewer_than_20_days", "baseline_rate_degenerate", "baseline_unreviewed"],
      "daily": [{"date": "2026-09-20", "n": 1, "late": 0, "rate": 0}],
      "weekday": [
        {"weekday": 0, "label": "Monday", "nonempty_days": 0, "n": 0, "late": 0, "rate": null},
        {"weekday": 1, "label": "Tuesday", "nonempty_days": 0, "n": 0, "late": 0, "rate": null},
        {"weekday": 2, "label": "Wednesday", "nonempty_days": 0, "n": 0, "late": 0, "rate": null},
        {"weekday": 3, "label": "Thursday", "nonempty_days": 0, "n": 0, "late": 0, "rate": null},
        {"weekday": 4, "label": "Friday", "nonempty_days": 0, "n": 0, "late": 0, "rate": null},
        {"weekday": 5, "label": "Saturday", "nonempty_days": 0, "n": 0, "late": 0, "rate": null},
        {"weekday": 6, "label": "Sunday", "nonempty_days": 1, "n": 1, "late": 0, "rate": 0}
      ]
    }
  ],
  "daily_points": [
    {
      "zone": "A",
      "priority": "P1",
      "date": "2026-09-21",
      "n": 1,
      "late": 1,
      "rate": 1,
      "p_bar": 0,
      "lower": null,
      "upper": null,
      "expected_late": 0,
      "expected_on_time": 1,
      "is_closed": true,
      "baseline_reviewed": false,
      "status": "insufficient_data",
      "reasons": [
        "baseline_fewer_than_20_days",
        "baseline_rate_degenerate",
        "expected_late_below_5",
        "expected_on_time_below_5",
        "baseline_unreviewed"
      ]
    }
  ],
  "signals": [],
  "late_incidents": [
    {
      "row_number": 2,
      "incident_id": "E002",
      "zone": "A",
      "priority": "P1",
      "dispatched_at": "2026-09-21T14:00:00+00:00",
      "on_scene_at": "2026-09-21T14:12:00+00:00",
      "date": "2026-09-21",
      "phase": "monitoring",
      "response_minutes": 12
    }
  ]
}
```

## 7. K1 point examples and combined states

Use a deterministic zone A / priority P1 baseline with 20 nonempty days, 100 responses each,
10 late per day, `baseline_end=2026-09-21T00:00:00-04:00`, and `target_minutes=10`.
Unless a row below says otherwise, use `reviewed_zones=["A"]` and
`as_of=2026-09-23T00:00:00-04:00`; the monitoring date is September 21.
The 2,000 baseline rows will be generated in test fixtures, not pasted into this document.

A full K1 high point, copied unchanged into `signals`, is:

```json
{
  "zone": "A",
  "priority": "P1",
  "date": "2026-09-21",
  "n": 100,
  "late": 20,
  "rate": 0.2,
  "p_bar": 0.1,
  "lower": 0.01,
  "upper": 0.19,
  "expected_late": 10,
  "expected_on_time": 90,
  "is_closed": true,
  "baseline_reviewed": true,
  "status": "high",
  "reasons": []
}
```

Decimal limits here are the mathematical values; implementations may return nearby binary-floating
representations. Numeric assertions compare with absolute tolerance `1e-12`, not JSON text equality.

| Variant | Returned rate and limits | Status | Reasons | In `signals`? |
|---|---|---|---|---|
| Closed, reviewed; n=100, late=0 | 0; [0.01, 0.19] | `low` | `[]` | Yes |
| Closed, reviewed; n=100, late=1 | 0.01; [0.01, 0.19] | `no_signal` | `[]` | No |
| Closed, reviewed; n=100, late=19 | 0.19; [0.01, 0.19] | `no_signal` | `[]` | No |
| Closed, reviewed; n=100, late=20 | 0.20; [0.01, 0.19] | `high` | `[]` | Yes |
| Same 20/100, `reviewed_zones=[]` | 0.20; [0.01, 0.19] | `unreviewed_baseline` | `["baseline_unreviewed"]` | No |
| Same 20/100, as_of on September 21 after every recorded arrival | 0.20; [0.01, 0.19] | `provisional_current_day` | `["current_day_provisional"]` | No |
| Same current-day case, also unreviewed | 0.20; [0.01, 0.19] | `provisional_current_day` | `["baseline_unreviewed", "current_day_provisional"]` | No |
| Closed, reviewed; n=49, late=5 | 5/49; null limits | `insufficient_data` | `["expected_late_below_5"]` | No |
| Closed, reviewed; n=50, late=5 | 0.10; estimable limits retained | `no_signal` | `[]` | No |
| Current day, unreviewed; n=49, late=5 | 5/49; null limits | `insufficient_data` | `["expected_late_below_5", "baseline_unreviewed", "current_day_provisional"]` | No |
| Observed date with only invalid responses; selected usable records exist elsewhere | null; null limits | `insufficient_data` | Includes `no_usable_observations` and any other applicable reasons | No |

For the current-day cases, the baseline is still strictly before local midnight on September 21,
so the baseline cutoff is valid. Record timestamps must already be at or before the chosen `as_of`.

## 8. Required implementation checks and handoff

The H-03 core checks have passed; see the [numerical review](../tests/fixtures/qc/REVIEW.md).
The API and browser checks below define H-04 acceptance; section 9 records the isolated backend
checks now completed, and section 10 records the teammate's browser acceptance report. H-03 owns core fixtures/tests;
H-04 owns API fixtures/tests and browser checks. Keep their file ownership separate.

| Case | Required check |
|---|---|
| K0 | 10 minutes exactly is on time; 10 minutes + 1 second is late. UTC elapsed duration and returned minutes agree |
| K1 | The 20-day 200/2000 baseline yields p_bar=0.10; n=100 yields SE=0.03 and [0.01, 0.19]; 0/1/19/20 late give low/no_signal/no_signal/high when eligible |
| K2 | Ten baseline days of 6/100 plus ten of 34/300 yield 400/4000=0.10, not 0.0866667. Append only monitoring rows and verify unchanged baseline and unchanged limits for unchanged n |
| K3 | Same baseline, n=400: SE=0.015, limits [0.055, 0.145]; 21/22/58/59 late give low/no_signal/no_signal/high. Core, API, and UI show matching values |
| K4 | Two baseline dates in the same weekday, 6/100 and 34/300, yield 40/400=0.10. Return seven weekday slots and null rates for empty slots |
| D1 | Empty data, one record, fewer than 20 nonempty baseline days, no baseline/new zone, baseline rate 0 or 1, n=0 observed excluded-only date, and n=49 versus 50 at p_bar=0.1 have the specified empty/insufficient states |
| D2 | Missing/malformed/naive/reversed/future times, empty identifiers, all duplicate-ID copies, and multiple errors reconcile overall and selected counts. Include a duplicate across priorities and a known selected priority whose rows are all excluded |
| D3 | Current day remains provisional; October 15 23:55 to October 16 00:05 is 10 minutes assigned to October 15. Dispatch at cutoff is monitoring. Dates group in New York while duration uses UTC; cover a daylight-saving offset change. Future dispatches create no chart dates |
| Envelope | Overall missing required column and invalid setting yield 422; a missing field in one otherwise recognizable row yields 200 with an exclusion. Empty JSON records yield an empty analysis. Unknown priority with usable other-priority data yields 422 |
| Time and review | API default as_of is explicit in the core call; fixed historical values are reproducible; future API as_of is rejected. Unreviewed/provisional/insufficient combinations retain all reasons and have no formal signals |
| Whole flow | The small 3/2/1 example matches; import, add, export, settings changes, stale-result handling, baseline review, and real API display preserve the contract. Formal use has mock mode disabled |

All views show the timezone, `as_of`, target, global and selected coverage, and the limitation that
only usable recorded completed responses are analyzed. Keep baseline daily/weekday diagnostics
accessible, and distinguish operational lateness from statistical signals.
The minimum of 20 nonempty baseline days and expected counts of 5 are project policy/approximation
conditions, not proof of independent responses, a stable baseline, or comparable case mix.
The method reference is the [NIST proportions control chart](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc332.htm).

Use this v1.0 contract for implementation now. Coordinate later schema changes with Shifeng,
Julian, and Pingchuan and update the contract and fixtures together before merging them.
The team method walkthrough remains a separate H-01 acceptance step.

## 9. Backend handoff to Julian

H-04 is assigned to Julian Jiang, with Pingchuan exclusively responsible for `app/frontend/`.
Backend verification is complete for the commit identified below, now merged into main. The
frontend acceptance report is in section 10; H-04 still needs formal H-02 dataset parity and final check-in.

1. Pull the shared branch before starting. Preserve the existing `app/qc.py` and `app/frontend/`
   when copying the FastAPI starter; initialize only the missing backend files and four scripts.
2. Import `analyze_response` from `app.qc`. Pass all six settings explicitly after applying the
   two HTTP defaults. Return its response unchanged, including null values and reason codes.
3. Implement `GET /health` and `POST /analyze` with the success/error schemas in section 5.
   Sample the server clock once, reject future user `as_of` values, and keep row validation inside
   the core. Configure the frontend's API origin and cross-origin access for the chosen deployment.
4. Declare runtime/test dependencies in the H-04-owned dependency files. The core uses the Python
   standard library, but the runtime needs IANA timezone data (`tzdata` on Windows/minimal systems);
   verification requires `pytest`. The verified runtime was Python 3.12.14.
5. Keep `pytest tests/test_qc.py` passing. In `tests/test_api.py`, send
   [small_request.json](../tests/fixtures/qc/small_request.json) and compare with
   [small_expected.json](../tests/fixtures/qc/small_expected.json). Reuse
   [qc_cases.py](../tests/fixtures/qc/qc_cases.py) to generate K1 and K3 inputs; all are synthetic.
6. Check 422 errors, row exclusions, null limits, current-day and unreviewed states through HTTP.
   Coordinate the frontend migration below before claiming API/UI parity. Run `pytest tests`
   and the root-level `bash app/testme.sh` startup flow when the backend and frontend are integrated.

The H-03 implementation and review are ready for real integration. Do not substitute mock results
when real analysis fails. H-04 remains in progress until all of its ledger acceptance checks pass.

### Independent backend verification on 2026-10-16

Julian's implementation is on `Yulinjiang599/SYSEN5300_hackathon`, branch `codex/h04-backend`,
at [commit 1a89adf6ddf679ccdaa759497b6bda8aa51281dc](https://github.com/Yulinjiang599/SYSEN5300_hackathon/commit/1a89adf6ddf679ccdaa759497b6bda8aa51281dc).
It adds eight backend/script/test files. Shifeng reviewed and tested an isolated copy of that exact
commit, with the declared backend dependencies installed separately. Its core, core tests and
fixture generator are identical to the team's verified versions.

The response follows v1.0 without a translation layer: the API returns `analyze_response` output
unchanged. Strict request validation, defaults, the server clock check, row-level exclusions and
the `error.code/message/fields` envelope match this document. There is no mock fallback.

Actual independent verification output:

```text
pytest tests -o faulthandler_timeout=20
175 passed, 1 warning in 2.42s

PASS: real HTTP /health reports schema 1.0 and real analysis.
PASS: nine real HTTP responses match the core; no browser test performed.
PASS HTTP 422: invalid target uses the agreed error envelope.
```

The warning is a Starlette/AnyIO deprecated `BlockingPortal` alias, not a failed assertion. The
nine HTTP checks used a real temporary Uvicorn server and the exact section 11 request bodies;
every complete success response equaled its verified expected JSON, including K1/K3 boundaries,
insufficient/unreviewed/current-day states and empty input. The server was stopped after the checks.

The isolated review above did not repeat combined startup or browser rendering. Subsequently,
PR #1 merged the backend at `d97345a`, preserving the newer frontend, and Pingchuan supplied the
combined-startup/browser report in section 10. Main `5343c8a` contains the same backend, core and
Python test files as the independently verified fork. A fresh `pytest tests` on that merged
checkout printed `175 passed, 1 warning in 2.46s`. No deployment is claimed; H-04 remains
`in_progress` until its remaining acceptance checks pass.

For Windows Git Bash, a locally created virtual environment is activated with
`source .venv/Scripts/activate`; if `python3` is unavailable, use
`PYTHON_BIN=python bash app/testme.sh` after installing backend and frontend dependencies. These
are platform-specific setup notes for integration, not additional startup verification.

## 10. Frontend migration from the initial MOCK prototype

The frontend added in commit `5064507` deliberately used a draft response shape. Its six request
fields already matched v1.0, but at that commit it could not render a real core response. The table
records the adaptations assigned to Pingchuan; the progress note below covers the subsequent
`4e0548b` update. Julian should implement v1.0 rather than create a second compatibility schema.
Source review and fixture tests do not establish browser or HTTP acceptance.

| Initial MOCK/UI assumption | Required v1.0 adaptation |
|---|---|
| `quality.all_rows` and count keys `total`, `usable`, `excluded` | Use `quality.overall`; both scopes use `total_rows`, `usable_rows`, `excluded_rows`, and `usable_fraction`. Update the context bar and incident view; the old global access throws on real responses |
| `excluded_records[].row` | Use `row_number`, which is 1-based in the input array and excludes the CSV header |
| `zone_baselines[].baseline_days` | Use `nonempty_days` |
| Baseline `status === "ok"` enables the review checkbox | Allow `ready` and `unreviewed_baseline`; keep `insufficient_data` explanatory. Otherwise a valid unreviewed baseline cannot be confirmed |
| `daily_points` mixes baseline/monitoring and includes `period` | Real `daily_points` contains monitoring only. Baseline display rows come from each `zone_baselines[].daily`. Add display-only labels locally if needed; do not recalculate counts, rates or limits |
| Weekday label in `weekday`, day count in `days` | Use `label` and `nonempty_days`; `weekday` is the numeric Monday=0 through Sunday=6 index |
| `signals[].direction` | Use `signals[].status`, either `high` or `low` |
| `provisional`, `no_baseline`, `no_data` as point statuses | Use the six point statuses in section 4. Current-day status is `provisional_current_day`; missing baseline/observations are reason codes under `insufficient_data` |
| FastAPI-style `body.detail` errors | Read `body.error.code`, `message`, and `fields` from section 5; preserve readable 422 errors |
| MOCK disclosure only from build mode or `meta.mock` | Also show MOCK whenever `meta.is_mock === true`. Real core results have `false`; never fall back to mock after an API error |
| Optional `meta.message` / `meta.as_of_source` | These are not v1.0 fields. Use `quality.reasons` for empty-result explanations and `meta.as_of` for the resolved timestamp |

Update the mock fixtures to the same schema so mocked development and real integration exercise
the same rendering paths. Confirm the three-row example and K1/K3 through the actual API with
mock mode disabled before reporting H-04 complete.

### Verification of the frontend update in `4e0548b`

Shifeng's independent source review found all eleven adaptations above in the new implementation.
The frontend fixtures now come from the verified core, with `meta.is_mock` set to true for mock
presentation. Historical `as_of` can be entered explicitly; when blank it is omitted for the API
to resolve. Baseline confirmation reuses the returned observation cutoff.

The updated frontend was copied to a temporary verification folder with the required H-03 fixture.
Dependencies were installed there using pnpm after importing the committed npm lockfile; repository
frontend files and the lockfile were not changed. Actual command output on 2026-10-16 was:

```text
vitest run
Test Files  3 passed (3)
     Tests  15 passed (15)

vite build
44 modules transformed.
built in 5.19s
```

Those initial checks comprised six CSV helper tests, six time helper tests and three schema/fixture
tests, plus a production build. The subsequent CSV fix and browser report follow.

### CSV fix and browser acceptance report accompanying `5343c8a`

The extra-column retention gap is fixed in `5343c8a`: imported extra values are retained, passed
through to the API and exported after the required columns. Source review confirms the change.
Independent verification of the updated frontend in the isolated copy printed:

```text
Test Files  3 passed (3)
     Tests  17 passed (17)
vite build: 44 modules transformed; built in 4.33s
```

Pingchuan reported **70/70 checks PASS** in a real-browser campaign with mock disabled, started
using `bash app/testme.sh`. His stated test tree was main `7ca170e` plus Julian's `1a89adf` backend
and his updated frontend. The corresponding backend and CSV-retention changes are now on main.
This is a teammate report, also described in the CSV-fix commit message; Shifeng has not independently
replayed those 70 browser checks or received a full per-check browser trace.

- The eight nonempty export cases returned final `/analyze` responses deep-equal to their expected
  JSON. The page showed matching counts, rates, limits, statuses, signals, coverage, timezone,
  target and observation cutoff.
- K1 limits displayed 1.0% / 19.0%; K3 displayed 5.5% / 14.5%. Both upper-boundary cases displayed
  No signal with zero formal signals. Unreviewed, current-day and insufficient cases retained
  their distinct statuses with no signals.
- The small case displayed 2 usable and 1 excluded out of 3, including its exclusion reason.
- The ninth case, `empty`, was blocked by the UI because there were no rows or selectable priority.
  A direct HTTP POST returned 200 with the expected response. This follows the section 11 empty
  input exception; it is not a ninth browser-submitted request.
- Extra-column import/API/export retention was also reported checked in the browser.

The backend merge is complete, so it is no longer an open action. The remaining named dependency
is comparison of at least one **formal H-02 `data/` CSV** with the verified core, using the codebook's
exact settings. H-03 export cases do not replace that dataset. Before final H-04 check-in, retain
the merged commit and acceptance output and confirm the section 8 interaction checks (including
manual entry, settings changes/stale results and error handling); the short 70-check report does
not enumerate every one of those interactions. No new empty-submission UI feature is required.

## 11. Executable handoff cases and integration acceptance

Shifeng's H-03 handoff supplies **nine deterministic SYNTHETIC cases**, each as a complete request,
the verified core's expected response, and a CSV. These are integration fixtures; Jingyao still
owns the H-02 demonstration datasets and their codebook. Generate a fresh bundle from the repo root:

```bash
python tests/fixtures/qc/export_handoff.py
```

The command prints its output folder. The [fixture guide](../tests/fixtures/qc/README.md) explains
`--output` and the no-overwrite behavior. The bundle contains 28 files, including `manifest.json`.
The exporter checks core results only; its manifest explicitly records HTTP/UI verification as false.

| Case ID | Monitoring total / late | Expected point status | Limits | Formal signals |
|---|---|---|---|---|
| `k1_high` | 100 / 20 | `high` | 0.01, 0.19 | 1 |
| `k1_boundary` | 100 / 19 | `no_signal` | 0.01, 0.19 | 0 |
| `k3_high` | 400 / 59 | `high` | 0.055, 0.145 | 1 |
| `k3_boundary` | 400 / 58 | `no_signal` | 0.055, 0.145 | 0 |
| `insufficient` | 49 / 5 | `insufficient_data` | null, null | 0 |
| `unreviewed` | 100 / 20 | `unreviewed_baseline` | 0.01, 0.19 | 0 |
| `current_day` | 100 / 20 | `provisional_current_day` | 0.01, 0.19 | 0 |
| `small_3_2_1` | 1 / 1 | `insufficient_data` | null, null | 0 |
| `empty` | No point | No point | No point | 0 |

The first seven cases use a 20-day baseline of 200 late / 2,000 usable responses, zone A, priority P1,
target 10 minutes and cutoff `2026-09-21T00:00:00-04:00`. Their observation cutoff is
`2026-10-01T00:00:00-04:00`, except `current_day`, which uses `2026-09-21T12:00:00-04:00`.
Only `unreviewed` clears the review confirmation among these seven. Always use the exact settings
in each request or manifest, including those for the small and empty cases. The small case has
3 imported rows, 2 usable rows and 1 exclusion; only one usable row is in monitoring.

### Julian: compare actual HTTP responses when the backend is available

Start the real backend using its documented startup command. In Git Bash, with Python and curl
available, run the following. Enter the generated bundle folder using a path such as `C:/...`.
The second prompt accepts the complete analysis endpoint, including `/analyze`, without printing it.
Use a fresh export folder for each acceptance run so earlier `.actual.json` files cannot be mistaken
for results from this run. These commands are a handoff procedure, **not a record of completed HTTP tests**.

```bash
read -r -p "Fresh handoff folder: " QC_HANDOFF
export QC_HANDOFF
read -r -s -p "Complete analysis endpoint: " ANALYZE_URL
printf '\n'
for case in k1_high k1_boundary k3_high k3_boundary insufficient unreviewed current_day small_3_2_1 empty
do
  code=$(curl --silent --show-error \
    -H 'Content-Type: application/json' \
    --data-binary "@$QC_HANDOFF/$case.request.json" \
    --output "$QC_HANDOFF/$case.actual.json" \
    --write-out '%{http_code}' "$ANALYZE_URL")
  if [ "$?" -ne 0 ] || [ "$code" != "200" ]; then
    printf 'FAIL %s: expected HTTP 200, received %s\n' "$case" "$code"
    break
  fi
  printf 'HTTP 200: %s\n' "$case"
done
unset ANALYZE_URL
```

All nine valid envelopes should return HTTP 200, including empty/insufficient inputs. Resolve any
transport failure before running the comparison below. It requires every response and checks the
complete shape and values, with absolute numeric tolerance `1e-12` rather than JSON text equality:

```bash
python - <<'PY'
import json
import math
import os
from pathlib import Path

folder = Path(os.environ['QC_HANDOFF'])
manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))

def compare(expected, actual, path):
    if isinstance(expected, dict):
        assert isinstance(actual, dict) and expected.keys() == actual.keys(), path
        for key in expected:
            compare(expected[key], actual[key], f'{path}.{key}')
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(expected) == len(actual), path
        for index, (left, right) in enumerate(zip(expected, actual)):
            compare(left, right, f'{path}[{index}]')
    elif isinstance(expected, (int, float)) and not isinstance(expected, bool):
        assert isinstance(actual, (int, float)) and not isinstance(actual, bool), path
        assert math.isfinite(actual) and math.isclose(expected, actual, rel_tol=0, abs_tol=1e-12), path
    else:
        assert type(actual) is type(expected) and actual == expected, path

for case in manifest['cases']:
    name = case['name']
    expected = json.loads((folder / case['files']['expected']).read_text(encoding='utf-8'))
    actual = json.loads((folder / f'{name}.actual.json').read_text(encoding='utf-8'))
    compare(expected, actual, name)
    print(f'PASS: {name} response matches the verified core')
print(f"PASS: all {len(manifest['cases'])} responses match")
PY
```

This successful-response comparison supplements the 422/error and validation tests in section 8;
it does not replace them. Julian records real command output and the tested commit when available.

### Pingchuan: check the same cases in the real browser flow

1. Disable mock mode and import a case's `.records.csv`. Apply its exact priority, target, baseline
   cutoff and `as_of`. Importing data or changing settings may clear review confirmations; restore
   `reviewed_zones` last, and leave it empty for `unreviewed`.
2. If the UI has no fixed observation-cutoff control, provide an explicit test mechanism agreed
   with Julian. Do not replace a historical cutoff with today's clock and claim the current-day
   case matched: it would test a different state.
3. Compare the displayed counts, rates, limits, status, reasons, signals and coverage with the
   expected response. K1 limits display as 1% and 19%; K3 as 5.5% and 14.5%. The equality cases
   must not signal after display rounding. Inspect the network response to confirm unrounded values.
4. Check the small case's 3/2/1 accounting and exclusion explanation. The empty case must present
   no result, not an invented zero rate. Insufficient, unreviewed and provisional cases must remain
   explicit and produce no formal signals. Confirm timezone, target and observation cutoff are visible.
5. Record actual results below and attach evidence in the team's H-04 review. The nine fixtures
   support numerical integration checks; H-04 also requires the remaining section 8 checks and one
   H-02 dataset to agree with the core.

The header-only `empty` CSV is an exception to the ordinary import/settings sequence: it contains
no priority to select, and the browser may prevent submission of an empty record list. Verify the
empty request through HTTP separately and verify the browser's no-data state. If an empty POST
must be exercised through the UI, H-04 needs an explicit test entry point; do not assume it exists.

| Acceptance evidence | Current state | Evidence / remaining work |
|---|---|---|
| Nine exported core cases and CSV round trips | PASS; verified locally | 15,252 data rows; 28 exported files |
| Core definition of done | PASS; independently reviewed | `112 passed in 0.74s` |
| Nine actual HTTP responses | Independently PASS on `1a89adf`, now merged at `d97345a` | All complete responses match; merged checkout Python suite also passes; see section 9 |
| Browser campaign with mock disabled | Pingchuan reports 70/70 PASS | Eight nonempty UI cases; empty is UI-blocked plus HTTP-verified; extra-column round trip included; see section 10 |
| H-02 demonstration dataset parity | Pending dataset/integration | Dataset, exact settings, matching numbers |
| H-01 human method walkthrough | Pending | Participants, date, unresolved explanations |

## 12. Shifeng's English method walkthrough

This is rehearsal material for the team and a contribution to the eventual demonstration. It does
not certify that teammates have understood the method or that API/browser integration has passed.

### A 75-90 second explanation

> We are Chinese Can Fly. Our project is designed to help ambulance dispatch supervisors identify
> unusual changes in late completed responses, separately for each zone and priority category.
>
> We use synthetic dispatch and arrival records. A response is late only when its duration exceeds
> the user's operational target. Our ten-minute example is illustrative, not a clinical standard.
>
> We use a daily p chart because each response is either late or on time, and daily sample sizes can
> differ. The baseline is total late responses divided by total completed responses, not an average
> of daily percentages.
>
> With 200 late responses among 2,000 baseline responses, the baseline rate is ten percent. For a
> monitoring day with 100 responses, the limits are one and nineteen percent: twenty late responses
> signal high; nineteen do not. With 400 responses, the limits narrow to 5.5 and 14.5 percent.
>
> These signals require a reviewed baseline, sufficient data, and a completed day. Missing or invalid
> records remain visible as exclusions. The analysis supports investigation; it does not identify
> causes or make clinical decisions.

### Five likely questions

| Question | Answer to explain in your own words |
|---|---|
| Why a p chart? | Each usable response has a binary late/on-time outcome. We monitor daily proportions while accounting for different daily sample sizes, separately for comparable zone/priority groups. |
| Why weight the baseline? | Each response is an observation. A day with 6/100 late and a day with 34/300 late together give 40/400 = 10%. Averaging their percentages gives about 8.67% and gives the smaller day equal weight. The full test repeats these two patterns across 20 days. |
| How is the target different from the control limits? | The target is minutes per response; the limits are proportions of late responses relative to historical performance. A stable process may still have an unacceptable late proportion. |
| What assumptions matter? | Responses should be approximately independent and the baseline should be stable and comparable within each group. Daily/weekday diagnostics support human review. Our 20-day minimum and expected counts of at least five are project policy/approximation conditions, not proof of these assumptions. |
| What can the result not tell us? | It covers usable recorded completed responses, not every call or outstanding dispatch. Exclusions may bias the rate; the current day is provisional. A signal identifies a change to investigate, not its cause or a clinical decision. |

### Five-minute team walkthrough

| Time | Shifeng leads; teammates explain back |
|---|---|
| 0:00-1:00 | Each person gives the method in their own words: compare each closed day's late proportion with limits from that zone's reviewed historical baseline, within one priority. |
| 1:00-2:00 | Explain why exactly 10 minutes is on time but 10 minutes plus one second is late. Work through the weighted 6/100 + 34/300 example above. |
| 2:00-3:00 | Explain K1: 0.10 baseline, n=100, standard error 0.03, limits 0.01 and 0.19; 19 does not signal and 20 does. Then n=400 gives standard error 0.015 and limits 0.055 and 0.145; 58 does not signal and 59 does, when all eligibility conditions hold. |
| 3:00-4:00 | Explain why an unreviewed baseline, fewer than 20 baseline days, an absent/degenerate baseline, no usable day data, inadequate expected counts, or the current day prevents a formal verdict. At p_bar=0.10, n=49 fails the expected-late check; n=50 passes that check alone. |
| 4:00-5:00 | Explain coverage bias, independence/comparability assumptions, and why signals do not establish causation. Record actual participants and any unresolved explanation before changing the H-01 status. |

Until every teammate can explain the method without reading, H-01 remains `in_progress`.
The verified core and fixtures are already available for H-04 work while the walkthrough is pending.
