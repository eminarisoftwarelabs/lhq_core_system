import { describe, expect, it } from 'vitest'
import {
  describeInvoiceRange,
  invoicePeriodParams,
  invoicePeriodRange,
  isInvertedCustomRange,
  isInvoicePeriod,
} from './invoicePeriods'

// Local-time constructor on purpose: the ranges are defined in the viewer's
// timezone, so assertions compare local calendar dates, not UTC strings.
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min)
const ymd = (date) => (date ? [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours()] : null)

function range(period, now, extra = {}) {
  const r = invoicePeriodRange(period, { now, ...extra })
  return r && { from: ymd(r.from), to: ymd(r.to) }
}

describe('invoicePeriodRange', () => {
  const now = at(2026, 9, 26, 15, 45)

  it('all time is no filter', () => {
    expect(invoicePeriodRange('all', { now })).toBeNull()
    expect(invoicePeriodRange('nonsense', { now })).toBeNull()
  })

  it('this month runs from the 1st to the 1st of next month, at midnight', () => {
    expect(range('this_month', now)).toEqual({ from: [2026, 9, 1, 0], to: [2026, 10, 1, 0] })
  })

  it('this month in December ends on January 1st of the next year', () => {
    expect(range('this_month', at(2026, 12, 10))).toEqual({ from: [2026, 12, 1, 0], to: [2027, 1, 1, 0] })
  })

  it('last month is the whole previous calendar month', () => {
    expect(range('last_month', now)).toEqual({ from: [2026, 8, 1, 0], to: [2026, 9, 1, 0] })
  })

  it('last month in January is December of the previous year', () => {
    expect(range('last_month', at(2026, 1, 15))).toEqual({ from: [2025, 12, 1, 0], to: [2026, 1, 1, 0] })
  })

  it('last 30 days includes today: 29 days back through tomorrow midnight', () => {
    expect(range('last_30_days', now)).toEqual({ from: [2026, 8, 28, 0], to: [2026, 9, 27, 0] })
  })

  it('last 3 months clamps month-end days instead of rolling over', () => {
    expect(range('last_3_months', at(2026, 5, 31))).toEqual({ from: [2026, 2, 28, 0], to: [2026, 6, 1, 0] })
    expect(range('last_3_months', at(2028, 5, 31))).toEqual({ from: [2028, 2, 29, 0], to: [2028, 6, 1, 0] })
  })

  it('last 12 months goes back a year to the same day', () => {
    expect(range('last_12_months', now)).toEqual({ from: [2025, 9, 26, 0], to: [2026, 9, 27, 0] })
    expect(range('last_12_months', at(2028, 2, 29))).toEqual({ from: [2027, 2, 28, 0], to: [2028, 3, 1, 0] })
  })

  it('custom range is inclusive of the end date', () => {
    expect(range('custom', now, { customFrom: '2026-08-10', customTo: '2026-08-20' })).toEqual({
      from: [2026, 8, 10, 0],
      to: [2026, 8, 21, 0],
    })
  })

  it('custom range can be open-ended on either side, and empty means no filter', () => {
    expect(range('custom', now, { customFrom: '2026-08-10' })).toEqual({ from: [2026, 8, 10, 0], to: null })
    expect(range('custom', now, { customTo: '2026-08-20' })).toEqual({ from: null, to: [2026, 8, 21, 0] })
    expect(invoicePeriodRange('custom', { now })).toBeNull()
  })
})

describe('invoicePeriodParams', () => {
  it('sends ISO timestamps of the local midnights, omitting open ends', () => {
    const from = at(2026, 8, 1)
    const to = at(2026, 9, 1)
    expect(invoicePeriodParams({ from, to })).toEqual({
      issued_from: from.toISOString(),
      issued_to: to.toISOString(),
    })
    expect(invoicePeriodParams({ from, to: null })).toEqual({ issued_from: from.toISOString() })
    expect(invoicePeriodParams(null)).toEqual({})
  })
})

describe('describeInvoiceRange', () => {
  it('shows the inclusive last day, not the exclusive bound', () => {
    expect(describeInvoiceRange({ from: at(2026, 8, 1), to: at(2026, 9, 1) })).toBe('Aug 1, 2026 – Aug 31, 2026')
  })

  it('collapses a single day and labels open ends', () => {
    expect(describeInvoiceRange({ from: at(2026, 8, 5), to: at(2026, 8, 6) })).toBe('Aug 5, 2026')
    expect(describeInvoiceRange({ from: at(2026, 8, 5), to: null })).toBe('From Aug 5, 2026')
    expect(describeInvoiceRange({ from: null, to: at(2026, 8, 6) })).toBe('Up to Aug 5, 2026')
    expect(describeInvoiceRange(null)).toBeNull()
  })
})

describe('guards', () => {
  it('recognises known periods only', () => {
    expect(isInvoicePeriod('this_month')).toBe(true)
    expect(isInvoicePeriod('yesterday')).toBe(false)
  })

  it('flags an end date before the start date', () => {
    expect(isInvertedCustomRange('2026-08-20', '2026-08-10')).toBe(true)
    expect(isInvertedCustomRange('2026-08-10', '2026-08-10')).toBe(false)
    expect(isInvertedCustomRange('2026-08-10', '')).toBe(false)
  })
})
