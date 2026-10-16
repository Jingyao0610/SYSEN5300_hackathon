import { useEffect, useState } from 'react'
import { API_URL, MOCK, analyze, errorLines, health } from './api.js'
import { MOCK_SCENARIOS } from './mock/fixtures.js'
import { TZ, nyLocalToIso, nyMidnightIso, showNy } from './time.js'
import DataSettings from './views/DataSettings.jsx'
import ZoneMonitoring from './views/ZoneMonitoring.jsx'
import IncidentReview from './views/IncidentReview.jsx'

const PAGES = [
  ['data', 'Data & Settings'],
  ['zones', 'Zone Monitoring'],
  ['incidents', 'Incident Review'],
]

const DEFAULT_SETTINGS = { selected_priority: '', target_minutes: '10', baseline_end: '', as_of: '' }

export default function App() {
  const [page, setPage] = useState('data')
  const [records, setRecords] = useState([])
  const [source, setSource] = useState('')
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])
  const [focus, setFocus] = useState({ zone: '', date: '' })
  const [api, setApi] = useState('checking')
  const [scenario, setScenario] = useState('signals')

  useEffect(() => {
    health().then(() => setApi('ok')).catch(() => setApi('down'))
  }, [])

  // Any change to data or settings makes the old result stale: drop it, and
  // with it every baseline confirmation. A new Run analysis is required.
  const invalidate = () => { setResult(null); setErrors([]) }
  const changeRecords = (next, label) => { setRecords(next); if (label !== undefined) setSource(label); invalidate() }
  const changeSettings = (patch) => { setSettings((s) => ({ ...s, ...patch })); invalidate() }

  function buildRequest(reviewedZones, asOf) {
    const problems = []
    const target = Number(settings.target_minutes)
    if (records.length === 0) problems.push('Import a CSV or add at least one response first.')
    if (!settings.selected_priority) problems.push('Choose a priority.')
    if (!(target > 0)) problems.push('Target minutes must be a positive number.')
    if (!settings.baseline_end) problems.push('Choose the baseline end date.')
    if (problems.length) throw problems
    const req = {
      records,
      target_minutes: target,
      selected_priority: settings.selected_priority,
      baseline_end: nyMidnightIso(settings.baseline_end),
      reviewed_zones: reviewedZones,
    }
    const fixedAsOf = asOf ?? (settings.as_of ? nyLocalToIso(settings.as_of) : null)
    if (fixedAsOf) req.as_of = fixedAsOf
    return req
  }

  async function run(reviewedZones = [], asOf) {
    let req
    try {
      req = buildRequest(reviewedZones, asOf)
    } catch (e) {
      setErrors(Array.isArray(e) ? e : [e.message])
      return
    }
    setBusy(true)
    setErrors([])
    try {
      setResult(await analyze(req, scenario))
    } catch (e) {
      setResult(null)
      setErrors([e.status === 422 ? 'The API rejected the request (HTTP 422):' : 'Analysis failed:', ...errorLines(e)])
    } finally {
      setBusy(false)
    }
  }

  // Confirming a zone's baseline re-runs the analysis at the SAME as_of, so
  // the only thing that changes is which zones may receive a verdict.
  function toggleReviewed(zone) {
    const current = result?.meta?.reviewed_zones ?? []
    const next = current.includes(zone) ? current.filter((z) => z !== zone) : [...current, zone]
    run(next, result.meta.as_of)
  }

  function viewIncidents(zone, date) {
    setFocus({ zone, date })
    setPage('incidents')
  }

  return (
    <div className="app">
      {MOCK && (
        <div className="mock-banner" role="alert">
          <strong>MOCK DATA — not a real analysis.</strong> Fixed fixtures from the SPEC known answers; the API is not called.
          <label>
            Scenario{' '}
            <select value={scenario} onChange={(e) => { setScenario(e.target.value); invalidate() }}>
              {Object.entries(MOCK_SCENARIOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      )}

      <header>
        <h1>Response Late-Rate Monitor</h1>
        <p className="lede">
          For ambulance dispatch supervisors: which zones show an unusual change in the daily share of late
          arrivals, and which completed responses need review. All statistics come from the server.
        </p>
        <nav aria-label="Pages">
          {PAGES.map(([key, label]) => (
            <button key={key} className={page === key ? 'tab on' : 'tab'} onClick={() => setPage(key)}
              aria-current={page === key ? 'page' : undefined}>
              {label}
            </button>
          ))}
        </nav>
        <ContextBar result={result} settings={settings} records={records} api={api} />
      </header>

      {errors.length > 0 && (
        <div className="error" role="alert">
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <main>
        {page === 'data' && (
          <DataSettings
            records={records} source={source} settings={settings} result={result} busy={busy}
            onRecords={changeRecords} onSettings={changeSettings} onRun={() => run([])}
            onShowChart={() => setPage('zones')}
          />
        )}
        {page === 'zones' && (
          <ZoneMonitoring
            result={result} busy={busy} onToggleReviewed={toggleReviewed}
            onViewIncidents={viewIncidents} onBack={() => setPage('data')}
          />
        )}
        {page === 'incidents' && (
          <IncidentReview
            result={result} focus={focus} onFocus={setFocus} onBack={() => setPage('zones')}
          />
        )}
      </main>
    </div>
  )
}

function ContextBar({ result, settings, records, api }) {
  const m = result?.meta
  const q = result?.quality
  return (
    <dl className="context">
      <div><dt>Time zone</dt><dd>{TZ}</dd></div>
      <div>
        <dt>Analysis as of</dt>
        <dd>{m ? `${showNy(m.as_of)}${m.as_of_source === 'server' ? ' (server now)' : ''}` : 'not run'}</dd>
      </div>
      <div><dt>Target</dt><dd>{`${m?.target_minutes ?? settings.target_minutes} min`}</dd></div>
      <div><dt>Priority</dt><dd>{m?.selected_priority ?? (settings.selected_priority || '—')}</dd></div>
      <div>
        <dt>Usable / excluded</dt>
        <dd>
          {q
            ? `${q.selected_priority.usable} / ${q.selected_priority.excluded} of ${q.selected_priority.total} (priority) · ${q.all_rows.usable} / ${q.all_rows.excluded} of ${q.all_rows.total} (all rows)`
            : `${records.length} rows loaded, not analysed`}
        </dd>
      </div>
      <div>
        <dt>API</dt>
        <dd className={`api ${api}`}>{MOCK ? 'MOCK (not called)' : api === 'ok' ? 'connected' : api === 'down' ? `unreachable at ${API_URL}` : 'checking…'}</dd>
      </div>
    </dl>
  )
}
