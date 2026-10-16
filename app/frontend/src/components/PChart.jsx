import { useState } from 'react'
import { pct, statusInfo } from '../status.js'

// Daily late-rate p chart for ONE zone. Plots only what the API returned:
// rate, lower, upper per day and the zone's p_bar. No statistics here.

const W = 720
const H = 300
const PAD = { l: 44, r: 16, t: 16, b: 34 }

export default function PChart({ points, pBar, zone }) {
  const [hover, setHover] = useState(null)
  if (points.length === 0) return <p className="muted">No days to plot for zone {zone}.</p>

  const top = Math.max(0.05, pBar ?? 0, ...points.map((p) => Math.max(p.rate ?? 0, p.upper ?? 0)))
  const yMax = Math.ceil((top * 1.1) / 0.05) * 0.05
  const step = yMax <= 0.2 ? 0.05 : yMax <= 0.5 ? 0.1 : 0.25
  const ticks = []
  for (let t = 0; t <= yMax + 1e-9; t += step) ticks.push(t)

  const plotW = W - PAD.l - PAD.r
  const slot = plotW / points.length
  const x = (i) => PAD.l + slot * (i + 0.5)
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / yMax)
  const firstMon = points.findIndex((p) => p.period === 'monitoring')

  const line = (from, to) =>
    points
      .slice(from, to)
      .map((p, j) => (p.rate == null ? null : `${x(from + j)},${y(p.rate)}`))
      .filter(Boolean)
      .join(' ')

  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Daily late rate for zone ${zone}, ${points.length} days. Details are in the table below.`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{`${Math.round(t * 100)}%`}</text>
          </g>
        ))}

        {firstMon > 0 && (
          <g className="divider">
            <line x1={x(firstMon) - slot / 2} x2={x(firstMon) - slot / 2} y1={PAD.t} y2={H - PAD.b} />
            <text x={x(firstMon) - slot / 2 - 4} y={PAD.t + 10} textAnchor="end">baseline</text>
            <text x={x(firstMon) - slot / 2 + 4} y={PAD.t + 10}>monitoring</text>
          </g>
        )}

        {pBar != null && (
          <g className="center">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(pBar)} y2={y(pBar)} />
          </g>
        )}

        {points.map((p, i) =>
          p.upper == null ? null : (
            <g key={`lim${i}`} className="limit">
              <line x1={x(i) - slot / 2} x2={x(i) + slot / 2} y1={y(p.upper)} y2={y(p.upper)} />
              <line x1={x(i) - slot / 2} x2={x(i) + slot / 2} y1={y(p.lower)} y2={y(p.lower)} />
            </g>
          )
        )}

        <polyline className="series base" points={line(0, firstMon < 0 ? points.length : firstMon)} />
        {firstMon >= 0 && <polyline className="series" points={line(firstMon, points.length)} />}

        {points.map((p, i) => {
          if (p.rate == null) return null
          const info = statusInfo(p.status)
          return (
            <g key={`pt${i}`}>
              <Marker cx={x(i)} cy={y(p.rate)} status={p.status} />
              <circle
                cx={x(i)} cy={y(p.rate)} r={Math.max(10, slot / 2)} className="hit"
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
              >
                <title>{`${p.date}: ${pct(p.rate)} (${p.late}/${p.n}) - ${info.label}`}</title>
              </circle>
            </g>
          )
        })}

        <text className="axis" x={x(0)} y={H - 10} textAnchor="start">{points[0].date}</text>
        <text className="axis" x={x(points.length - 1)} y={H - 10} textAnchor="end">{points[points.length - 1].date}</text>
      </svg>

      {hover != null && <Tooltip p={points[hover]} pBar={pBar} left={(x(hover) / W) * 100} />}

      <figcaption className="key">
        <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" className="keyline center" /></svg>p̄ (baseline late rate)</span>
        <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" className="keyline limit" /></svg>control limits for that day&rsquo;s n</span>
        {['high', 'low', 'no_signal', 'provisional', 'unreviewed_baseline', 'insufficient_data', 'baseline'].map((s) => (
          <span key={s}><svg width="14" height="14"><Marker cx={7} cy={7} status={s} small /></svg>{statusInfo(s).label}</span>
        ))}
      </figcaption>
    </figure>
  )
}

function Marker({ cx, cy, status, small }) {
  const info = statusInfo(status)
  const r = 5
  if (status === 'high' || status === 'low') {
    const d = status === 'high' ? -1 : 1
    const s = small ? 6 : 8
    return <path className={`mk ${info.tone}`} d={`M${cx - s},${cy - d * s * 0.6} L${cx + s},${cy - d * s * 0.6} L${cx},${cy + d * s * 0.9} Z`} />
  }
  if (info.formal) return <circle className={`mk ${info.tone}`} cx={cx} cy={cy} r={r} />
  return <circle className={`mk hollow ${info.tone}`} cx={cx} cy={cy} r={r - 1} />
}

function Tooltip({ p, pBar, left }) {
  const info = statusInfo(p.status)
  return (
    <div className="tip" style={{ left: `${Math.min(Math.max(left, 15), 85)}%` }} role="status">
      <strong>{p.date}</strong> · {p.period}
      <div>{`Late rate ${pct(p.rate)} = ${p.late} late / ${p.n} responses`}</div>
      <div>{`Limits ${pct(p.lower)} – ${pct(p.upper)} · p̄ ${pct(pBar)}`}</div>
      <div>{`${info.icon} ${info.label}`}</div>
      {p.reasons?.length > 0 && <div className="muted">{p.reasons.join('; ')}</div>}
    </div>
  )
}
