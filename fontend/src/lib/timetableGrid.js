// Pure time/geometry helpers for the week grid (SessionWeekGrid). Times
// are minutes-since-midnight integers so layout and overlap checks are
// plain arithmetic; components only convert to pixels at the very edge.

// Monday to Sunday, 0=Monday like the backend (and Python's weekday()).
export const WEEKDAYS = [
  { day: 0, label: 'Monday', short: 'Mon' },
  { day: 1, label: 'Tuesday', short: 'Tue' },
  { day: 2, label: 'Wednesday', short: 'Wed' },
  { day: 3, label: 'Thursday', short: 'Thu' },
  { day: 4, label: 'Friday', short: 'Fri' },
  { day: 5, label: 'Saturday', short: 'Sat' },
  { day: 6, label: 'Sunday', short: 'Sun' },
]

// The day the grid always covers, so the morning is never hidden.
export const FULL_DAY_START = 7 * 60
export const FULL_DAY_END = 21 * 60
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

/**
 * The whole-hour window the grid shows: the full day, 07:00-21:00, so the
 * morning is never hidden. Anything booked outside it (items with start/end
 * minutes) stretches the window to its own hours.
 */
export function gridBounds(items) {
  let start = FULL_DAY_START
  let end = FULL_DAY_END
  for (const item of items) {
    start = Math.min(start, Math.floor(item.start / 60) * 60)
    end = Math.max(end, Math.ceil(item.end / 60) * 60)
  }
  return { start, end }
}

/**
 * Side-by-side lanes for overlapping items within one day, so no block is
 * drawn on top of another. Items that touch end-to-start don't overlap.
 * Returns a Map of item.key -> { lane, lanes }, `lanes` being the width of
 * that item's overlap cluster.
 */
export function layoutLanes(dayItems) {
  const sorted = [...dayItems].sort((a, b) => a.start - b.start || b.end - a.end)
  const placement = new Map()
  let cluster = []
  let clusterEnd = -1
  let laneEnds = []

  function flush() {
    for (const item of cluster) placement.get(item.key).lanes = laneEnds.length
    cluster = []
    laneEnds = []
  }

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    placement.set(item.key, { lane, lanes: 1 })
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.end)
  }
  flush()
  return placement
}
