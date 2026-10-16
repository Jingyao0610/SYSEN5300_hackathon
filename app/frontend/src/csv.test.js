import { describe, expect, it } from 'vitest'
import { COLUMNS, parseIncidents, parseRows, toCsv } from './csv.js'

const HEADER = COLUMNS.join(',')

describe('parseIncidents', () => {
  it('reads the five columns as text, in any column order, ignoring extras', () => {
    const text = 'zone,incident_id,note,priority,on_scene_at,dispatched_at\r\n' +
      'A,X-1,hi,P1,2026-09-01T09:10:00-04:00,2026-09-01T09:00:00-04:00\r\n'
    expect(parseIncidents(text)).toEqual([{
      incident_id: 'X-1', zone: 'A', priority: 'P1',
      dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '2026-09-01T09:10:00-04:00',
    }])
  })

  it('keeps blank and malformed cells for the server to exclude (no client-side dropping)', () => {
    const rows = parseIncidents(`${HEADER}\nX-1,A,P1,2026-09-01T09:00:00-04:00,\nX-2,A,P1,not a time,2026-09-01T09:10:00-04:00\n`)
    expect(rows).toHaveLength(2)
    expect(rows[0].on_scene_at).toBe('')
    expect(rows[1].dispatched_at).toBe('not a time')
  })

  it('rejects a file missing a required column', () => {
    expect(() => parseIncidents('incident_id,zone,priority,dispatched_at\nX,A,P1,t\n')).toThrow(/on_scene_at/)
  })

  it('rejects an empty file and strips a UTF-8 BOM', () => {
    expect(() => parseIncidents('')).toThrow(/empty/)
    expect(parseIncidents(`﻿${HEADER}\n`)).toEqual([])
  })
})

describe('parseRows / toCsv', () => {
  it('handles quoted commas, quotes and newlines', () => {
    expect(parseRows('a,"b,c","d ""q""","e\nf"\n')).toEqual([['a', 'b,c', 'd "q"', 'e\nf']])
  })

  it('round-trips records through export and import', () => {
    const recs = [
      { incident_id: 'X,1', zone: 'A "north"', priority: 'P1', dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '' },
      { incident_id: 'X-2', zone: 'B', priority: 'P2', dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '2026-09-01T09:10:01-04:00' },
    ]
    expect(parseIncidents(toCsv(recs))).toEqual(recs)
  })
})
