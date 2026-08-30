import { describe, expect, it } from 'vitest'
import { dayLabel, formatMoney, formatTime } from './constants'

describe('dayLabel', () => {
  it('maps 0-6 to Monday-Sunday', () => {
    expect(dayLabel(0)).toBe('Monday')
    expect(dayLabel(6)).toBe('Sunday')
  })

  it('returns a placeholder for null/undefined', () => {
    expect(dayLabel(null)).toBe('—')
    expect(dayLabel(undefined)).toBe('—')
  })
})

describe('formatTime', () => {
  it('truncates seconds off an HH:MM:SS value', () => {
    expect(formatTime('14:30:00')).toBe('14:30')
  })

  it('returns empty string for falsy input', () => {
    expect(formatTime(null)).toBe('')
    expect(formatTime('')).toBe('')
  })
})

describe('formatMoney', () => {
  it('formats a numeric string to two decimal places with a $ prefix', () => {
    expect(formatMoney('100')).toBe('$100.00')
    expect(formatMoney('99.5')).toBe('$99.50')
  })

  it('returns a placeholder for null/undefined', () => {
    expect(formatMoney(null)).toBe('—')
    expect(formatMoney(undefined)).toBe('—')
  })
})
