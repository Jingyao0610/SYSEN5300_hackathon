import { useMemo, useState } from 'react'
import PChart from '../components/PChart.jsx'
import { BASELINE_STATUS, pct, reasonText, reasonsText, statusInfo } from '../status.js'

// Baseline rows come from zone_baselines[].daily and monitoring rows from
// daily_points (interfaces v1.0). `period` and the 'baseline' status are
// display-only labels added here; no counts, rates or limits are computed.
function chartRows(base, monitoring) {
  const baseRows = (base?.daily ?? []).map((d) => ({
    ...d, period: 'baseline', status: 'baseline', lower: null, upper: null, reasons: [],
  }))
  return [...baseRows, ...monitoring.map((p) => ({ ...p, period: 'monitoring' }))]
}

export default function ZoneMonitoring({ res, busy, onToggleReviewed, onViewIncidents, onBack }) {
  const zones = useMemo(() => (res ? res.zone_baselines.map((b) => b.zone) : []), [res])
  const [picked, setPicked] = useState('')
  const zone = zones.includes(picked) ? picked : zones[0] ?? ''

  if (!res) {
    return (
      <section className="panel">
        <p>No current analysis. Run it on the Data &amp; Settings page.</p>
        <button onClick={onBack}>← Back to data</button>
      </section>
    )
  }
  if (zones.length === 0) {
    return (
      <section className="panel">
        <p className="notice">
          {res.quality.reasons.map(reasonText).join(' ') || 'No zones to show.'} Nothing is charted, and no rate is shown as zero.
        </p>
        <button onClick={onBack}>← Back to data</button>
      </section>
    )
  }

  const base = res.zone_baselines.find((b) => b.zone === zone)
  const monitoring = res.daily_points.filter((p) => p.zone === zone)
  const rows = chartRows(base, monitoring)
  const canReview = base.status === 'ready' || base.status === 'unreviewed_baseline'
  const pending = res.daily_points.filter((p) => !statusInfo(p.status).formal)

  return (
    <>
      <section className="panel">
        <div className="row">
          <label className="inline">
            Zone{' '}
            <select value={zone} onChange={(e) => setPicked(e.target.value)}>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <button onClick={onBack}>← Back to data</button>
          <button onClick={() => onViewIncidents(zone, '')}>View late incidents in zone {zone} →</button>
        </div>

        <h2>Zone {zone}: daily share of late arrivals</h2>
        <p className="muted">
          Each point is one New York calendar day: late responses ÷ completed responses. The line across is the
          baseline late rate p̄; the short bars are that day&rsquo;s control limits, which are wider on days with fewer
          responses. Only a point strictly outside its limits is a signal, and only once the baseline is reviewed and
          the day is over. A day with no signal can still miss the operational target.
        </p>
        <PChart points={rows} pBar={base.p_bar} zone={zone} />
      </section>

      <section className="panel">
        <h2>Baseline for zone {zone}</h2>
        <dl className="stats">
          <div><dt>Baseline late rate p̄</dt><dd>{pct(base.p_bar, 2)}</dd></div>
          <div><dt>Late / completed</dt><dd>{`${base.late} / ${base.n}`}</dd></div>
          <div><dt>Days with responses</dt><dd>{base.nonempty_days}</dd></div>
          <div><dt>Baseline status</dt><dd>{BASELINE_STATUS[base.status] ?? base.status}</dd></div>
        </dl>
        {base.reasons.length > 0 && <p className="notice">{reasonsText(base.reasons)}</p>}

        <h3>Check before confirming</h3>
        <p className="muted">
          Look for shifts or weekly patterns in the baseline days on the chart and in the weekday table. Confirming
          records that you reviewed the baseline; it does not prove the days are independent or comparable.
        </p>
        <div className="scroll">
          <table>
            <thead><tr><th>Weekday</th><th>Days</th><th>Late / completed</th><th>Late rate</th></tr></thead>
            <tbody>
              {base.weekday.map((w) => (
                <tr key={w.weekday}>
                  <td>{w.label}</td><td>{w.nonempty_days}</td><td>{`${w.late} / ${w.n}`}</td><td>{pct(w.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="check">
          <input type="checkbox" checked={base.reviewed} disabled={busy || !canReview} onChange={() => onToggleReviewed(zone)} />
          Baseline reviewed for zone {zone}
          {!canReview && <span className="muted"> (baseline not usable, nothing to confirm)</span>}
        </label>
        {!base.reviewed && canReview && (
          <p className="muted">Until confirmed, monitoring days in this zone show &ldquo;Baseline not reviewed&rdquo; instead of a verdict.</p>
        )}
      </section>

      <section className="panel">
        <h2>Days to review (all zones)</h2>
        {res.signals.length === 0 ? (
          <p>No formal signals. Check the status of each day below: days without a verdict are not &ldquo;normal&rdquo;.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead><tr><th>Zone</th><th>Date</th><th>Signal</th><th>Late / completed</th><th>Rate</th><th>Limits</th><th></th></tr></thead>
              <tbody>
                {res.signals.map((s) => (
                  <tr key={`${s.zone}${s.date}`}>
                    <td>{s.zone}</td><td>{s.date}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>{`${s.late} / ${s.n}`}</td><td>{pct(s.rate)}</td><td>{`${pct(s.lower)} – ${pct(s.upper)}`}</td>
                    <td><button className="link" onClick={() => onViewIncidents(s.zone, s.date)}>View incidents</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pending.length > 0 && (
          <p className="muted">
            {pending.length} monitoring day(s) have no verdict (provisional, baseline not reviewed, or insufficient data).
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Daily table, zone {zone}</h2>
        <div className="scroll">
          <table>
            <thead>
              <tr><th>Date</th><th>Period</th><th>n</th><th>Late</th><th>Rate</th><th>Lower</th><th>Upper</th><th>Status</th><th>Why</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.date} className={p.period}>
                  <td>{p.date}</td><td>{p.period}</td><td>{p.n}</td><td>{p.late}</td>
                  <td>{pct(p.rate)}</td><td>{pct(p.lower)}</td><td>{pct(p.upper)}</td>
                  <td>
                    <StatusBadge status={p.status} />
                    {p.status !== 'provisional_current_day' && p.reasons.includes('current_day_provisional') && (
                      <> <StatusBadge status="provisional_current_day" /></>
                    )}
                  </td>
                  <td className="muted">{reasonsText(p.reasons)}</td>
                  <td>{p.late > 0 && <button className="link" onClick={() => onViewIncidents(zone, p.date)}>Incidents</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {monitoring.length === 0 && <p className="muted">No monitoring days after the baseline end for this zone.</p>}
      </section>
    </>
  )
}

export function StatusBadge({ status }) {
  const info = statusInfo(status)
  return (
    <span className={`badge ${info.tone}`} title={info.help}>
      <span aria-hidden="true">{info.icon}</span> {info.label}
    </span>
  )
}
