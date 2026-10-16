import { describe, expect, it } from 'vitest'
import { COLUMNS, parseIncidents, parseRows, toCsv } from './csv.js'

const HEADER = COLUMNS.join(',')

describe('parseIncidents', () => {
  it('reads the five columns as text, in any column order, and keeps extra columns unchanged', () => {
    const text = 'zone,incident_id,note,priority,on_scene_at,dispatched_at\r\n' +
      ' A ,X-1, hi ,P1,2026-09-01T09:10:00-04:00,2026-09-01T09:00:00-04:00\r\n'
    expect(parseIncidents(text)).toEqual([{
      incident_id: 'X-1', zone: 'A', priority: 'P1',
      dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '2026-09-01T09:10:00-04:00',
      note: ' hi ',
    }])
  })

  it('fills a short row with empty cells and keeps the first of a repeated header', () => {
    const rows = parseIncidents(`${HEADER},crew,crew\nX-1,A,P1,2026-09-01T09:00:00-04:00\n`)
    expect(rows[0]).toEqual({
      incident_id: 'X-1', zone: 'A', priority: 'P1', dispatched_at: '2026-09-01T09:00:00-04:00', on_scene_at: '', crew: '',
    })
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

  it('exports extra columns after the five required ones, blank for records without them', () => {
    const imported = parseIncidents(`station,${HEADER},"crew, lead"\nN1,X-1,A,P1,2026-09-01T09:00:00-04:00,2026-09-01T09:10:00-04:00,"Lee, ""J"""\n`)
    const manual = { incident_id: 'X-2', zone: 'B', priority: 'P1', dispatched_at: '2026-09-01T10:00:00-04:00', on_scene_at: '2026-09-01T10:05:00-04:00' }
    const out = toCsv([...imported, manual])
    expect(out.split('\n')[0]).toBe(`${HEADER},station,"crew, lead"`)
    expect(out.split('\n')[2]).toBe('X-2,B,P1,2026-09-01T10:00:00-04:00,2026-09-01T10:05:00-04:00,,')
    const back = parseIncidents(out)
    expect(back[0]).toEqual(imported[0])
    expect(back[0]['crew, lead']).toBe('Lee, "J"')
  })
})
