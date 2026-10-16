import { useMemo, useState } from 'react'
import PChart from '../components/PChart.jsx'
import { pct, statusInfo } from '../status.js'

export default function ZoneMonitoring({ result, busy, onToggleReviewed, onViewIncidents, onBack }) {
  const zones = useMemo(() => {
    if (!result) return []
    return [...new Set([...result.zone_baselines.map((b) => b.zone), ...result.daily_points.map((p) => p.zone)])].sort()
  }, [result])
  const [picked, setPicked] = useState('')
  const zone = zones.includes(picked) ? picked : zones[0] ?? ''

  if (!result) {
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
        <p className="notice">{result.meta.message || 'No usable records, so there is nothing to chart.'}</p>
        <button onClick={onBack}>← Back to data</button>
      </section>
    )
  }

  const base = result.zone_baselines.find((b) => b.zone === zone)
  const points = result.daily_points.filter((p) => p.zone === zone).sort((a, b) => a.date.localeCompare(b.date))
  const monitoring = points.filter((p) => p.period === 'monitoring')
  const pending = result.daily_points.filter((p) => p.period === 'monitoring' && !statusInfo(p.status).formal)

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
          responses. Only a point strictly outside its limits is a signal. A day with no signal can still miss
          the operational target.
        </p>
        <PChart points={points} pBar={base?.p_bar ?? null} zone={zone} />
      </section>

      <section className="panel">
        <h2>Baseline for zone {zone}</h2>
        {base ? (
          <>
            <dl className="stats">
              <div><dt>Baseline late rate p̄</dt><dd>{pct(base.p_bar, 2)}</dd></div>
              <div><dt>Late / completed</dt><dd>{`${base.late} / ${base.n}`}</dd></div>
              <div><dt>Baseline days</dt><dd>{base.baseline_days}</dd></div>
              <div><dt>Baseline status</dt><dd>{base.status === 'ok' ? 'usable' : 'not usable'}</dd></div>
            </dl>
            {base.reasons?.length > 0 && <p className="notice">{base.reasons.join('; ')}</p>}

            <h3>Check before confirming</h3>
            <p className="muted">
              Look for shifts or weekly patterns in the baseline days on the chart and in the weekday table. Confirming
              records that you reviewed the baseline; it does not prove the days are independent or comparable.
            </p>
            {base.weekday?.length > 0 && (
              <div className="scroll">
                <table>
                  <thead><tr><th>Weekday</th><th>Days</th><th>Late / completed</th><th>Late rate</th></tr></thead>
                  <tbody>
                    {base.weekday.map((w) => (
                      <tr key={w.weekday}><td>{w.weekday}</td><td>{w.days}</td><td>{`${w.late} / ${w.n}`}</td><td>{pct(w.rate)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={base.reviewed}
                disabled={busy || base.status !== 'ok'}
                onChange={() => onToggleReviewed(zone)}
              />
              Baseline reviewed for zone {zone}
              {base.status !== 'ok' && <span className="muted"> (no usable baseline to confirm)</span>}
            </label>
            {!base.reviewed && base.status === 'ok' && (
              <p className="muted">Until confirmed, monitoring days in this zone show &ldquo;Baseline not reviewed&rdquo; instead of a verdict.</p>
            )}
          </>
        ) : (
          <p className="notice">Zone {zone} has no baseline records, so it gets no verdicts.</p>
        )}
      </section>

      <section className="panel">
        <h2>Days to review (all zones)</h2>
        {result.signals.length === 0 ? (
          <p>No days outside their control limits. This does not prove the process is in control.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead><tr><th>Zone</th><th>Date</th><th>Signal</th><th>Late / completed</th><th>Rate</th><th>Limits</th><th></th></tr></thead>
              <tbody>
                {result.signals.map((s) => (
                  <tr key={`${s.zone}${s.date}`}>
                    <td>{s.zone}</td><td>{s.date}</td>
                    <td><StatusBadge status={s.direction} /></td>
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
            {pending.length} monitoring day(s) have no verdict yet (provisional, baseline not reviewed, insufficient data
            or no baseline). See the daily table for each zone.
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
              {points.map((p) => (
                <tr key={p.date} className={p.period}>
                  <td>{p.date}</td><td>{p.period}</td><td>{p.n}</td><td>{p.late}</td>
                  <td>{pct(p.rate)}</td><td>{pct(p.lower)}</td><td>{pct(p.upper)}</td>
                  <td><StatusBadge status={p.status} /></td>
                  <td className="muted">{p.reasons?.join('; ')}</td>
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
