import { formatShortDate, parseDateOnly } from './dateWindow'

// Issue-date windows for the Invoices list. Every range is a half-open
// [from, to) pair of *local* midnights, sent to the API as ISO timestamps
// (issued_from inclusive, issued_to exclusive) - so "This month" means this
// calendar month in the viewer's own timezone, not the server's UTC day
// boundaries, and there's no off-by-one at either edge.
export const INVOICE_PERIODS = [
  { value: 'all', label: 'All time' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_30_days', label: 'Last 30 days' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_12_months', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom range' },
]

const PERIOD_VALUES = new Set(INVOICE_PERIODS.map((p) => p.value))

export function isInvoicePeriod(value) {
  return PERIOD_VALUES.has(value)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

// Same day-of-month `months` earlier/later, clamped to the target month's
// last day - plain `new Date(y, m - 3, 31)` would roll May 31 over into
// March 3 instead of landing on Feb 28/29.
function addMonthsClamped(date, months) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay))
}

/**
 * Resolve a period to local-midnight bounds, or null for "no filter".
 * Rolling windows ("Last 30 days") include today, so they end at tomorrow's
 * midnight. `custom` takes inclusive 'YYYY-MM-DD' start/end dates from the
 * pickers; either side may be blank for an open-ended range.
 */
export function invoicePeriodRange(period, { now = new Date(), customFrom = '', customTo = '' } = {}) {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  switch (period) {
    case 'this_month':
      return { from: monthStart, to: new Date(today.getFullYear(), today.getMonth() + 1, 1) }
    case 'last_month':
      return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: monthStart }
    case 'last_30_days':
      return { from: addDays(today, -29), to: tomorrow }
    case 'last_3_months':
      return { from: addMonthsClamped(today, -3), to: tomorrow }
    case 'last_12_months':
      return { from: addMonthsClamped(today, -12), to: tomorrow }
    case 'custom': {
      const from = customFrom ? parseDateOnly(customFrom) : null
      const to = customTo ? addDays(parseDateOnly(customTo), 1) : null
      return from || to ? { from, to } : null
    }
    default:
      return null
  }
}

/** API query params for a resolved range (omits open ends). */
export function invoicePeriodParams(range) {
  if (!range) return {}
  const params = {}
  if (range.from) params.issued_from = range.from.toISOString()
  if (range.to) params.issued_to = range.to.toISOString()
  return params
}

/** Human summary of a range, e.g. "Aug 1, 2026 – Aug 31, 2026". */
export function describeInvoiceRange(range) {
  if (!range) return null
  const from = range.from ? formatShortDate(range.from) : null
  const to = range.to ? formatShortDate(addDays(range.to, -1)) : null
  if (from && to) return from === to ? from : `${from} – ${to}`
  if (from) return `From ${from}`
  return `Up to ${to}`
}

/** A custom range whose end is before its start - nothing to ask for. */
export function isInvertedCustomRange(customFrom, customTo) {
  return Boolean(customFrom && customTo && customFrom > customTo)
}
