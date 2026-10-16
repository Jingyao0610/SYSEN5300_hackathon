import { useEffect, useRef, useState } from 'react'
import { API_URL, MOCK, analyze, health, mockScenarios } from './api.js'
import { parseIncidents } from './csv.js'
import { pct } from './status.js'
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
  const [result, setResult] = useState(null) // { res, serverClock }
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState([])
  const [focus, setFocus] = useState({ zone: '', date: '' })
  const [api, setApi] = useState({ state: 'checking' })
  const [mock, setMock] = useState(null) // { scenarios, csv, picked }
  const errorRef = useRef(null)

  useEffect(() => {
    if (errors.length) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [errors])

  useEffect(() => {
    health()
      .then((h) => setApi({ state: 'ok', mode: h.analysis_mode }))
      .catch(() => setApi({ state: 'down' }))
    if (MOCK) mockScenarios().then((m) => setMock({ ...m, picked: '' }))
  }, [])

  // Any change to data or settings makes the old result stale: drop it, and
  // with it every baseline confirmation. A new Run analysis is required.
  const invalidate = () => { setResult(null); setErrors([]) }
  const changeRecords = (next, label) => { setRecords(next); if (label !== undefined) setSource(label); invalidate() }
  const changeSettings = (patch) => { setSettings((s) => ({ ...s, ...patch })); invalidate() }

  // MOCK only: load a scenario's records and its fixed settings into the session.
  function pickScenario(name) {
    const sc = mock.scenarios[name]
    setMock({ ...mock, picked: name })
    if (!sc) return
    changeRecords(parseIncidents(mock.csv(name)), `MOCK scenario "${name}"`)
    changeSettings({
      selected_priority: sc.settings.selected_priority,
      target_minutes: String(sc.settings.target_minutes),
      baseline_end: sc.settings.baseline_end.slice(0, 10),
      as_of: sc.settings.as_of.slice(0, 19), // already New York local time
    })
  }

  function buildRequest(reviewedZones, asOf) {
    const problems = []
    const target = Number(settings.target_minutes)
    if (!settings.selected_priority) problems.push('Choose a priority.')
    if (!(target > 0) || !Number.isFinite(target)) problems.push('Target minutes must be a positive number.')
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
      const res = await analyze(req, mock?.picked)
      // a review re-run reuses the earlier as_of, so it keeps the earlier label
      setResult({ res, serverClock: asOf ? !!result?.serverClock : !req.as_of })
    } catch (e) {
      setResult(null)
      const head = e.status === 422 ? 'The API rejected the request (HTTP 422).'
        : e.status === 503 ? 'The analysis service is not available yet (HTTP 503).'
        : 'Analysis failed.'
      setErrors([head, e.message, ...(e.fields?.length ? [`Field(s): ${e.fields.join(', ')}`] : [])])
    } finally {
      setBusy(false)
    }
  }

  // Confirming a zone's baseline re-runs the analysis at the SAME as_of, so
  // the only thing that changes is which zones may receive a verdict.
  function toggleReviewed(zone) {
    const current = result?.res.meta.reviewed_zones ?? []
    const next = current.includes(zone) ? current.filter((z) => z !== zone) : [...current, zone]
    run(next, result.res.meta.as_of)
  }

  function viewIncidents(zone, date) {
    setFocus({ zone, date })
    setPage('incidents')
  }

  const res = result?.res ?? null
  const showMock = MOCK || res?.meta?.is_mock === true

  return (
    <div className="app">
      {showMock && (
        <div className="mock-banner" role="alert">
          <strong>MOCK DATA — not a live analysis.</strong>
          <span>
            {MOCK
              ? 'Precomputed core output for fixed synthetic scenarios; the API is not called and your edits are not analysed.'
              : 'The API reported is_mock = true.'}
          </span>
          {MOCK && mock && (
            <label>
              Scenario{' '}
              <select value={mock.picked} onChange={(e) => pickScenario(e.target.value)}>
                <option value="">— load a scenario —</option>
                {Object.entries(mock.scenarios).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          )}
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
        <div className="error" role="alert" ref={errorRef}>
          {errors.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}

      <main>
        {page === 'data' && (
          <DataSettings
            records={records} source={source} settings={settings} res={res} busy={busy}
            onRecords={changeRecords} onSettings={changeSettings} onRun={() => run([])}
            onShowChart={() => setPage('zones')}
          />
        )}
        {page === 'zones' && (
          <ZoneMonitoring
            res={res} busy={busy} onToggleReviewed={toggleReviewed}
            onViewIncidents={viewIncidents} onBack={() => setPage('data')}
          />
        )}
        {page === 'incidents' && (
          <IncidentReview res={res} focus={focus} onFocus={setFocus} onBack={() => setPage('zones')} />
        )}
      </main>
    </div>
  )
}

function ContextBar({ result, settings, records, api }) {
  const m = result?.res.meta
  const q = result?.res.quality
  const scope = (c) => `${c.usable_rows} usable / ${c.excluded_rows} excluded of ${c.total_rows}`
  return (
    <dl className="context">
      <div><dt>Time zone</dt><dd>{TZ}</dd></div>
      <div>
        <dt>Analysis as of</dt>
        <dd>{m ? `${showNy(m.as_of)}${result.serverClock ? ' (server clock)' : ''}` : 'not run'}</dd>
      </div>
      <div><dt>Target</dt><dd>{`${m?.target_minutes ?? settings.target_minutes} min`}</dd></div>
      <div><dt>Priority</dt><dd>{m?.selected_priority ?? (settings.selected_priority || '—')}</dd></div>
      <div>
        <dt>Selected priority rows</dt>
        <dd>{q ? `${scope(q.selected_priority)} (${pct(q.selected_priority.usable_fraction)} usable)` : `${records.length} rows loaded, not analysed`}</dd>
      </div>
      <div>
        <dt>All imported rows</dt>
        <dd>{q ? `${scope(q.overall)} (${pct(q.overall.usable_fraction)} usable)` : '—'}</dd>
      </div>
      <div>
        <dt>API</dt>
        <dd className={`api ${api.state}`}>
          {MOCK ? 'MOCK (not called)'
            : api.state === 'ok' ? `connected (${api.mode ?? 'unknown'} mode)`
            : api.state === 'down' ? `unreachable at ${API_URL}` : 'checking…'}
        </dd>
      </div>
    </dl>
  )
}
