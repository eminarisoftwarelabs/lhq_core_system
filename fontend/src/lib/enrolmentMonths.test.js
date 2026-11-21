import { describe, expect, it } from 'vitest'
import { defaultOpenMonths, fetchAllPages, groupByEnrolmentMonth, monthLabel } from './enrolmentMonths'

const s = (id, name, enrolled_on) => ({ id, full_name: name, enrolled_on })

describe('groupByEnrolmentMonth', () => {
  it('groups by enrolment month, newest month first, only months with students', () => {
    const groups = groupByEnrolmentMonth([
      s(1, 'Ann', '2026-09-03'),
      s(2, 'Bob', '2026-11-02'),
      s(3, 'Cara', '2026-11-30'),
      s(4, 'Dan', '2026-01-31'),
    ])
    expect(groups.map((g) => g.label)).toEqual(['November 2026', 'September 2026', 'January 2026'])
    expect(groups[0].students.map((x) => x.full_name)).toEqual(['Bob', 'Cara'])
  })

  it('keeps the order rows arrive in within a month', () => {
    const groups = groupByEnrolmentMonth([s(1, 'Zed', '2026-11-20'), s(2, 'Amy', '2026-11-02')])
    expect(groups[0].students.map((x) => x.full_name)).toEqual(['Zed', 'Amy'])
  })

  it('sorts across a year boundary', () => {
    const groups = groupByEnrolmentMonth([s(1, 'A', '2025-12-31'), s(2, 'B', '2026-01-01')])
    expect(groups.map((g) => g.key)).toEqual(['2026-01', '2025-12'])
  })

  it('does not shift months with the timezone: the first and last of a month stay in it', () => {
    const groups = groupByEnrolmentMonth([s(1, 'A', '2026-10-01'), s(2, 'B', '2026-10-31')])
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('October 2026')
  })

  it('skips a student with no enrolment date rather than inventing a month', () => {
    expect(groupByEnrolmentMonth([s(1, 'A', null)])).toEqual([])
    expect(groupByEnrolmentMonth([])).toEqual([])
  })

  it('labels a month in words', () => {
    expect(monthLabel('2026-02')).toBe('February 2026')
  })
})

describe('fetchAllPages', () => {
  it('walks every page and joins the rows in order', async () => {
    const pages = {
      1: { results: [1, 2], next: 'x' },
      2: { results: [3], next: 'y' },
      3: { results: [4], next: null },
    }
    const calls = []
    const rows = await fetchAllPages((n) => {
      calls.push(n)
      return Promise.resolve(pages[n])
    })
    expect(rows).toEqual([1, 2, 3, 4])
    expect(calls).toEqual([1, 2, 3])
  })

  it('stops after one page when there is no next', async () => {
    const rows = await fetchAllPages(() => Promise.resolve({ results: [1], next: null }))
    expect(rows).toEqual([1])
  })
})

describe('defaultOpenMonths', () => {
  const g = (...keys) => keys.map((key) => ({ key }))
  const today = new Date(2026, 0, 15) // January: last month is in the previous year

  it('opens this month and last month, across a year boundary', () => {
    expect([...defaultOpenMonths(g('2026-01', '2025-12', '2025-11'), today)]).toEqual(['2026-01', '2025-12'])
  })

  it('opens everything when there are one or two months', () => {
    expect([...defaultOpenMonths(g('2025-03', '2025-02'), today)]).toEqual(['2025-03', '2025-02'])
  })

  it('keeps the newest month open when none are recent', () => {
    expect([...defaultOpenMonths(g('2025-06', '2025-05', '2025-04'), today)]).toEqual(['2025-06'])
  })
})
