import { describe, expect, it } from 'vitest'
import {
  addWeeks,
  dateInWeek,
  formatDayMonth,
  formatWeekRange,
  parseWeekParam,
  relativeWeekLabel,
  weekStartOf,
} from './weeks'

const d = (y, m, day) => new Date(y, m - 1, day)

describe('weekStartOf', () => {
  it('returns the Monday of the week, Sunday belonging to the week before', () => {
    expect(weekStartOf(d(2026, 10, 5))).toBe('2026-10-05') // Monday itself
    expect(weekStartOf(d(2026, 10, 9))).toBe('2026-10-05') // Friday
    expect(weekStartOf(d(2026, 10, 10))).toBe('2026-10-05') // Saturday
    expect(weekStartOf(d(2026, 10, 11))).toBe('2026-10-05') // Sunday
  })

  it('crosses month and year boundaries', () => {
    expect(weekStartOf(d(2026, 10, 1))).toBe('2026-09-28')
    expect(weekStartOf(d(2026, 1, 1))).toBe('2025-12-29')
  })
})

describe('addWeeks / dateInWeek', () => {
  it('moves by whole weeks across months and years', () => {
    expect(addWeeks('2026-09-28', 1)).toBe('2026-10-05')
    expect(addWeeks('2026-10-05', -1)).toBe('2026-09-28')
    expect(addWeeks('2025-12-29', 1)).toBe('2026-01-05')
  })

  it('gives the date of each weekday', () => {
    expect(formatDayMonth(dateInWeek('2026-09-28', 0))).toBe('28 Sept')
    expect(formatDayMonth(dateInWeek('2026-09-28', 4))).toBe('2 Oct')
  })
})

describe('parseWeekParam', () => {
  it('accepts only a real Monday', () => {
    expect(parseWeekParam('2026-10-05')).toBe('2026-10-05')
    expect(parseWeekParam('2026-10-06')).toBeNull() // Tuesday
    expect(parseWeekParam('2026-02-30')).toBeNull() // no such day
    expect(parseWeekParam('next')).toBeNull()
    expect(parseWeekParam(null)).toBeNull()
  })
})

describe('formatWeekRange', () => {
  it('shortens a week inside one month', () => {
    expect(formatWeekRange('2026-10-05')).toBe('5 – 9 Oct 2026')
  })

  it('names both months when the week spans two', () => {
    expect(formatWeekRange('2026-09-28')).toBe('28 Sept – 2 Oct 2026')
  })

  it('names both years when the week spans New Year', () => {
    expect(formatWeekRange('2025-12-29')).toBe('29 Dec 2025 – 2 Jan 2026')
  })
})

describe('relativeWeekLabel', () => {
  const today = d(2026, 10, 7) // Wednesday
  it('labels this, next, and last week, and nothing further out', () => {
    expect(relativeWeekLabel('2026-10-05', today)).toBe('This week')
    expect(relativeWeekLabel('2026-10-12', today)).toBe('Next week')
    expect(relativeWeekLabel('2026-09-28', today)).toBe('Last week')
    expect(relativeWeekLabel('2026-10-19', today)).toBeNull()
  })

  it('is not thrown off by a daylight-saving change inside the gap', () => {
    // 29 Mar 2026 is a DST switch in Europe; the week math must still land on whole weeks.
    expect(relativeWeekLabel('2026-03-30', d(2026, 3, 25))).toBe('Next week')
  })
})
