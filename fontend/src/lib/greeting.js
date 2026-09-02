// Time-based greeting for the dashboard header. Takes the date to bucket
// rather than reading the clock itself, so callers (and tests) can pass a
// fixed date instead of mocking global time.
export function getGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
