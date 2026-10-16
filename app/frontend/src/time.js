// America/New_York helpers for building request timestamps and displaying
// server timestamps. No statistics here.

export const TZ = 'America/New_York'

const offsetFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })

/** New York UTC offset in minutes at an instant, e.g. -240 for EDT. */
function offsetMinutes(ms) {
  const name = offsetFmt.formatToParts(new Date(ms)).find((p) => p.type === 'timeZoneName').value
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  if (!m) return 0 // "GMT" alone means +00:00
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0))
}

const pad = (n) => String(Math.abs(n)).padStart(2, '0')
const offsetText = (min) => `${min < 0 ? '-' : '+'}${pad(Math.trunc(min / 60))}:${pad(min % 60)}`

/**
 * A New York wall-clock time ("2026-09-21" or "2026-09-21T08:15") as ISO 8601
 * with its offset, e.g. "2026-09-21T00:00:00-04:00".
 */
export function nyLocalToIso(local) {
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!m) throw new Error(`Not a date/time: ${local}`)
  const [y, mo, d, h = '00', mi = '00', s = '00'] = m.slice(1)
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)
  // Guess the offset, then re-check it at the corrected instant (DST days).
  let off = offsetMinutes(wall + 5 * 3600e3)
  off = offsetMinutes(wall - off * 60e3)
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${offsetText(off)}`
}

/** New York midnight at the start of a calendar date (baseline_end). */
export const nyMidnightIso = (date) => nyLocalToIso(date)

const showFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
})

const HAS_OFFSET = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Display an ISO timestamp in New York time, e.g. "Sep 21, 2026, 08:15 EDT".
 * Text without a UTC offset is shown as typed: the browser would silently
 * read it as local time, hiding the error the server will report.
 */
export function showNy(iso) {
  if (!iso) return '—'
  if (!HAS_OFFSET.test(String(iso).trim())) return `${iso} (no offset)`
  const t = new Date(iso)
  return Number.isNaN(t.getTime()) ? String(iso) : showFmt.format(t)
}
