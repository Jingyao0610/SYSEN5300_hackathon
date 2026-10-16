// Display labels for the v1.0 status enums and reason codes
// (docs/interfaces.md section 4). Only high, low and no_signal are formal
// control verdicts; the others must never look like a green "normal".

export const STATUS = {
  high: { label: 'High late rate', icon: '▲', tone: 'critical', formal: true,
    help: 'Daily late rate above the upper control limit: a change from this zone’s baseline.' },
  low: { label: 'Low late rate', icon: '▼', tone: 'good', formal: true,
    help: 'Daily late rate below the lower control limit: fewer late arrivals than the baseline predicts.' },
  no_signal: { label: 'No signal', icon: '●', tone: 'neutral', formal: true,
    help: 'No crossing of the control limits. Not proof the process is in control; the rate can still miss the target.' },
  provisional_current_day: { label: 'Provisional (today)', icon: '◐', tone: 'pending', formal: false,
    help: 'The day has not ended at the analysis time; observed rate only, no verdict.' },
  unreviewed_baseline: { label: 'Baseline not reviewed', icon: '?', tone: 'pending', formal: false,
    help: 'Confirm this zone’s baseline on the Zone Monitoring page before a verdict is given.' },
  insufficient_data: { label: 'Insufficient data', icon: '–', tone: 'muted', formal: false,
    help: 'A data requirement is not met (see reasons); no verdict.' },
  // display-only label for baseline days drawn from zone_baselines[].daily
  baseline: { label: 'Baseline day', icon: '○', tone: 'muted', formal: false,
    help: 'Part of the frozen baseline period; used to estimate p̄, not judged.' },
}

export const statusInfo = (s) =>
  STATUS[s] || { label: s || 'Unknown', icon: '?', tone: 'muted', formal: false, help: 'Status not recognised by this page.' }

export const BASELINE_STATUS = {
  ready: 'Reviewed and usable',
  unreviewed_baseline: 'Usable, not yet reviewed',
  insufficient_data: 'Not usable for verdicts',
}

export const REASONS = {
  // daily point and baseline reasons
  no_usable_observations: 'no usable responses that day',
  no_baseline: 'no baseline responses for this zone',
  baseline_fewer_than_20_days: 'baseline has fewer than 20 days with responses',
  baseline_rate_degenerate: 'baseline late rate is 0% or 100%, so no limits',
  expected_late_below_5: 'expected late count n·p̄ is below 5',
  expected_on_time_below_5: 'expected on-time count n·(1−p̄) is below 5',
  baseline_unreviewed: 'baseline not yet reviewed',
  current_day_provisional: 'day not over at the analysis time',
  // row exclusion reasons
  missing_incident_id: 'incident_id is missing',
  invalid_incident_id: 'incident_id is not valid text',
  missing_zone: 'zone is missing',
  invalid_zone: 'zone is not valid text',
  missing_priority: 'priority is missing',
  invalid_priority: 'priority is not valid text',
  missing_dispatched_at: 'dispatched_at is missing',
  invalid_dispatched_at: 'dispatched_at is not a valid timestamp',
  naive_dispatched_at: 'dispatched_at has no UTC offset',
  missing_on_scene_at: 'on_scene_at is missing',
  invalid_on_scene_at: 'on_scene_at is not a valid timestamp',
  naive_on_scene_at: 'on_scene_at has no UTC offset',
  reversed_timestamps: 'arrival is before dispatch',
  future_dispatched_at: 'dispatch is after the analysis time',
  future_on_scene_at: 'arrival is after the analysis time',
  duplicate_incident_id: 'incident_id appears more than once (all copies excluded)',
  // quality.reasons for an empty result
  empty_input: 'No rows were imported.',
  no_usable_imported_records: 'None of the imported rows is usable.',
  no_usable_selected_records: 'No usable rows for the selected priority.',
}

export const reasonText = (code) => REASONS[code] || code
export const reasonsText = (codes) => (codes || []).map(reasonText).join('; ')

/** Show a 0–1 proportion from the API as a percentage; null stays a dash. */
export const pct = (p, digits = 1) => (p == null ? '—' : `${(p * 100).toFixed(digits)}%`)
