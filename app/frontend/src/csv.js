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
 * (the API would answer 422). The five required values are trimmed; extra
 * columns are kept exactly as written (interfaces v1.0 section 3: the core
 * ignores them, the browser keeps them for export). Empty cells become ''.
 * A repeated header name keeps its first column.
 */
export function parseIncidents(text) {
  const rows = parseRows(text.replace(/^﻿/, ''))
  if (rows.length === 0) throw new Error('The file is empty.')
  const header = rows[0].map((h) => h.trim())
  const missing = COLUMNS.filter((c) => !header.includes(c))
  if (missing.length) throw new Error(`Missing required column(s): ${missing.join(', ')}`)
  const cols = header
    .map((name, i) => ({ name, i }))
    .filter(({ name, i }) => name !== '' && header.indexOf(name) === i)
  const required = new Set(COLUMNS)
  return rows.slice(1).map((r) =>
    Object.fromEntries(cols.map(({ name, i }) => {
      const v = r[i] ?? ''
      return [name, required.has(name) ? v.trim() : v]
    }))
  )
}

/** Column names that are not among the five required ones, in first-seen order. */
export function extraColumns(records) {
  const required = new Set(COLUMNS)
  const seen = new Set()
  for (const r of records) for (const k of Object.keys(r)) if (!required.has(k)) seen.add(k)
  return [...seen]
}

const quote = (v) => {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Records back to CSV: the five columns first, then every extra column. */
export function toCsv(records) {
  const cols = [...COLUMNS, ...extraColumns(records)]
  return [cols.map(quote).join(','), ...records.map((r) => cols.map((c) => quote(r[c])).join(','))].join('\n') + '\n'
}
