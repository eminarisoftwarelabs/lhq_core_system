import { describe, expect, it } from 'vitest'
import { getGreeting } from './greeting'

describe('getGreeting', () => {
  it.each([
    [0, 'Good morning'],
    [6, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [20, 'Good evening'],
    [23, 'Good evening'],
  ])('at hour %i returns "%s"', (hour, expected) => {
    const date = new Date(2026, 0, 1, hour, 30)
    expect(getGreeting(date)).toBe(expected)
  })

  it('defaults to the current time when no date is passed', () => {
    expect(typeof getGreeting()).toBe('string')
  })
})
