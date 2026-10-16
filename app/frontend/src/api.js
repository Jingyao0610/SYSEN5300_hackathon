// The ONLY place the API base URL lives. Set VITE_API_URL in .env.local (dev)
// or in the build environment (deploy). Never commit the course server URL.
import { mockAnalyze } from './mock/fixtures.js'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// MOCK mode is explicit: only `npm run dev:mock` (VITE_MOCK=1) turns it on.
// A failed real call is shown as an error. It NEVER falls back to mock data.
export const MOCK = import.meta.env.VITE_MOCK === '1'

export class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : `API returned HTTP ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function request(path, options) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, options)
  } catch {
    throw new ApiError(0, `Cannot reach the API at ${API_URL}. Is the backend running?`)
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON body: keep null and report the status below
  }
  if (!res.ok) throw new ApiError(res.status, body?.detail ?? `API returned HTTP ${res.status}`)
  return body
}

/** GET /health */
export function health() {
  if (MOCK) return Promise.resolve({ status: 'mock' })
  return request('/health')
}

/**
 * POST /analyze. `req` = { records, target_minutes, selected_priority,
 * baseline_end, reviewed_zones, as_of? }. Every statistic in the response is
 * computed by app/qc.py on the server; this file only moves JSON.
 */
export function analyze(req, mockScenario) {
  if (MOCK) return Promise.resolve(mockAnalyze(req, mockScenario))
  return request('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

/** Turn a FastAPI 422 `detail` (string or list of {loc, msg}) into lines of text. */
export function errorLines(err) {
  const d = err?.detail
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join('.') || 'request'}: ${e.msg}`)
  return [err?.message || String(err)]
}
