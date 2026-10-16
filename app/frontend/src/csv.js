// CSV import/export for the five incident columns. Parsing only: values stay
// as text and every validity check (timestamps, duplicates, order) is done by
// the server, which reports row-level exclusions.

export const COLUMNS = ['incident_id', 'zone', 'priority', 'dispatched_at', 'on_scene_at']

/** Split CSV text into rows of fields (RFC 4180 quotes, CRLF or LF). */
export function parseRows(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''))
}

/**
 * Parse an incident CSV into records. Throws if a required column is missing
 * (the API would answer 422). Extra columns are ignored; empty cells become ''.
 */
export function parseIncidents(text) {
  const rows = parseRows(text.replace(/^﻿/, ''))
  if (rows.length === 0) throw new Error('The file is empty.')
  const header = rows[0].map((h) => h.trim())
  const missing = COLUMNS.filter((c) => !header.includes(c))
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`)
  const idx = COLUMNS.map((c) => header.indexOf(c))
  return rows.slice(1).map((r) =>
    Object.fromEntries(COLUMNS.map((c, j) => [c, (r[idx[j]] ?? '').trim()]))
  )
}

const quote = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Records back to CSV text with the five columns, in order. */
export function toCsv(records) {
  return [COLUMNS.join(','), ...records.map((r) => COLUMNS.map((c) => quote(r[c])).join(','))].join('\n') + '\n'
}
