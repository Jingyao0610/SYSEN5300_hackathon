// Guards the page against drift from docs/interfaces.md v1.0: every status and
// reason code the real core returns must have a label here, and the fields the
// views read must exist. Uses H-03's hand-checked example plus the fixtures
// generated from app/qc.py.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { REASONS, STATUS } from './status.js'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const small = read('../../../tests/fixtures/qc/small_expected.json')
const generated = ['demo', 'small', 'empty'].flatMap((s) => Object.values(read(`./mock/${s}.responses.json`)))
const all = [small, ...generated]

describe('v1.0 response coverage', () => {
  it('labels every point status and reason code the core returns', () => {
    for (const r of all) {
      for (const p of r.daily_points) {
        expect(STATUS, p.status).toHaveProperty(p.status)
        for (const c of p.reasons) expect(REASONS, c).toHaveProperty(c)
      }
      for (const b of r.zone_baselines) for (const c of b.reasons) expect(REASONS, c).toHaveProperty(c)
      for (const e of r.excluded_records) for (const c of e.reasons) expect(REASONS, c).toHaveProperty(c)
      for (const c of r.quality.reasons) expect(REASONS, c).toHaveProperty(c)
    }
  })

  it('has the fields the views read', () => {
    for (const r of all) {
      expect(Object.keys(r).sort()).toEqual(
        ['daily_points', 'excluded_records', 'late_incidents', 'meta', 'quality', 'signals', 'zone_baselines'])
      for (const k of ['overall', 'selected_priority']) {
        expect(Object.keys(r.quality[k]).sort()).toEqual(['excluded_rows', 'total_rows', 'usable_fraction', 'usable_rows'])
      }
      for (const b of r.zone_baselines) {
        expect(b).toMatchObject({ nonempty_days: expect.any(Number), daily: expect.any(Array) })
        expect(b.weekday.map((w) => w.label)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
      }
      for (const e of r.excluded_records) expect(e.row_number).toBeGreaterThan(0)
      for (const s of r.signals) expect(['high', 'low']).toContain(s.status)
    }
  })

  it('the generated demo shows the K1 and K3 answers the core must give', () => {
    const r = read('./mock/demo.responses.json')['A,B']
    const point = (zone, date) => r.daily_points.find((p) => p.zone === zone && p.date === date)
    expect(point('A', '2026-09-23')).toMatchObject({ n: 100, late: 19, status: 'no_signal' })
    expect(point('A', '2026-09-24')).toMatchObject({ n: 100, late: 20, status: 'high' })
    expect(point('A', '2026-09-26')).toMatchObject({ n: 100, late: 0, status: 'low' })
    expect(point('A', '2026-09-24').upper).toBeCloseTo(0.19, 12)
    expect(point('A', '2026-09-24').lower).toBeCloseTo(0.01, 12)
    expect(point('B', '2026-09-21')).toMatchObject({ n: 400, late: 21, status: 'low' })
    expect(point('B', '2026-09-24')).toMatchObject({ n: 400, late: 59, status: 'high' })
    expect(point('B', '2026-09-24').lower).toBeCloseTo(0.055, 12)
    expect(point('B', '2026-09-24').upper).toBeCloseTo(0.145, 12)
    expect(point('A', '2026-09-28')).toMatchObject({ n: 49, status: 'insufficient_data', lower: null, upper: null })
    expect(point('A', '2026-09-30').status).toBe('provisional_current_day')
    // without review, nothing is a formal verdict
    const unreviewed = read('./mock/demo.responses.json')['']
    expect(unreviewed.signals).toEqual([])
  })
})
