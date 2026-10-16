// Labels for the daily_points `status` values the API returns. Only high, low
// and no_signal are formal control verdicts; every other state must look
// different from "no signal", never like a green "normal".

export const STATUS = {
  high: { label: 'High late rate', icon: '▲', tone: 'critical', formal: true,
    help: 'Daily late rate above the upper control limit: a change from this zone’s baseline.' },
  low: { label: 'Low late rate', icon: '▼', tone: 'good', formal: true,
    help: 'Daily late rate below the lower control limit: fewer late arrivals than the baseline predicts.' },
  no_signal: { label: 'No signal', icon: '●', tone: 'neutral', formal: true,
    help: 'Within the control limits. This is not proof the process is in control, and the rate can still miss the target.' },
  provisional: { label: 'Provisional (today)', icon: '◐', tone: 'pending', formal: false,
    help: 'The day has not ended at the analysis time; observed rate only, no verdict.' },
  unreviewed_baseline: { label: 'Baseline not reviewed', icon: '?', tone: 'pending', formal: false,
    help: 'Confirm this zone’s baseline on the Zone Monitoring page before a verdict is given.' },
  insufficient_data: { label: 'Insufficient data', icon: '–', tone: 'muted', formal: false,
    help: 'Too few responses that day (needs n·p̄ ≥ 5 and n·(1−p̄) ≥ 5); no limits, no verdict.' },
  no_baseline: { label: 'No usable baseline', icon: '∅', tone: 'muted', formal: false,
    help: 'This zone has no valid baseline (fewer than 20 baseline days, or a baseline rate of 0 or 1).' },
  no_data: { label: 'No responses', icon: '∅', tone: 'muted', formal: false,
    help: 'No usable completed responses that day.' },
  baseline: { label: 'Baseline day', icon: '○', tone: 'muted', formal: false,
    help: 'Part of the frozen baseline period; used to estimate p̄, not judged.' },
}

export const statusInfo = (s) =>
  STATUS[s] || { label: s || 'Unknown', icon: '?', tone: 'muted', formal: false, help: 'Status not recognised by this page.' }

/** Show a 0–1 proportion from the API as a percentage; null stays a dash. */
export const pct = (p, digits = 1) => (p == null ? '—' : `${(p * 100).toFixed(digits)}%`)
