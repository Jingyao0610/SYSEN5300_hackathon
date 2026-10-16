import { describe, expect, it } from 'vitest'
import { COLUMNS, parseIncidents, toCsv } from './csv.js'
import { advanceSimulation, createSimulation, MAX_STEPS, SIMULATION_SETTINGS } from './simulation.js'

const durationMs = (row) => Date.parse(row.on_scene_at) - Date.parse(row.dispatched_at)
const incidentFields = (row) => Object.fromEntries(COLUMNS.map((key) => [key, row[key]]))
const run = (seed, scenarios) => scenarios.reduce((session, scenario) => advanceSimulation(session, scenario), createSimulation(seed))

describe('synthetic simulation generation', () => {
  it('initializes exactly 20 baseline days with 100 P1 responses per zone per day', () => {
    const session = createSimulation()
    expect(SIMULATION_SETTINGS).toEqual({
      selected_priority: 'P1', target_minutes: 10, baseline_end: '2026-09-21T00:00:00-04:00',
    })
    expect(session.seed).toBe(5300)
    expect(session.step).toBe(0)
    expect(session.asOf).toBe(SIMULATION_SETTINGS.baseline_end)
    expect(session.records).toHaveLength(4000)
    const counts = new Map()
    for (const row of session.records) {
      const key = `${row.dispatched_at.slice(0, 10)}-${row.zone}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      expect(row.priority).toBe('P1')
      expect(row.scenario).toBe('baseline')
      expect(row.simulation_step).toBe('0')
      expect(Date.parse(row.dispatched_at)).toBeLessThan(Date.parse(SIMULATION_SETTINGS.baseline_end))
      expect(Date.parse(row.on_scene_at)).toBeLessThanOrEqual(Date.parse(session.asOf))
    }
    expect(counts.size).toBe(40)
    expect([...counts.values()]).toEqual(Array(40).fill(100))
    for (let day = 1; day <= 20; day++) {
      for (const zone of ['A', 'B']) expect(counts.get(`2026-09-${String(day).padStart(2, '0')}-${zone}`)).toBe(100)
    }
  })

  it('accepts both unsigned seed boundaries and rejects coercion or invalid seeds', () => {
    for (const seed of [0, 0xFFFFFFFF]) expect(createSimulation(seed).seed).toBe(seed)
    for (const seed of [-1, 4294967296, 1.5, NaN, Infinity, '5300', null, true]) {
      expect(() => createSimulation(seed)).toThrow(/Seed/)
    }
  })

  it('reproduces a mixed schedule exactly and varies records for a different seed', () => {
    const schedule = ['normal', 'zone_shift', 'zone_shift', 'normal', 'zone_shift']
    expect(run(0, schedule)).toEqual(run(0, schedule))
    expect(run(5300, schedule)).toEqual(run(5300, schedule))
    expect(run(0, schedule).records).not.toEqual(run(1, schedule).records)
  })

  it('appends 25 records per zone, advances six hours, and preserves immutable prefixes', () => {
    const initial = createSimulation()
    const before = JSON.stringify(initial)
    const next = advanceSimulation(initial)
    expect(next).not.toBe(initial)
    expect(next.records).not.toBe(initial.records)
    expect(next.step).toBe(1)
    expect(next.asOf).toBe('2026-09-21T06:00:00-04:00')
    expect(next.records).toHaveLength(4050)
    expect(next.records.slice(0, 4000)).toEqual(initial.records)
    expect(JSON.stringify(initial)).toBe(before)
    expect(Object.isFrozen(initial)).toBe(true)
    expect(Object.isFrozen(next.records)).toBe(true)
    expect(Object.isFrozen(next.records[0])).toBe(true)
    expect(() => { next.records[0].zone = 'OTHER' }).toThrow()
    const appended = next.records.slice(4000)
    for (const zone of ['A', 'B']) expect(appended.filter((row) => row.zone === zone)).toHaveLength(25)
    for (const row of appended) {
      expect(Date.parse(row.dispatched_at)).toBeGreaterThanOrEqual(Date.parse(initial.asOf))
      expect(Date.parse(row.on_scene_at)).toBeLessThanOrEqual(Date.parse(next.asOf))
    }
  })

  it('changes only future A timings on a scenario switch without consuming different random draws', () => {
    const prefix = run(5300, ['normal', 'normal'])
    const normal = advanceSimulation(prefix, 'normal')
    const shifted = advanceSimulation(prefix, 'zone_shift')
    expect(shifted.records.slice(0, prefix.records.length)).toEqual(prefix.records)
    const normalNew = normal.records.slice(prefix.records.length)
    const shiftedNew = shifted.records.slice(prefix.records.length)
    expect(shiftedNew.filter((row) => row.zone === 'B').map(incidentFields))
      .toEqual(normalNew.filter((row) => row.zone === 'B').map(incidentFields))
    const aNormal = normalNew.filter((row) => row.zone === 'A')
    const aShifted = shiftedNew.filter((row) => row.zone === 'A')
    expect(aShifted.some((row, i) => durationMs(row) > durationMs(aNormal[i]))).toBe(true)
    for (let i = 0; i < aNormal.length; i++) {
      expect(aShifted[i].incident_id).toBe(aNormal[i].incident_id)
      expect(aShifted[i].dispatched_at).toBe(aNormal[i].dispatched_at)
      expect(durationMs(aShifted[i])).toBeGreaterThanOrEqual(durationMs(aNormal[i]))
    }
    // Returning to normal produces the same next physical records, even after
    // histories with different scenarios. History itself is never rewritten.
    expect(advanceSimulation(shifted).records.slice(-50).map(incidentFields))
      .toEqual(advanceSimulation(normal).records.slice(-50).map(incidentFields))
  })

  it('caps at 40 steps and 6000 records, with unique offset-aware completed responses', () => {
    let session = createSimulation(0xFFFFFFFF)
    const baseline = session.records
    for (let step = 1; step <= MAX_STEPS; step++) {
      session = advanceSimulation(session, step % 2 ? 'zone_shift' : 'normal')
      expect(session.records).toHaveLength(4000 + step * 50)
      for (const row of session.records.slice(-50)) {
        expect(Date.parse(row.on_scene_at)).toBeLessThanOrEqual(Date.parse(session.asOf))
      }
    }
    expect(session.asOf).toBe('2026-10-01T00:00:00-04:00')
    expect(session.records.slice(0, 4000)).toEqual(baseline)
    expect(advanceSimulation(session)).toBe(session)
    expect(advanceSimulation(session, 'zone_shift')).toBe(session)
    expect(new Set(session.records.map((row) => row.incident_id)).size).toBe(6000)
    for (const row of session.records) {
      expect(row.incident_id).toMatch(/^SYN-LIVE-/)
      expect(row.synthetic).toBe('true')
      expect(row.simulation_seed).toBe('4294967295')
      expect(row.dispatched_at).toMatch(/-04:00$/)
      expect(row.on_scene_at).toMatch(/-04:00$/)
      const elapsed = durationMs(row)
      expect((elapsed >= 120000 && elapsed <= 599400) || (elapsed >= 600600 && elapsed <= 1800000)).toBe(true)
    }
  })

  it('retains synthetic provenance and scenario transitions through CSV export/import', () => {
    const session = run(42, ['normal', 'zone_shift', 'normal'])
    expect(parseIncidents(toCsv(session.records))).toEqual(session.records)
    expect(session.records[4000]).toMatchObject({ synthetic: 'true', scenario: 'normal', simulation_seed: '42', simulation_step: '1' })
    expect(session.records[4050]).toMatchObject({ scenario: 'zone_shift', simulation_step: '2' })
    expect(session.records[4100]).toMatchObject({ scenario: 'normal', simulation_step: '3' })
  })

  it('rejects unknown scenarios and inconsistent session boundaries', () => {
    const session = createSimulation()
    expect(() => advanceSimulation(session, 'unknown')).toThrow(/Scenario/)
    for (const bad of [null, {}, { ...session, step: -1 }, { ...session, step: 41 },
      { ...session, step: 0.5 }, { ...session, records: [] }, { ...session, asOf: 'invalid' }]) {
      expect(() => advanceSimulation(bad)).toThrow()
    }
  })
})
