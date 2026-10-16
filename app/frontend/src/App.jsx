import { useEffect, useRef, useState } from 'react'
import { API_URL, MOCK, analyze, health, mockScenarios } from './api.js'
import { parseIncidents } from './csv.js'
import { EXAMPLES, SHOWCASE } from './examples.js'
import { pct } from './status.js'
import { TZ, nyLocalToIso, nyMidnightIso, showNy } from './time.js'
import DataSettings from './views/DataSettings.jsx'
import ZoneMonitoring from './views/ZoneMonitoring.jsx'
import IncidentReview from './views/IncidentReview.jsx'
import LiveSimulation from './views/LiveSimulation.jsx'

const PAGES = [
  ['data', 'Data & Settings'],
  ['zones', 'Zone Monitoring'],
  ['incidents', 'Incident Review'],
  ['simulation', 'Live Simulation'],
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
  const autoLoaded = useRef(false)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('theme') || 'auto' } catch { return 'auto' }
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    try { localStorage.setItem('theme', theme) } catch { /* private mode: theme just isn't remembered */ }
  }, [theme])

  const cycleTheme = () => setTheme((t) => (t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'))

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

  // ctx lets a freshly loaded example run before React state has updated
  function buildRequest(reviewedZones, asOf, ctx = { records, settings }) {
    const { records, settings } = ctx
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

  async function run(reviewedZones = [], asOf, ctx) {
    let req
    try {
      req = buildRequest(reviewedZones, asOf, ctx)
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

  // Load an example dataset with its codebook settings and run it straight away.
  // Baselines start unreviewed, exactly as for an uploaded file.
  async function loadExample(key, openDashboard = false) {
    const ex = EXAMPLES[key]
    if (!ex) return
    setBusy(true)
    try {
      const text = await (await fetch(ex.url)).text()
      const rows = parseIncidents(text)
      setRecords(rows)
      setSource(ex.file)
      setSettings(ex.settings)
      setResult(null)
      setErrors([])
      await run([], undefined, { records: rows, settings: ex.settings })
      if (openDashboard) setPage((current) => current === 'simulation' ? current : 'zones')
    } catch (e) {
      setErrors([`Could not load the example ${ex.file}: ${e.message}`])
    } finally {
      setBusy(false)
    }
  }

  // First visit: show something. ?example=<key> picks one, ?example=none starts empty.
  useEffect(() => {
    if (MOCK || autoLoaded.current) return
    autoLoaded.current = true // React dev mode runs effects twice; load once
    const want = new URLSearchParams(window.location.search).get('example')
    if (want === 'none') return
    const key = EXAMPLES[want] ? want : SHOWCASE[Math.floor(Math.random() * SHOWCASE.length)]
    loadExample(key, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // One click for "I have reviewed every usable baseline"; same as_of, like toggleReviewed.
  function confirmAll() {
    const zones = result.res.zone_baselines
      .filter((b) => b.status === 'ready' || b.status === 'unreviewed_baseline').map((b) => b.zone)
    run(zones, result.res.meta.as_of)
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
      <nav className="nav" aria-label="Pages">
        <div className="nav-inner">
          <div className="brand">
            <span className="logo" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12h4l3-7 4 14 3-7h6" />
              </svg>
            </span>
            <div><b>Response Late-Rate Monitor</b><span>EMS dispatch supervisor console</span></div>
          </div>
          <div className="tabs">
            {PAGES.map(([key, label]) => (
              <button key={key} className={page === key ? 'tab on' : 'tab'} onClick={() => setPage(key)}
                aria-current={page === key ? 'page' : undefined}>
                {label}
                {key === 'data' && res && <span className="done" aria-label="analysis ready">✓</span>}
              </button>
            ))}
          </div>
          <div className="pills">
            <span className={`pill ${MOCK ? 'down' : api.state}`} title={MOCK ? 'Mock mode' : `API at ${API_URL}`}>
              <span className="dot" />
              {MOCK ? 'mock mode' : api.state === 'ok' ? `API · ${api.mode ?? 'unknown'} mode` : api.state === 'down' ? 'API unreachable' : 'API · checking'}
            </span>
            {page !== 'simulation' && res && <span className="pill">as of {asOfShort(res.meta.as_of)}</span>}
            <button className="pill theme" onClick={cycleTheme} title="Switch light / dark theme">
              {theme === 'dark' ? '☾ dark' : theme === 'light' ? '☀ light' : '◐ auto'}
            </button>
          </div>
        </div>
      </nav>

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

      <div className="page">
        {page !== 'simulation' && <ContextBar result={result} settings={settings} records={records} source={source} />}

        {page !== 'simulation' && errors.length > 0 && (
          <div className="error" role="alert" ref={errorRef}>
            {errors.map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <main>
          {page === 'data' && (
            <DataSettings
              records={records} source={source} settings={settings} res={res} busy={busy}
              onRecords={changeRecords} onSettings={changeSettings} onRun={() => run([])}
              onLoadExample={(k) => loadExample(k, true)}
              onShowChart={() => setPage('zones')}
            />
          )}
          {page === 'zones' && (
            <ZoneMonitoring
              res={res} busy={busy} source={source} onToggleReviewed={toggleReviewed} onConfirmAll={confirmAll}
              onViewIncidents={viewIncidents} onBack={() => setPage('data')}
            />
          )}
          {page === 'incidents' && (
            <IncidentReview res={res} focus={focus} onFocus={setFocus} onBack={() => setPage('zones')} />
          )}
          <div hidden={page !== 'simulation'}>
            <LiveSimulation active={page === 'simulation'} />
          </div>
        </main>
      </div>
    </div>
  )
}

/** "2026-10-02 00:00" in New York time, for the navbar pill. */
function asOfShort(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}`
}

function ContextBar({ result, settings, records, source }) {
  const m = result?.res.meta
  const q = result?.res.quality
  const scope = (c) => `${c.usable_rows} usable / ${c.excluded_rows} excluded of ${c.total_rows}`
  const cutoff = m?.baseline_end?.slice(0, 10) ?? settings.baseline_end
  return (
    <dl className="context">
      <div><dt>Dataset</dt><dd>{records.length ? source : 'none loaded'}</dd></div>
      <div><dt>Priority</dt><dd>{m?.selected_priority ?? (settings.selected_priority || '—')}</dd></div>
      <div><dt>Late if</dt><dd>{`> ${m?.target_minutes ?? settings.target_minutes} min`}</dd></div>
      <div><dt>Baseline</dt><dd>{cutoff ? `before ${cutoff}` : '—'}</dd></div>
      <div><dt>Time zone</dt><dd>{TZ}</dd></div>
      <div>
        <dt>Analysis as of</dt>
        <dd>{m ? `${showNy(m.as_of)}${result.serverClock ? ' (server clock)' : ''}` : 'not run'}</dd>
      </div>
      <div>
        <dt>Selected priority rows</dt>
        <dd>{q ? `${scope(q.selected_priority)} (${pct(q.selected_priority.usable_fraction)} usable)` : `${records.length} rows loaded, not analysed`}</dd>
      </div>
      <div>
        <dt>All imported rows</dt>
        <dd>{q ? `${scope(q.overall)} (${pct(q.overall.usable_fraction)} usable)` : '—'}</dd>
      </div>
    </dl>
  )
}
