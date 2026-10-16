import { useMemo, useState } from 'react'
import { showNy } from '../time.js'
import { ExcludedList } from './DataSettings.jsx'

export default function IncidentReview({ result, focus, onFocus, onBack }) {
  const [sortBy, setSortBy] = useState('minutes')

  const incidents = result?.late_incidents ?? []
  const zones = useMemo(() => [...new Set(incidents.map((i) => i.zone))].sort(), [incidents])
  const dates = useMemo(
    () => [...new Set(incidents.filter((i) => !focus.zone || i.zone === focus.zone).map((i) => i.date))].sort(),
    [incidents, focus.zone]
  )

  const rows = useMemo(() => {
    const kept = incidents.filter((i) => (!focus.zone || i.zone === focus.zone) && (!focus.date || i.date === focus.date))
    return [...kept].sort((a, b) =>
      sortBy === 'minutes'
        ? b.response_minutes - a.response_minutes
        : Date.parse(a.dispatched_at) - Date.parse(b.dispatched_at)
    )
  }, [incidents, focus, sortBy])

  if (!result) {
    return (
      <section className="panel">
        <p>No current analysis. Run it on the Data &amp; Settings page.</p>
      </section>
    )
  }

  const target = result.meta.target_minutes

  return (
    <>
      <section className="panel">
        <h2>Late completed responses</h2>
        <p className="muted">
          Responses that took longer than the {target}-minute target, for priority {result.meta.selected_priority}.
          A late response is a case to review, not by itself a statistical signal. Only usable records appear here.
        </p>
        <div className="row">
          <label className="inline">
            Zone{' '}
            <select value={focus.zone} onChange={(e) => onFocus({ zone: e.target.value, date: '' })}>
              <option value="">All zones</option>
              {zones.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
          <label className="inline">
            Date{' '}
            <select value={focus.date} onChange={(e) => onFocus({ ...focus, date: e.target.value })}>
              <option value="">All dates</option>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="inline">
            Sort by{' '}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="minutes">Response minutes (longest first)</option>
              <option value="time">Dispatch time</option>
            </select>
          </label>
          <button onClick={() => onFocus({ zone: '', date: '' })}>Clear filters</button>
          <button onClick={onBack}>← Back to chart</button>
        </div>

        <p aria-live="polite">{rows.length} late response(s) shown.</p>
        {rows.length > 0 && (
          <div className="scroll">
            <table>
              <thead>
                <tr><th>Incident</th><th>Zone</th><th>Date</th><th>Dispatched</th><th>On scene</th><th>Response (min)</th></tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.incident_id}>
                    <td>{i.incident_id}</td><td>{i.zone}</td><td>{i.date}</td>
                    <td>{showNy(i.dispatched_at)}</td><td>{showNy(i.on_scene_at)}</td>
                    <td className="num">{i.response_minutes.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Record coverage</h2>
        <p>
          {`${result.quality.selected_priority.usable} usable and ${result.quality.selected_priority.excluded} excluded of ${result.quality.selected_priority.total} rows for this priority.`}
        </p>
        <p className="muted">
          This page only knows about responses that were logged with both timestamps. Missing or incorrect logs can
          bias the late rate, and cancelled or still-open calls are not included.
        </p>
        {result.excluded_records.length > 0 && (
          <details>
            <summary>{result.excluded_records.length} excluded row(s) and why</summary>
            <ExcludedList items={result.excluded_records} />
          </details>
        )}
      </section>
    </>
  )
}
