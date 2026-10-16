// The ONLY place the API base URL lives. Set VITE_API_URL in .env.local (dev)
// or in the build environment (deploy). Never commit the course server URL.
// Request/response shapes: docs/interfaces.md v1.0.

export const API_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

// MOCK mode is explicit: only `npm run dev:mock` (VITE_MOCK=1) turns it on.
// A failed real call is shown as an error. It NEVER falls back to mock data.
export const MOCK = import.meta.env.VITE_MOCK === '1'

const loadMock = () => import('./mock/index.js')

/** An error response: { error: { code, message, fields } } (interfaces section 5). */
export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || `API returned HTTP ${status}`)
    this.status = status
    this.code = error?.code ?? null
    this.fields = error?.fields ?? []
  }
}

async function request(path, options) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, options)
  } catch (error) {
    if (options?.signal?.aborted) throw error
    throw new ApiError(0, { message: `Cannot reach the API at ${API_URL}. Is the backend running?` })
  }
  let body = null
  try {
    body = await res.json()
  } catch {
    // non-JSON body: report the status below
  }
  if (!res.ok) throw new ApiError(res.status, body?.error)
  return body
}

/** GET /health -> { status, schema_version, analysis_mode } */
export function health() {
  if (MOCK) return Promise.resolve({ status: 'ok', schema_version: '1.0', analysis_mode: 'mock' })
  return request('/health')
}

/**
 * POST /analyze with the six v1.0 fields. Every statistic in the response is
 * computed by app/qc.py on the server; this file only moves JSON.
 */
export async function analyze(req, mockScenario, { signal } = {}) {
  if (MOCK) return (await loadMock()).mockAnalyze(req, mockScenario)
  return request('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal,
  })
}

/** Scenario list and CSV text for MOCK mode only. */
export async function mockScenarios() {
  const m = await loadMock()
  return { scenarios: m.MOCK_SCENARIOS, csv: m.scenarioCsv }
}
