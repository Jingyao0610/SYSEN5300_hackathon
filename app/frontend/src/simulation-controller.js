// Session orchestration only. Every statistical result comes from the real API.
import { createSimulation, advanceSimulation, MAX_STEPS, SIMULATION_SETTINGS } from './simulation.js'

export function createSimulationController({ analyze, create = createSimulation,
  advance = advanceSimulation, maxSteps = MAX_STEPS, timeoutMs = 15000 } = {}) {
  let state = { session: null, result: null, busy: false, running: false,
    error: '', scenario: 'normal', delay: 1500, schedule: [] }
  let active = false
  let revision = 0
  let timer = null
  let pending = null
  const listeners = new Set()
  const update = (patch) => { state = { ...state, ...patch }; listeners.forEach((fn) => fn()) }
  const clearTimer = () => { clearTimeout(timer); timer = null }
  const pause = () => { clearTimer(); update({ running: false }) }
  const cancel = () => {
    revision++
    clearTimer()
    pending?.abort(new Error('Simulation request cancelled.'))
    pending = null
    update({ running: false, busy: false })
  }
  function scheduleNext() {
    clearTimer()
    if (active && state.running && !state.busy && state.session?.step < maxSteps) {
      timer = setTimeout(() => { timer = null; step() }, state.delay)
    }
  }
  async function request(candidate, reviewedZones, schedule, asOf = candidate.asOf) {
    if (!active || state.busy) return false
    const token = ++revision
    const abort = new AbortController()
    pending = abort
    update({ busy: true, error: '' })
    const timeout = setTimeout(() => abort.abort(new Error('Analysis timed out after 15 seconds. Try again.')), timeoutMs)
    let onAbort
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(abort.signal.reason || new Error('Analysis cancelled.'))
      abort.signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => analyze({ records: candidate.records, ...SIMULATION_SETTINGS,
          reviewed_zones: reviewedZones, as_of: asOf }, { signal: abort.signal })),
        cancelled,
      ])
      if (token !== revision) return false
      if (!result?.meta || result.meta.is_mock !== false) throw new Error('Simulation requires a real API result; mock output was rejected.')
      update({ session: candidate, result, schedule, busy: false,
        running: state.running && candidate.step < maxSteps })
      return true
    } catch (error) {
      if (token === revision) {
        clearTimer()
        update({ busy: false, running: false, error: error.message || 'Analysis failed. Try again.' })
      }
      return false
    } finally {
      clearTimeout(timeout)
      abort.signal.removeEventListener('abort', onAbort)
      if (token === revision) { pending = null; scheduleNext() }
    }
  }
  function step() {
    if (!active || state.busy || !state.session || state.session.step >= maxSteps) return Promise.resolve(false)
    const candidate = advance(state.session, state.scenario)
    const previous = state.schedule.at(-1)
    const schedule = previous?.scenario === state.scenario ? state.schedule
      : [...state.schedule, { from_step: candidate.step, scenario: state.scenario }]
    return request(candidate, state.result.meta.reviewed_zones, schedule)
  }
  return {
    getSnapshot: () => state,
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    setActive(value) { active = value; if (!value) cancel() },
    cancel,
    pause,
    reset(seed) {
      if (!active) return Promise.resolve(false)
      if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) {
        pause(); update({ error: 'Seed must be a whole number from 0 to 4294967295.' })
        return Promise.resolve(false)
      }
      cancel()
      update({ scenario: 'normal' })
      return request(create(seed), [], [])
    },
    advance: () => state.running ? Promise.resolve(false) : step(),
    start() {
      if (!active || state.busy || !state.session || state.session.step >= maxSteps) return
      update({ running: true, error: '' }); scheduleNext()
    },
    setDelay(delay) {
      if (![500, 1500, 3000].includes(delay)) return
      update({ delay }); scheduleNext()
    },
    setScenario(scenario) {
      if (!['normal', 'zone_shift'].includes(scenario)) return
      update({ scenario })
    },
    review(zone) {
      if (!state.session || state.running || state.busy) return Promise.resolve(false)
      const current = state.result.meta.reviewed_zones
      const reviewed = current.includes(zone) ? current.filter((z) => z !== zone) : [...current, zone]
      return request(state.session, reviewed, state.schedule, state.result.meta.as_of)
    },
  }
}

export function simulationMetadata(state) {
  if (!state.session) return null
  return { schema_version: '1.0', synthetic: true, generator: 'live-simulation-v1',
    seed: state.session.seed, steps: state.session.step, scenario_schedule: state.schedule,
    settings: { ...SIMULATION_SETTINGS, as_of: state.result.meta.as_of,
      reviewed_zones: state.result.meta.reviewed_zones },
    timezone: 'America/New_York', clock: 'SIMULATED',
    replay: 'Create the session with this seed, then advance steps 1..steps using the most recent scenario_schedule entry. Analyze the exported CSV with these settings.',
  }
}
