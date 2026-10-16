import { useState } from 'react'
import { pct, reasonsText, statusInfo } from '../status.js'

// Daily late-rate p chart for ONE zone. Plots only what the API returned:
// rate, lower, upper per day and the zone's p_bar. No statistics here.

const W = 820
const H = 330
const PAD = { l: 46, r: 18, t: 30, b: 34 }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const shortDate = (d) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`

export default function PChart({ points, pBar, zone, onPick, selected }) {
  const [hover, setHover] = useState(null)
  if (points.length === 0) return <p className="muted">No days to plot for zone {zone}.</p>

  const vals = points.flatMap((p) => [p.rate, p.upper, p.lower]).filter((v) => v != null)
  const hi = Math.max(0.05, pBar ?? 0, ...vals)
  const lo = Math.min(pBar ?? 1, ...vals)
  const step = hi - lo > 0.3 ? 0.1 : 0.05
  const yMax = Math.min(1, Math.ceil((hi + 0.02) / step) * step)
  const yMin = Math.max(0, Math.floor((lo - 0.02) / step) * step)
  const ticks = []
  for (let t = yMin; t <= yMax + 1e-9; t += step) ticks.push(t)

  const plotW = W - PAD.l - PAD.r
  const slot = plotW / points.length
  const x = (i) => PAD.l + slot * (i + 0.5)
  const y = (v) => PAD.t + (H - PAD.t - PAD.b) * (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin))
  const firstMon = points.findIndex((p) => p.period === 'monitoring')
  const split = firstMon > 0 ? x(firstMon) - slot / 2 : null

  const line = (from, to) =>
    points.slice(from, to).map((p, j) => (p.rate == null ? null : `${x(from + j)},${y(p.rate)}`)).filter(Boolean).join(' ')

  const every = Math.max(1, Math.ceil(points.length / 9))
  const last = points.length - 1
  const labelled = points.map((p, i) => i).filter((i) => i === last || (i % every === 0 && last - i >= every))

  // label the most extreme formal signal, like an annotation on a printed chart
  let peak = -1
  points.forEach((p, i) => { if (p.status === 'high' && (peak < 0 || p.rate > points[peak].rate)) peak = i })
  const sel = points.findIndex((p) => p.date === selected && p.period === 'monitoring')

  return (
    <figure className="chart" onMouseLeave={() => setHover(null)}>
      <figcaption className="key">
        <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" className="series" /></svg>Daily late share</span>
        <span><svg width="22" height="10"><line x1="0" x2="22" y1="5" y2="5" className="keyline center" /></svg>{`Baseline p̄ ${pct(pBar)}`}</span>
        <span><svg width="22" height="12"><rect width="22" height="12" fill="var(--band)" /><line x1="0" x2="22" y1="1" y2="1" className="keyline limit" /><line x1="0" x2="22" y1="11" y2="11" className="keyline limit" /></svg>3σ control limits</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" className="mk critical" /></svg>Above UCL</span>
        <span><svg width="14" height="14"><Marker cx={7} cy={7} status="low" small /></svg>Below LCL</span>
        <span><svg width="12" height="12"><circle cx="6" cy="6" r="4" className="mk hollow pending" /></svg>No verdict yet</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Daily late rate for zone ${zone}, ${points.length} days. Details are in the table below.`}>
        {split != null && <rect className="base-zone" x={PAD.l} y={PAD.t} width={split - PAD.l} height={H - PAD.t - PAD.b} />}

        {ticks.map((t) => (
          <g key={t} className="grid">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end">{`${Math.round(t * 100)}%`}</text>
          </g>
        ))}

        {points.map((p, i) =>
          p.upper == null ? null : (
            <g key={`lim${i}`} className="limit">
              <rect className="band" x={x(i) - slot / 2} width={slot} y={y(p.upper)} height={Math.max(0, y(p.lower) - y(p.upper))} />
              <line x1={x(i) - slot / 2} x2={x(i) + slot / 2} y1={y(p.upper)} y2={y(p.upper)} />
              <line x1={x(i) - slot / 2} x2={x(i) + slot / 2} y1={y(p.lower)} y2={y(p.lower)} />
            </g>
          )
        )}

        {split != null && (
          <g className="divider">
            <line x1={split} x2={split} y1={PAD.t - 6} y2={H - PAD.b} />
            <text x={split - 6} y={PAD.t - 10} textAnchor="end">◀ baseline</text>
            <text x={split + 6} y={PAD.t - 10}>monitoring ▶</text>
          </g>
        )}

        {pBar != null && (
          <g className="center">
            <line x1={PAD.l} x2={W - PAD.r} y1={y(pBar)} y2={y(pBar)} />
          </g>
        )}

        {hover != null && <line className="cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} />}

        <polyline className="series base" points={line(0, firstMon < 0 ? points.length : firstMon)} />
        {firstMon >= 0 && <polyline className="series" points={line(firstMon, points.length)} />}

        {sel >= 0 && points[sel].rate != null && <circle className="ring" cx={x(sel)} cy={y(points[sel].rate)} r="11" />}

        {points.map((p, i) => {
          if (p.rate == null) return null
          const info = statusInfo(p.status)
          return (
            <g key={`pt${i}`}>
              <Marker cx={x(i)} cy={y(p.rate)} status={p.status} big={hover === i || i === peak} />
              <circle cx={x(i)} cy={y(p.rate)} r={Math.max(10, slot / 2)} className="hit"
                onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}
                onClick={() => onPick?.(p)} onKeyDown={(e) => { if (e.key === 'Enter') onPick?.(p) }}>
                <title>{`${p.date}: ${pct(p.rate)} (${p.late}/${p.n}) - ${info.label}`}</title>
              </circle>
            </g>
          )
        })}

        {peak >= 0 && (
          <text className="peak" x={x(peak)} y={y(points[peak].rate) - 14} textAnchor="middle">
            {`${shortDate(points[peak].date)} · ${pct(points[peak].rate)}`}
          </text>
        )}

        {labelled.map((i) => (
          <text key={`d${i}`} x={x(i)} y={H - 10} textAnchor="middle">{shortDate(points[i].date)}</text>
        ))}
      </svg>

      {hover != null && <Tooltip p={points[hover]} pBar={pBar} left={(x(hover) / W) * 100} clickable={!!onPick} />}
    </figure>
  )
}

function Marker({ cx, cy, status, small, big }) {
  const info = statusInfo(status)
  const r = big ? 6.5 : 4.5
  if (status === 'low') {
    const s = small ? 6 : big ? 9 : 7
    return <path className={`mk ${info.tone}`} d={`M${cx - s},${cy - s * 0.6} L${cx + s},${cy - s * 0.6} L${cx},${cy + s * 0.9} Z`} />
  }
  if (status === 'high') return <circle className="mk critical" cx={cx} cy={cy} r={big ? 7 : 5.5} />
  if (info.formal) return <circle className={`mk ${info.tone}`} cx={cx} cy={cy} r={small ? 3 : 3.2} />
  return <circle className={`mk hollow ${info.tone}`} cx={cx} cy={cy} r={r - 1} />
}

function Tooltip({ p, pBar, left, clickable }) {
  const info = statusInfo(p.status)
  return (
    <div className="tip" style={{ left: `${Math.min(Math.max(left, 16), 84)}%` }} role="status">
      <strong>{p.date}</strong> · {p.period}
      <div>{`Late rate ${pct(p.rate)} = ${p.late} late / ${p.n} responses`}</div>
      <div>{`Limits ${pct(p.lower)} – ${pct(p.upper)} · p̄ ${pct(pBar)}`}</div>
      <div>{`${info.icon} ${info.label}`}</div>
      {p.reasons?.length > 0 && <div className="muted">{reasonsText(p.reasons)}</div>}
      {clickable && p.late > 0 && <div className="hint">Click to list this day&rsquo;s slowest arrivals</div>}
    </div>
  )
}
