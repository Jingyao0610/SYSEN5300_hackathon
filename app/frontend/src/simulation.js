// Invented completed-response records only. The existing Python API remains the
// sole source of rates, control limits and statistical verdicts.
export const SIMULATION_SETTINGS = Object.freeze({
  selected_priority: 'P1',
  target_minutes: 10,
  baseline_end: '2026-09-21T00:00:00-04:00',
})

export const MAX_STEPS = 40
const BASELINE_ROWS = 4000
const ROWS_PER_STEP = 50
const STEP_MS = 6 * 60 * 60 * 1000
const BASELINE_START = Date.parse('2026-09-01T00:00:00-04:00')
const MONITORING_START = Date.parse(SIMULATION_SETTINGS.baseline_end)
const RANDOM_INCREMENT = 0x6D2B79F5

function validateSeed(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) {
    throw new RangeError('Seed must be an integer from 0 to 4294967295.')
  }
}

// Mulberry32, advanced directly to a draw offset using its additive state.
// Algorithm/JS reference: https://github.com/bryc/code/blob/master/jshash/PRNGs.md#mulberry32
// Four draws per row are consumed regardless of zone/scenario. This couples
// scenario comparisons without changing later random draws. Not cryptographic.
function randomStream(seed, drawOffset = 0) {
  let state = (seed + Math.imul(drawOffset, RANDOM_INCREMENT)) >>> 0
  return () => {
    state = (state + RANDOM_INCREMENT) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

// The bounded September 1–October 1, 2026 simulation is entirely in EDT.
// Format explicitly so the browser's own timezone cannot affect the records.
function timestamp(epochMs) {
  return new Date(epochMs - 4 * 60 * 60 * 1000).toISOString()
    .replace('.000Z', '-04:00').replace('Z', '-04:00')
}

function generateBlock(seed, firstRow, blockStart, step, scenario) {
  const random = randomStream(seed, firstRow * 4)
  const records = []
  for (const zone of ['A', 'B']) {
    for (let i = 0; i < 25; i++) {
      const lateDraw = random()
      // Reserve 30 minutes at the end so every generated response is complete
      // at the observation time, including a maximum-duration late response.
      const dispatch = blockStart + Math.floor(random() * (STEP_MS / 1000 - 1800 + 1)) * 1000
      const onTimeMs = (200 + Math.floor(random() * 800)) * 600
      const lateMs = (1001 + Math.floor(random() * 2000)) * 600
      const lateProbability = scenario === 'zone_shift' && zone === 'A' ? 0.4 : 0.15
      const duration = lateDraw < lateProbability ? lateMs : onTimeMs
      records.push(Object.freeze({
        incident_id: `SYN-LIVE-${seed}-${String(firstRow + records.length + 1).padStart(6, '0')}`,
        zone,
        priority: SIMULATION_SETTINGS.selected_priority,
        dispatched_at: timestamp(dispatch),
        on_scene_at: timestamp(dispatch + duration),
        synthetic: 'true',
        scenario,
        simulation_seed: String(seed),
        simulation_step: String(step),
      }))
    }
  }
  return records
}

function freezeSession(seed, records, step) {
  return Object.freeze({
    seed,
    records: Object.freeze(records),
    step,
    asOf: timestamp(MONITORING_START + step * STEP_MS),
  })
}

/** Create 20 baseline days, each with 100 responses per zone (4,000 total).
 * Seed is an unsigned 32-bit integer, including zero. No seed selection or
 * resampling is performed to obtain a desired chart result.
 */
export function createSimulation(seed = 5300) {
  validateSeed(seed)
  const records = []
  for (let block = 0; block < 20 * 4; block++) {
    records.push(...generateBlock(seed, records.length, BASELINE_START + block * STEP_MS, 0, 'baseline'))
  }
  return freezeSession(seed, records, 0)
}

/** Append one six-hour block without editing previous records. A shifted block
 * raises only zone A's generating late probability from .15 to .40. Its scenario
 * label is retained on both zones so exported rows record the experiment setting.
 * At MAX_STEPS, return the same session unchanged. Invalid input is rejected.
 */
export function advanceSimulation(session, scenario = 'normal') {
  if (!session || typeof session !== 'object') throw new TypeError('A simulation session is required.')
  validateSeed(session.seed)
  if (!Number.isInteger(session.step) || session.step < 0 || session.step > MAX_STEPS
      || !Array.isArray(session.records) || session.records.length !== BASELINE_ROWS + session.step * ROWS_PER_STEP
      || session.asOf !== timestamp(MONITORING_START + session.step * STEP_MS)) {
    throw new TypeError('Invalid simulation session: step, records and observation time must agree.')
  }
  if (scenario !== 'normal' && scenario !== 'zone_shift') {
    throw new RangeError('Scenario must be normal or zone_shift.')
  }
  if (session.step === MAX_STEPS) return session
  const step = session.step + 1
  const appended = generateBlock(session.seed, session.records.length,
    MONITORING_START + session.step * STEP_MS, step, scenario)
  return freezeSession(session.seed, [...session.records, ...appended], step)
}
