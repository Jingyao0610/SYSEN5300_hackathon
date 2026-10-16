import { useMemo, useState } from 'react'
import { COLUMNS, extraColumns, parseIncidents, toCsv } from '../csv.js'
import { reasonText, reasonsText } from '../status.js'
import { nyLocalToIso, showNy } from '../time.js'

const PREVIEW_ROWS = 100
const EMPTY_FORM = { incident_id: '', zone: '', priority: '', dispatched_at: '', on_scene_at: '' }

export default function DataSettings({ records, source, settings, res, busy, onRecords, onSettings, onRun, onShowChart }) {
  const [importError, setImportError] = useState('')
  const [form, setForm] = useState(null)

  const extras = useMemo(() => extraColumns(records), [records])
  const priorities = useMemo(() => [...new Set(records.map((r) => r.priority).filter(Boolean))].sort(), [records])
  const excludedByRow = useMemo(
    () => new Map((res?.excluded_records ?? []).map((e) => [e.row_number, e.reasons])),
    [res]
  )

  async function importFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const rows = parseIncidents(await file.text())
      setImportError('')
      onRecords(rows, file.name) // replaces the current session
      const ps = [...new Set(rows.map((r) => r.priority).filter(Boolean))].sort()
      if (!ps.includes(settings.selected_priority)) onSettings({ selected_priority: ps[0] ?? '' })
    } catch (err) {
      setImportError(`${file.name}: ${err.message}`)
    }
  }

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(records)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'responses.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function saveForm(e) {
    e.preventDefault()
    const rec = {
      ...form,
      dispatched_at: nyLocalToIso(form.dispatched_at),
      on_scene_at: nyLocalToIso(form.on_scene_at),
    }
    onRecords([...records, rec], source ? `${source} + manual entries` : 'manual entries')
    if (!settings.selected_priority) onSettings({ selected_priority: rec.priority })
    setForm(null)
  }

  return (
    <>
      <section className="panel">
        <h2>1. Records</h2>
        <p className="muted">
          One row per completed dispatch with columns <code>{COLUMNS.join(', ')}</code>. Timestamps need a UTC
          offset, e.g. <code>2026-09-21T08:15:00-04:00</code>. Importing replaces the current session; records are
          kept only in this browser tab, so export them to keep a copy.
        </p>
        <div className="row">
          <label className="button">
            Import CSV
            <input type="file" accept=".csv,text/csv" onChange={importFile} hidden />
          </label>
          <button onClick={() => setForm({ ...EMPTY_FORM, priority: settings.selected_priority })} disabled={!!form}>
            Add completed response
          </button>
          <button onClick={exportCsv} disabled={records.length === 0}>Export CSV</button>
          <span className="muted">
            {records.length ? `${records.length} rows from ${source}` : 'No records loaded.'}
            {extras.length > 0 && ` · extra column(s) kept for export, not analysed: ${extras.join(', ')}`}
          </span>
        </div>
        {importError && <p className="error" role="alert">{importError}</p>}

        {form && (
          <form className="entry" onSubmit={saveForm}>
            <h3>Add completed response</h3>
            <p className="muted">Times are New York local time; the offset is added for you.</p>
            {['incident_id', 'zone', 'priority'].map((k) => (
              <label key={k}>
                {k}
                <input required value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
            {['dispatched_at', 'on_scene_at'].map((k) => (
              <label key={k}>
                {k}
                <input type="datetime-local" step="1" required value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </label>
            ))}
            <div className="row">
              <button type="submit" className="primary">Save</button>
              <button type="button" onClick={() => setForm(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <section className="panel">
        <h2>2. Settings</h2>
        <div className="settings">
          <label>
            Priority to analyse
            <select value={settings.selected_priority} onChange={(e) => onSettings({ selected_priority: e.target.value })}>
              <option value="">— choose —</option>
              {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Target (minutes)
            <input type="number" min="0" step="any" value={settings.target_minutes}
              onChange={(e) => onSettings({ target_minutes: e.target.value })} />
            <small className="muted">Late = response time strictly above this. 10 is a demo value, not a clinical standard.</small>
          </label>
          <label>
            Baseline ends at the start of
            <input type="date" value={settings.baseline_end} onChange={(e) => onSettings({ baseline_end: e.target.value })} />
            <small className="muted">New York midnight; dispatches from this moment on are monitoring days.</small>
          </label>
          <label>
            Analysis time (optional)
            <input type="datetime-local" step="1" value={settings.as_of} onChange={(e) => onSettings({ as_of: e.target.value })} />
            <small className="muted">Leave blank for the server&rsquo;s current time. A historical time is for demos and tests.</small>
          </label>
        </div>
        <div className="row">
          <button className="primary" onClick={onRun} disabled={busy}>{busy ? 'Running…' : 'Run analysis'}</button>
          {res && <button onClick={onShowChart}>View zone chart →</button>}
          {!res && records.length > 0 && <span className="muted">No current result: run the analysis after any change.</span>}
        </div>
        {res?.quality.reasons.length > 0 && (
          <p className="notice">{res.quality.reasons.map(reasonText).join(' ')} There is no result to chart; no rate is shown as zero.</p>
        )}
      </section>

      <section className="panel">
        <h2>3. Record preview</h2>
        {res && (
          <p className="muted">
            Rows the server excluded show the reason. Excluded rows are left out of every count, rate and limit.
          </p>
        )}
        {records.length === 0 ? (
          <p className="muted">Nothing to show yet.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr><th>#</th>{COLUMNS.map((c) => <th key={c}>{c}</th>)}<th>Excluded because</th></tr>
              </thead>
              <tbody>
                {records.slice(0, PREVIEW_ROWS).map((r, i) => {
                  const reasons = excludedByRow.get(i + 1)
                  return (
                    <tr key={i} className={reasons ? 'excluded' : ''}>
                      <td>{i + 1}</td>
                      <td>{r.incident_id}</td>
                      <td>{r.zone}</td>
                      <td>{r.priority}</td>
                      <td title={r.dispatched_at}>{r.dispatched_at ? showNy(r.dispatched_at) : <em>missing</em>}</td>
                      <td title={r.on_scene_at}>{r.on_scene_at ? showNy(r.on_scene_at) : <em>missing</em>}</td>
                      <td>{reasons ? reasonsText(reasons) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {records.length > PREVIEW_ROWS && <p className="muted">Showing the first {PREVIEW_ROWS} of {records.length} rows.</p>}
          </div>
        )}
        {res && res.excluded_records.length > 0 && (
          <details>
            <summary>All {res.excluded_records.length} excluded rows (all priorities)</summary>
            <ExcludedList items={res.excluded_records} />
          </details>
        )}
      </section>
    </>
  )
}

export function ExcludedList({ items }) {
  return (
    <ul className="excluded-list">
      {items.map((e, i) => (
        <li key={i}>
          Row {e.row_number} ({e.incident_id ?? 'no valid id'}, zone {e.zone ?? '?'}, {e.priority ?? 'no priority'}): {reasonsText(e.reasons)}
        </li>
      ))}
    </ul>
  )
}
