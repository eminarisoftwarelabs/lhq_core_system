import { describe, expect, it } from 'vitest'
import { formatDateTime, formatShortDate, isWithinDays, parseDateOnly } from './dateWindow'

describe('isWithinDays', () => {
  const now = new Date('2026-01-31T00:00:00Z')

  it('returns false for a null date', () => {
    expect(isWithinDays(null, 30, now)).toBe(false)
  })

  it('returns true for a date exactly on the boundary', () => {
    expect(isWithinDays(new Date('2026-01-01T00:00:00Z'), 30, now)).toBe(true)
  })

  it('returns false for a date just past the boundary', () => {
    expect(isWithinDays(new Date('2025-12-31T23:59:00Z'), 30, now)).toBe(false)
  })

  it('returns true for a date in the future', () => {
    expect(isWithinDays(new Date('2026-02-15T00:00:00Z'), 30, now)).toBe(true)
  })

  it('defaults `now` to the current time when not passed', () => {
    expect(isWithinDays(new Date(), 30)).toBe(true)
  })
})

describe('formatShortDate', () => {
  it('formats a date as "Mon D, YYYY"', () => {
    expect(formatShortDate(new Date('2026-08-24T12:00:00Z'))).toBe('Aug 24, 2026')
  })
})

describe('formatDateTime', () => {
  it('formats a datetime with month, day and time', () => {
    const result = formatDateTime(new Date('2026-09-17T14:30:00'))
    expect(result).toMatch(/Sep 17/)
    expect(result).toMatch(/2:30/)
  })
})

describe('parseDateOnly', () => {
  it('formats to the same calendar date regardless of the runner timezone', () => {
    // The classic bug: new Date('2026-09-24') is UTC midnight, which
    // display-formats as Sep 23 in any timezone behind UTC. This must not.
    expect(formatShortDate(parseDateOnly('2026-09-24'))).toBe('Sep 24, 2026')
  })

  it('handles the first of the month correctly', () => {
    expect(formatShortDate(parseDateOnly('2026-01-01'))).toBe('Jan 1, 2026')
  })
})
