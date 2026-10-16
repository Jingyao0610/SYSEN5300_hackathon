import { describe, expect, it } from 'vitest'
import { nyLocalToIso, nyMidnightIso, showNy } from './time.js'

describe('showNy', () => {
  it('shows offset timestamps in New York time', () => {
    expect(showNy('2026-09-21T12:15:00Z')).toMatch(/Sep 21, 2026.*08:15 EDT/)
    expect(showNy('2026-09-21T08:15:00-04:00')).toMatch(/08:15 EDT/)
  })

  it('does not guess a zone for text without an offset', () => {
    expect(showNy('2026-09-01T10:00:00')).toBe('2026-09-01T10:00:00 (no offset)')
    expect(showNy('')).toBe('—')
  })
})

describe('New York timestamps for requests', () => {
  it('builds the demo baseline_end and as_of (EDT, -04:00)', () => {
    expect(nyMidnightIso('2026-09-21')).toBe('2026-09-21T00:00:00-04:00')
    expect(nyLocalToIso('2026-10-01T00:00')).toBe('2026-10-01T00:00:00-04:00')
  })

  it('uses -05:00 in winter (EST)', () => {
    expect(nyMidnightIso('2026-12-01')).toBe('2026-12-01T00:00:00-05:00')
  })

  it('gets midnight right on both DST change days (change happens at 02:00)', () => {
    expect(nyMidnightIso('2026-03-08')).toBe('2026-03-08T00:00:00-05:00')
    expect(nyMidnightIso('2026-11-01')).toBe('2026-11-01T00:00:00-04:00')
    expect(nyLocalToIso('2026-03-08T12:00')).toBe('2026-03-08T12:00:00-04:00')
    expect(nyLocalToIso('2026-11-01T12:00')).toBe('2026-11-01T12:00:00-05:00')
  })

  it('keeps seconds and rejects junk', () => {
    expect(nyLocalToIso('2026-09-01T09:10:01')).toBe('2026-09-01T09:10:01-04:00')
    expect(() => nyLocalToIso('yesterday')).toThrow()
  })
})
