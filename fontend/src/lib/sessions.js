// Pure helpers for sessions, student subjects and booking conflicts. No
// React, no fetching: every rule here is unit-tested in sessions.test.js.
import { ApiError } from './apiClient'
import { DAY_LABELS } from './constants'
import { parseDateOnly, toDateOnlyString } from './dateWindow'
import { toMinutes } from './timetableGrid'

// display_status from the API (backend academics/scheduling/state.py).
// SCHEDULED, HELD, NOT_HELD and CANCELLED are stored; UNLOGGED (ended,
// still loggable), MISSED (log window closed, counts as Not held) and
// MOVED (cancelled because it moved) are derived.
export const STATUS_META = {
  SCHEDULED: { label: 'Scheduled', tone: 'scheduled' },
  UNLOGGED: { label: 'Unlogged', tone: 'unlogged' },
  MISSED: { label: 'Not held (missed log)', tone: 'missed' },
  HELD: { label: 'Held', tone: 'held' },
  NOT_HELD: { label: 'Not held', tone: 'not-held' },
  CANCELLED: { label: 'Cancelled', tone: 'cancelled' },
  MOVED: { label: 'Moved', tone: 'moved' },
}

// Legend order on the timetable.
export const LEGEND = ['SCHEDULED', 'UNLOGGED', 'HELD', 'NOT_HELD', 'CANCELLED', 'MOVED']

export function statusLabel(status) {
  return STATUS_META[status]?.label ?? status
}

export function statusTone(status) {
  return STATUS_META[status]?.tone ?? 'scheduled'
}

export const MODE_LABELS = { IN_PERSON: 'In person', ONLINE: 'Online' }

export const STUDENT_SUBJECT_STATUS_LABELS = { ACTIVE: 'Active', ENDED: 'Ended', CANCELLED: 'Cancelled' }

export const CHANGE_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  CANCELLED: 'Withdrawn',
}

/** "Monday 16:00–17:00" */
export function slotLabel(slot) {
  return `${DAY_LABELS[slot.weekday]} ${slot.start_time}–${slot.end_time}`
}

/** "Mondays and Thursdays, 16:00–17:00" style list, one entry per slot. */
export function scheduleLabel(slots) {
  if (!slots || slots.length === 0) return 'No weekly time yet'
  return slots.map(slotLabel).join(', ')
}

/** "18 of 24 sessions, 9 of 12 topics" */
export function progressText(progress) {
  const sessions = `${progress.held} of ${progress.planned} sessions`
  if (!progress.topics_total) return sessions
  return `${sessions}, ${progress.topics_covered} of ${progress.topics_total} topics`
}

/** 0-100, for a progress bar. */
export function progressPercent(progress) {
  if (!progress.planned) return 0
  return Math.min(100, Math.round((progress.held / progress.planned) * 100))
}

/** "Thu 26 Nov 2026" from 'YYYY-MM-DD', or the fallback. */
export function formatDate(value, fallback = '—') {
  if (!value) return fallback
  // Built from formatShortDay: ICU adds a comma only when the year is in
  // ("Thu, 10 Dec 2026"), which reads oddly next to "Mon 16 Nov".
  return `${formatShortDay(value)} ${parseDateOnly(value).getFullYear()}`
}

/** "Mon 16 Nov" from 'YYYY-MM-DD'. */
export function formatShortDay(value) {
  return parseDateOnly(value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Time left to log a session, from its log_deadline (ISO with offset).
 * {expired, urgent (under 3 hours), label: "5 h 12 min left" / "Closed"}.
 */
export function timeLeft(deadlineIso, now = new Date()) {
  const ms = new Date(deadlineIso).getTime() - now.getTime()
  if (ms <= 0) return { expired: true, urgent: false, label: 'Logging closed' }
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const label = hours > 0 ? `${hours} h ${minutes} min left` : `${minutes} min left`
  return { expired: false, urgent: ms < 3 * 60 * 60 * 1000, label }
}

/** The seven 'YYYY-MM-DD' dates of the week starting at `weekStart`. */
export function weekDates(weekStart) {
  const monday = parseDateOnly(weekStart)
  return Array.from({ length: 7 }, (_, i) =>
    toDateOnlyString(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  )
}

/** The Sunday of the week starting at `weekStart`. */
export function weekEnd(weekStart) {
  return weekDates(weekStart)[6]
}

/** Sessions -> grid items {key, day, start, end, session}. */
export function toGridItems(sessions, weekStart) {
  const dates = weekDates(weekStart)
  return sessions
    .map((session) => ({
      key: session.id,
      day: dates.indexOf(session.date),
      start: toMinutes(session.start_time),
      end: toMinutes(session.end_time),
      session,
    }))
    .filter((item) => item.day !== -1)
}

/** 'YYYY-MM' for a Date. */
export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM' plus `months` (may be negative). */
export function addMonths(key, months) {
  const [year, month] = key.split('-').map(Number)
  return monthKey(new Date(year, month - 1 + months, 1))
}

/** "November 2026" */
export function formatMonth(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** "MWK 36,000" (amounts come as decimal strings). */
export function formatMwk(amount) {
  if (amount === null || amount === undefined) return null
  return `MWK ${Number(amount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}

/**
 * A 409 booking conflict from the API as {message, warnings, canOverride},
 * or null for any other error.
 */
export function bookingConflict(err) {
  if (!(err instanceof ApiError) || err.status !== 409 || err.data?.code !== 'BOOKING_CONFLICT') return null
  return {
    message: err.data.detail,
    warnings: err.data.warnings ?? [],
    canOverride: Boolean(err.data.can_override),
  }
}

/** The first readable message in an API error body. */
export function errorText(err, fallback) {
  if (err instanceof ApiError && err.data && typeof err.data === 'object') {
    if (err.data.detail) return [].concat(err.data.detail).join(' ')
    for (const value of Object.values(err.data)) {
      if (typeof value === 'string') return value
      if (Array.isArray(value) && typeof value[0] === 'string') return value.join(' ')
    }
  }
  return fallback
}

/** Whether `user` is the tutor of `session`. */
export function isOwnSession(session, user) {
  return Boolean(user && session?.tutor?.user_id === user.id)
}

/**
 * Whether an admin note is needed to log this session: staff logging a
 * session that isn't theirs, or theirs once the tutor window has closed
 * or it is already logged (a correction).
 */
export function needsAdminNote(session, user, isStaff) {
  if (!isStaff) return false
  const tutorPath = isOwnSession(session, user) && session.status === 'SCHEDULED' && session.display_status !== 'MISSED'
  return !tutorPath
}

/** Whether `session` starts after `now` (a tutor may only ask to change these). */
export function isUpcoming(session, now = new Date()) {
  const [year, month, day] = session.date.split('-').map(Number)
  const [hours, minutes] = session.start_time.split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes).getTime() > now.getTime()
}

let slotSeq = 0

/**
 * A new weekly-slot editor row (WorkingHoursEditor): the day after the
 * last row's, or Monday, at 16:00 for `minutes`.
 */
export function newSlotRow(rows, minutes = 60) {
  const last = rows[rows.length - 1]
  const weekday = last ? (Number(last.weekday) + 1) % 7 : 0
  const start = last ? last.start_time : '16:00'
  const total = Math.min(toMinutes(start) + minutes, 23 * 60 + 59)
  const end = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  slotSeq += 1
  return { weekday, start_time: start, end_time: end, key: `slot-${slotSeq}` }
}

/**
 * Splits first..last (inclusive 'YYYY-MM-DD') into windows of at most `days`
 * days, newest window first, because the sessions API serves at most 62 days
 * a call. [] when last is before first.
 */
export function dateWindows(first, last, days = 62) {
  const start = parseDateOnly(first)
  let end = parseDateOnly(last)
  const windows = []
  while (end >= start) {
    const from = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (days - 1))
    const clipped = from < start ? start : from
    windows.push({ from: toDateOnlyString(clipped), to: toDateOnlyString(end) })
    end = new Date(clipped.getFullYear(), clipped.getMonth(), clipped.getDate() - 1)
  }
  return windows
}

/** 'YYYY-MM-DD' for `date` plus `days` whole days. */
export function addDays(date, days) {
  return toDateOnlyString(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days))
}
