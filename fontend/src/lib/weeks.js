import { parseDateOnly, toDateOnlyString } from './dateWindow'

// Calendar weeks for the Timetable's lesson plans. A week is identified by
// its Monday as a bare 'YYYY-MM-DD' string - the same key the backend's
// LessonPlan.week_start uses - built from local calendar dates so it never
// shifts by a day across timezones (see dateWindow.parseDateOnly).

/** The Monday on or before `date`, as 'YYYY-MM-DD'. */
export function weekStartOf(date) {
  const offset = (date.getDay() + 6) % 7 // days since Monday
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset))
}

export function addWeeks(weekStart, weeks) {
  const monday = parseDateOnly(weekStart)
  return toDateOnlyString(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + weeks * 7))
}

/** The calendar date of weekday `day` (0=Monday) in that week. */
export function dateInWeek(weekStart, day) {
  const monday = parseDateOnly(weekStart)
  return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + day)
}

/** A '?week=' value, accepted only if it's a real Monday. */
export function parseWeekParam(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = parseDateOnly(value)
  if (Number.isNaN(date.getTime()) || toDateOnlyString(date) !== value) return null
  return date.getDay() === 1 ? value : null
}

const dayMonth = (date) => date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** "5 Oct" */
export function formatDayMonth(date) {
  return dayMonth(date)
}

/** "5 – 9 Oct 2026", "28 Sep – 2 Oct 2026", "29 Dec 2025 – 2 Jan 2026" (Mon-Fri). */
export function formatWeekRange(weekStart) {
  const monday = dateInWeek(weekStart, 0)
  const friday = dateInWeek(weekStart, 4)
  const year = friday.getFullYear()
  if (monday.getFullYear() !== year) return `${dayMonth(monday)} ${monday.getFullYear()} – ${dayMonth(friday)} ${year}`
  if (monday.getMonth() === friday.getMonth()) return `${monday.getDate()} – ${dayMonth(friday)} ${year}`
  return `${dayMonth(monday)} – ${dayMonth(friday)} ${year}`
}

/** "This week" / "Next week" / "Last week", or null further out. */
export function relativeWeekLabel(weekStart, today = new Date()) {
  const diff = Math.round((parseDateOnly(weekStart) - parseDateOnly(weekStartOf(today))) / (7 * 24 * 60 * 60 * 1000))
  if (diff === 0) return 'This week'
  if (diff === 1) return 'Next week'
  if (diff === -1) return 'Last week'
  return null
}
