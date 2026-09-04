export function isWithinDays(date, days, now = new Date()) {
  if (!date) return false
  const ms = days * 24 * 60 * 60 * 1000
  return now.getTime() - date.getTime() <= ms
}

export function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(date) {
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// A bare 'YYYY-MM-DD' string (a DRF DateField, e.g. an invoice due_date) has
// no timezone of its own - new Date(dateString) parses it as UTC midnight,
// which display-formats as the wrong day for any viewer west of UTC.
// Building the Date from local year/month/day components instead pins it
// to that calendar date regardless of the viewer's timezone.
export function parseDateOnly(dateString) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}
