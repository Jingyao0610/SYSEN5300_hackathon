// MOCK fixtures for building the pages before app/qc.py and POST /analyze are
// verified. NOT real analysis: every response carries meta.mock = true and the
// page shows a red MOCK banner. The request's records are ignored.
//
// The numbers are typed in from SPEC.md section 4 / docs/plan.md K1-K3 so the
// pages show values the real API must reproduce:
//   zone A: baseline 20 days x 100 responses, 200 late -> p_bar 0.10;
//           n = 100 -> limits [0.01, 0.19]; 19 late = no signal, 20 = high, 0 = low
//   zone B: K2 baseline (10 x 6/100 + 10 x 34/300) -> p_bar 0.10;
//           n = 400 -> limits [0.055, 0.145]; 21 low, 22 and 58 no signal, 59 high
//   zone C: only 12 baseline days -> no usable baseline
// The response shape is a DRAFT until docs/interfaces.md is agreed.

const LIMITS = { 100: [0.01, 0.19], 400: [0.055, 0.145] } // from K1 / K3, not computed here
const P_BAR = 0.1

const day = (d) => `2026-09-${String(d).padStart(2, '0')}`
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const weekdayOf = (date) => WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()]

function baselinePoints(zone, rows) {
  return rows.map(([d, n, late]) => ({
    zone, date: day(d), period: 'baseline', n, late, rate: late / n,
    lower: null, upper: null, status: 'baseline', reasons: [],
  }))
}

// [day, n, late, status, reasons?]
function monitoringPoints(zone, rows, hasBaseline) {
  return rows.map(([d, n, late, status, reasons = []]) => {
    const lim = hasBaseline && status !== 'insufficient_data' ? LIMITS[n] : null
    return {
      zone, date: day(d), period: 'monitoring', n, late, rate: n ? late / n : null,
      lower: lim ? lim[0] : null, upper: lim ? lim[1] : null, status, reasons,
    }
  })
}

function weekdayTable(points) {
  const by = {}
  for (const p of points) {
    const w = weekdayOf(p.date)
    by[w] = by[w] || { weekday: w, days: 0, n: 0, late: 0 }
    by[w].days += 1; by[w].n += p.n; by[w].late += p.late
  }
  return WEEKDAY.filter((w) => by[w]).map((w) => ({ ...by[w], rate: by[w].late / by[w].n }))
}

function signalsScenario() {
  const aBase = baselinePoints('A', Array.from({ length: 20 }, (_, i) => [i + 1, 100, i % 2 ? 12 : 8]))
  const aMon = monitoringPoints('A', [
    [21, 100, 9, 'no_signal'], [22, 100, 12, 'no_signal'],
    [23, 100, 19, 'no_signal', ['0.19 equals the upper limit; only strict crossings signal']],
    [24, 100, 20, 'high'], [25, 100, 25, 'high'], [26, 100, 0, 'low'],
    [27, 100, 14, 'no_signal'], [28, 100, 11, 'no_signal'],
    [29, 40, 4, 'insufficient_data', ['n*p_bar = 4.0 < 5']],
    [30, 100, 20, 'provisional', ['day not ended at as_of']],
  ], true)
  const bBase = baselinePoints('B', Array.from({ length: 20 }, (_, i) => (i < 10 ? [i + 1, 100, 6] : [i + 1, 300, 34])))
  const bMon = monitoringPoints('B', [
    [21, 400, 40, 'no_signal'], [22, 400, 58, 'no_signal'], [23, 400, 59, 'high'],
    [24, 400, 21, 'low'], [25, 400, 22, 'no_signal'], [26, 400, 45, 'no_signal'],
    [27, 400, 38, 'no_signal'], [28, 400, 41, 'no_signal'], [29, 400, 44, 'no_signal'],
    [30, 400, 50, 'provisional', ['day not ended at as_of']],
  ], true)
  const cBase = baselinePoints('C', Array.from({ length: 12 }, (_, i) => [i + 9, 20, 3]))
  const cMon = monitoringPoints('C', [21, 22, 23, 24, 25].map((d) => [d, 20, 4, 'no_baseline', ['12 baseline days; 20 required']]), false)

  const baseline = (zone, pts, status, reasons) => ({
    zone,
    baseline_days: pts.length,
    n: pts.reduce((s, p) => s + p.n, 0),
    late: pts.reduce((s, p) => s + p.late, 0),
    p_bar: status === 'ok' ? P_BAR : null,
    reviewed: false,
    status,
    reasons,
    weekday: weekdayTable(pts),
  })

  const incidents = []
  for (const [d, k] of [[24, 6], [25, 8], [23, 4]]) {
    for (let i = 0; i < k; i++) {
      const mins = 10 + ((i * 7 + d) % 17) + 0.5
      const hh = String(8 + i).padStart(2, '0')
      const arrive = new Date(Date.parse(`${day(d)}T${hh}:00:00-04:00`) + mins * 60e3)
      incidents.push({
        incident_id: `A-P1-${d}${String(i + 1).padStart(2, '0')}`, zone: 'A', priority: 'P1', date: day(d),
        dispatched_at: `${day(d)}T${hh}:00:00-04:00`,
        on_scene_at: arrive.toISOString().replace('.000Z', 'Z'),
        response_minutes: mins,
      })
    }
  }
  incidents.push({
    incident_id: 'B-P1-2301', zone: 'B', priority: 'P1', date: day(23),
    dispatched_at: `${day(23)}T09:10:00-04:00`, on_scene_at: `${day(23)}T09:20:01-04:00`, response_minutes: 10 + 1 / 60,
  })

  return {
    as_of: '2026-09-30T18:00:00-04:00',
    quality: {
      all_rows: { total: 18126, usable: 18120, excluded: 6 },
      selected_priority: { total: 9063, usable: 9060, excluded: 3 },
    },
    excluded_records: [
      { row: 17, incident_id: 'A-P1-0917', reasons: ['on_scene_at is before dispatched_at'] },
      { row: 230, incident_id: 'B-P1-0230', reasons: ['duplicate incident_id'] },
      { row: 231, incident_id: 'B-P1-0230', reasons: ['duplicate incident_id'] },
    ],
    zone_baselines: [
      baseline('A', aBase, 'ok', []),
      baseline('B', bBase, 'ok', []),
      baseline('C', cBase, 'insufficient_days', ['12 nonempty baseline days; at least 20 required']),
    ],
    daily_points: [...aBase, ...aMon, ...bBase, ...bMon, ...cBase, ...cMon],
    late_incidents: incidents,
  }
}

function rowErrorsScenario() {
  return {
    as_of: '2026-10-01T00:00:00-04:00',
    quality: {
      all_rows: { total: 3, usable: 2, excluded: 1 },
      selected_priority: { total: 3, usable: 2, excluded: 1 },
    },
    excluded_records: [{ row: 3, incident_id: 'X-3', reasons: ['dispatched_at has no UTC offset'] }],
    zone_baselines: [{
      zone: 'A', baseline_days: 1, n: 2, late: 1, p_bar: null, reviewed: false,
      status: 'insufficient_days', reasons: ['1 nonempty baseline day; at least 20 required'], weekday: [],
    }],
    daily_points: [{
      zone: 'A', date: day(1), period: 'baseline', n: 2, late: 1, rate: 0.5,
      lower: null, upper: null, status: 'baseline', reasons: [],
    }],
    late_incidents: [{
      incident_id: 'X-1', zone: 'A', priority: 'P1', date: day(1),
      dispatched_at: `${day(1)}T09:00:00-04:00`, on_scene_at: `${day(1)}T09:10:01-04:00`, response_minutes: 10 + 1 / 60,
    }],
  }
}

function emptyScenario() {
  return {
    as_of: '2026-10-01T00:00:00-04:00',
    quality: {
      all_rows: { total: 2, usable: 0, excluded: 2 },
      selected_priority: { total: 2, usable: 0, excluded: 2 },
    },
    excluded_records: [
      { row: 1, incident_id: 'E-1', reasons: ['on_scene_at is missing'] },
      { row: 2, incident_id: 'E-2', reasons: ['dispatched_at is not a valid timestamp'] },
    ],
    zone_baselines: [],
    daily_points: [],
    late_incidents: [],
    message: 'No usable completed responses for this priority, so there is no result.',
  }
}

export const MOCK_SCENARIOS = {
  signals: 'Signals: high, low, no signal, insufficient, no baseline, provisional',
  row_errors: '3 rows: 2 usable, 1 excluded',
  empty: 'No usable records',
}

/**
 * Pretend POST /analyze. Mirrors the request's settings into meta and labels
 * monitoring days of zones not in reviewed_zones as unreviewed_baseline, the
 * way the real API is expected to.
 */
export function mockAnalyze(req, scenario = 'signals') {
  const s = { signals: signalsScenario, row_errors: rowErrorsScenario, empty: emptyScenario }[scenario]?.()
    ?? signalsScenario()
  const reviewed = new Set(req.reviewed_zones || [])
  const daily_points = s.daily_points.map((p) =>
    p.period === 'monitoring' && !reviewed.has(p.zone) && ['high', 'low', 'no_signal'].includes(p.status)
      ? { ...p, status: 'unreviewed_baseline', reasons: ['baseline not yet reviewed'] }
      : p
  )
  return {
    meta: {
      mock: true,
      scenario,
      as_of: req.as_of || s.as_of,
      as_of_source: req.as_of ? 'request' : 'server',
      timezone: 'America/New_York',
      target_minutes: req.target_minutes,
      selected_priority: req.selected_priority,
      baseline_end: req.baseline_end,
      reviewed_zones: [...reviewed],
      message: s.message ?? null,
    },
    quality: s.quality,
    excluded_records: s.excluded_records,
    zone_baselines: s.zone_baselines.map((b) => ({ ...b, reviewed: reviewed.has(b.zone) })),
    daily_points,
    signals: daily_points
      .filter((p) => p.status === 'high' || p.status === 'low')
      .map(({ zone, date, n, late, rate, lower, upper, status }) => ({ zone, date, direction: status, n, late, rate, lower, upper })),
    late_incidents: s.late_incidents,
  }
}
