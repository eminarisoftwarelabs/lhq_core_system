// Pure time/geometry helpers for the Timetable week grid (TimetablePage).
// Everything here is minutes-since-midnight integers so layout, snapping,
// and overlap checks are plain arithmetic - the components only convert to
// pixels at the very edge.

// The centre runs Monday-Friday (backend academics.models.LAST_WEEKDAY).
// day_of_week keeps the backend's 0=Monday numbering.
export const WEEKDAYS = [
  { day: 0, label: 'Monday', short: 'Mon' },
  { day: 1, label: 'Tuesday', short: 'Tue' },
  { day: 2, label: 'Wednesday', short: 'Wed' },
  { day: 3, label: 'Thursday', short: 'Thu' },
  { day: 4, label: 'Friday', short: 'Fri' },
]

// The widest window the grid (and the dialog's time pickers) ever covers.
export const FULL_DAY_START = 7 * 60
export const FULL_DAY_END = 21 * 60
// Shown when nothing is scheduled yet.
export const DEFAULT_DAY_START = 8 * 60
export const DEFAULT_DAY_END = 18 * 60
// A fitted grid never gets shorter than this, so a single session doesn't
// render as one giant block.
export const MIN_FIT_MINUTES = 6 * 60
export const SNAP_MINUTES = 15
export const DEFAULT_SESSION_MINUTES = 60

/** '14:05:00' or '14:05' -> 845. */
export function toMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

/** 845 -> '14:05'. */
export function fromMinutes(total) {
  const hours = String(Math.floor(total / 60)).padStart(2, '0')
  const minutes = String(total % 60).padStart(2, '0')
  return `${hours}:${minutes}`
}

export function formatRange(startMinutes, endMinutes) {
  return `${fromMinutes(startMinutes)}–${fromMinutes(endMinutes)}`
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours} h ${rest} min`
  if (hours) return `${hours} h`
  return `${rest} min`
}

/** Monday-Friday index for a Date, or null on a weekend. */
export function weekdayIndex(date) {
  const jsDay = date.getDay() // 0=Sunday
  return jsDay >= 1 && jsDay <= 5 ? jsDay - 1 : null
}

/**
 * A subject's slot as { subject, day, start, end } in minutes, or null if
 * it's unscheduled or sits on a day the grid doesn't show (a legacy weekend
 * slot) - those are treated as unscheduled so they can be re-placed.
 */
export function toSession(subject) {
  const slot = subject.timetable_slot
  if (!slot || slot.day_of_week < 0 || slot.day_of_week > 4) return null
  return { subject, day: slot.day_of_week, start: toMinutes(slot.start_time), end: toMinutes(slot.end_time) }
}

/**
 * The whole-hour window the grid shows. By default it fits the sessions
 * that exist - an hour of air either side, at least MIN_FIT_MINUTES tall,
 * never outside 07:00-21:00 - so a centre that only teaches afternoons
 * isn't staring at an empty morning. `fullDay` shows 07:00-21:00 outright.
 */
export function gridBounds(sessions, { fullDay = false } = {}) {
  if (fullDay) return { start: FULL_DAY_START, end: FULL_DAY_END }
  if (sessions.length === 0) return { start: DEFAULT_DAY_START, end: DEFAULT_DAY_END }

  let first = Infinity
  let last = -Infinity
  for (const session of sessions) {
    first = Math.min(first, session.start)
    last = Math.max(last, session.end)
  }
  let start = Math.max(FULL_DAY_START, Math.floor(first / 60) * 60 - 60)
  let end = Math.min(FULL_DAY_END, Math.ceil(last / 60) * 60 + 60)
  // Grow to the minimum height, later first (afternoon sessions have more
  // room after them), then earlier once the day's end is reached.
  if (end - start < MIN_FIT_MINUTES) end = Math.min(FULL_DAY_END, start + MIN_FIT_MINUTES)
  if (end - start < MIN_FIT_MINUTES) start = Math.max(FULL_DAY_START, end - MIN_FIT_MINUTES)
  // A session outside 07:00-21:00 (only possible via the admin) still
  // gets its own hours rather than being clipped.
  start = Math.min(start, Math.floor(first / 60) * 60)
  end = Math.max(end, Math.ceil(last / 60) * 60)
  return { start, end }
}

export function snap(minutes, step = SNAP_MINUTES) {
  return Math.round(minutes / step) * step
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Where a session of `duration` minutes should start if it's dropped or
 * clicked at `minutes`: snapped, and kept fully inside the grid.
 */
export function placeStart(minutes, duration, bounds, step = SNAP_MINUTES) {
  return clamp(snap(minutes, step), bounds.start, bounds.end - duration)
}

export function overlaps(a, b) {
  return a.day === b.day && a.start < b.end && b.start < a.end
}

/**
 * Side-by-side columns for overlapping sessions within one day, so no
 * block is ever drawn on top of (and hiding) another. Sessions that touch
 * end-to-start don't overlap. Returns a Map of subject id -> { lane, lanes }
 * where `lanes` is the width of that session's overlap cluster.
 */
export function layoutLanes(daySessions) {
  const sorted = [...daySessions].sort((a, b) => a.start - b.start || b.end - a.end)
  const placement = new Map()
  let cluster = []
  let clusterEnd = -1
  let laneEnds = []

  function flush() {
    for (const item of cluster) placement.get(item.subject.id).lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const session of sorted) {
    if (session.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= session.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(session.end)
    } else {
      laneEnds[lane] = session.end
    }
    placement.set(session.subject.id, { lane, lanes: 1 })
    cluster.push(session)
    clusterEnd = Math.max(clusterEnd, session.end)
  }
  flush()
  return placement
}

/**
 * Subject ids whose tutor is booked into another overlapping session.
 * Unassigned subjects (no tutor) never clash with each other.
 */
export function tutorClashes(sessions) {
  const clashing = new Set()
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      const a = sessions[i]
      const b = sessions[j]
      if (a.subject.tutor != null && a.subject.tutor === b.subject.tutor && overlaps(a, b)) {
        clashing.add(a.subject.id)
        clashing.add(b.subject.id)
      }
    }
  }
  return clashing
}

/**
 * First start time (on the snap grid) in `day` where a `duration`-minute
 * session fits without overlapping anything already there, searching from
 * `from`. Falls back to `from` itself when the day is full - the grid
 * lays overlaps out side by side, so that's still visible, just crowded.
 */
export function firstFreeStart(sessions, day, bounds, { duration = DEFAULT_SESSION_MINUTES, from = bounds.start } = {}) {
  const daySessions = sessions.filter((s) => s.day === day)
  for (let start = from; start + duration <= bounds.end; start += SNAP_MINUTES) {
    const candidate = { day, start, end: start + duration }
    if (!daySessions.some((s) => overlaps(s, candidate))) return start
  }
  return clamp(from, bounds.start, bounds.end - duration)
}

/** Start/end <select> options every `step` minutes across the day. */
export function timeOptions({ from = FULL_DAY_START, to = FULL_DAY_END, step = SNAP_MINUTES } = {}) {
  const options = []
  for (let m = from; m <= to; m += step) options.push(m)
  return options
}

/** Slot payload for PATCH /subjects/{id}/ from minutes. */
export function toSlotPayload(day, start, end) {
  return { day_of_week: day, start_time: fromMinutes(start), end_time: fromMinutes(end) }
}

// Drag payloads (a tray subject or a grid block being moved) go through
// dataTransfer as tagged text, so a drop from outside the app - a text
// selection, a file - decodes to null and is ignored instead of throwing.
// grabOffset is how far into the block (in minutes) the pointer grabbed
// it, so a moved block lands where it visually is, not by its top edge.
export const DRAG_TYPE = 'text/plain'

export function encodeDrag(subjectId, grabOffset = 0) {
  return `lhq-subject:${subjectId}:${grabOffset}`
}

export function decodeDrag(text) {
  const match = /^lhq-subject:(\d+):(\d+)$/.exec(text || '')
  return match ? { subjectId: Number(match[1]), grabOffset: Number(match[2]) } : null
}
