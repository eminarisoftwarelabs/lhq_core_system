import { describe, expect, it } from 'vitest'
import {
  decodeDrag,
  encodeDrag,
  firstFreeStart,
  formatDuration,
  formatRange,
  fromMinutes,
  gridBounds,
  layoutLanes,
  placeStart,
  snap,
  timeOptions,
  toMinutes,
  toSession,
  toSlotPayload,
  tutorClashes,
  weekdayIndex,
} from './timetableGrid'

const s = (id, day, start, end, tutor = null) => ({
  subject: { id, tutor },
  day,
  start: toMinutes(start),
  end: toMinutes(end),
})

describe('time conversion', () => {
  it('parses API times with or without seconds', () => {
    expect(toMinutes('14:05:00')).toBe(845)
    expect(toMinutes('09:30')).toBe(570)
  })

  it('formats minutes, ranges, and durations', () => {
    expect(fromMinutes(845)).toBe('14:05')
    expect(fromMinutes(0)).toBe('00:00')
    expect(formatRange(840, 930)).toBe('14:00–15:30')
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(45)).toBe('45 min')
  })

  it('builds the API slot payload', () => {
    expect(toSlotPayload(2, 840, 930)).toEqual({ day_of_week: 2, start_time: '14:00', end_time: '15:30' })
  })
})

describe('weekdayIndex', () => {
  it('maps Monday-Friday to 0-4 and weekends to null', () => {
    expect(weekdayIndex(new Date(2026, 8, 21))).toBe(0) // Mon
    expect(weekdayIndex(new Date(2026, 8, 25))).toBe(4) // Fri
    expect(weekdayIndex(new Date(2026, 8, 26))).toBeNull() // Sat
    expect(weekdayIndex(new Date(2026, 8, 27))).toBeNull() // Sun
  })
})

describe('toSession', () => {
  it('returns minutes for a weekday slot', () => {
    const subject = { id: 1, timetable_slot: { day_of_week: 2, start_time: '14:00:00', end_time: '15:00:00' } }
    expect(toSession(subject)).toEqual({ subject, day: 2, start: 840, end: 900 })
  })

  it('treats unscheduled and legacy weekend slots as unscheduled', () => {
    expect(toSession({ id: 1, timetable_slot: null })).toBeNull()
    expect(toSession({ id: 1, timetable_slot: { day_of_week: 5, start_time: '09:00', end_time: '10:00' } })).toBeNull()
  })
})

describe('gridBounds', () => {
  it('defaults to 08:00-18:00 when nothing is scheduled', () => {
    expect(gridBounds([])).toEqual({ start: 480, end: 1080 })
  })

  it('fits the sessions with an hour either side, at least six hours tall', () => {
    // 14:00-17:00 -> 13:00-18:00 padded, grown to 6h -> 13:00-19:00.
    expect(gridBounds([s(1, 0, '14:00', '15:30'), s(2, 1, '16:00', '17:00')])).toEqual({ start: 780, end: 1140 })
  })

  it('grows earlier when the day end is reached', () => {
    // 20:00-20:45 -> 19:00-21:00 padded, capped at 21:00, grown back to 15:00.
    expect(gridBounds([s(1, 0, '20:00', '20:45')])).toEqual({ start: 900, end: 1260 })
  })

  it('pads a wide spread without exceeding 07:00-21:00', () => {
    expect(gridBounds([s(1, 0, '07:15', '08:00'), s(2, 1, '19:30', '20:40')])).toEqual({ start: 420, end: 1260 })
  })

  it('never clips a session outside the normal day', () => {
    expect(gridBounds([s(1, 0, '06:30', '07:30')])).toEqual({ start: 360, end: 780 })
  })

  it('full day shows 07:00-21:00 regardless of sessions', () => {
    expect(gridBounds([s(1, 0, '14:00', '15:00')], { fullDay: true })).toEqual({ start: 420, end: 1260 })
  })
})

describe('snapping and placement', () => {
  const bounds = { start: 480, end: 1080 }

  it('snaps to 15 minutes', () => {
    expect(snap(847)).toBe(840)
    expect(snap(853)).toBe(855)
  })

  it('keeps a whole session inside the grid', () => {
    expect(placeStart(470, 60, bounds)).toBe(480)
    expect(placeStart(1070, 60, bounds)).toBe(1020)
    expect(placeStart(847, 60, bounds)).toBe(840)
  })
})

describe('layoutLanes', () => {
  it('gives non-overlapping sessions the full width', () => {
    const lanes = layoutLanes([s(1, 0, '09:00', '10:00'), s(2, 0, '10:00', '11:00')])
    expect(lanes.get(1)).toEqual({ lane: 0, lanes: 1 })
    expect(lanes.get(2)).toEqual({ lane: 0, lanes: 1 })
  })

  it('puts overlapping sessions side by side and reuses freed lanes', () => {
    const lanes = layoutLanes([
      s(1, 0, '09:00', '11:00'),
      s(2, 0, '09:30', '10:00'),
      s(3, 0, '10:00', '10:30'),
      s(4, 0, '12:00', '13:00'),
    ])
    expect(lanes.get(1)).toEqual({ lane: 0, lanes: 2 })
    expect(lanes.get(2)).toEqual({ lane: 1, lanes: 2 })
    expect(lanes.get(3)).toEqual({ lane: 1, lanes: 2 })
    expect(lanes.get(4)).toEqual({ lane: 0, lanes: 1 })
  })

  it('handles three-way overlap', () => {
    const lanes = layoutLanes([s(1, 0, '09:00', '10:00'), s(2, 0, '09:00', '10:00'), s(3, 0, '09:30', '10:30')])
    expect([...lanes.values()].map((l) => l.lanes)).toEqual([3, 3, 3])
    expect(new Set([...lanes.values()].map((l) => l.lane))).toEqual(new Set([0, 1, 2]))
  })
})

describe('tutorClashes', () => {
  it('flags the same tutor in overlapping sessions on the same day', () => {
    const clashes = tutorClashes([
      s(1, 0, '14:00', '15:00', 9),
      s(2, 0, '14:30', '15:30', 9),
      s(3, 1, '14:00', '15:00', 9),
      s(4, 0, '14:00', '15:00', 7),
    ])
    expect(clashes).toEqual(new Set([1, 2]))
  })

  it('ignores back-to-back sessions and unassigned subjects', () => {
    expect(tutorClashes([s(1, 0, '14:00', '15:00', 9), s(2, 0, '15:00', '16:00', 9)]).size).toBe(0)
    expect(tutorClashes([s(1, 0, '14:00', '15:00'), s(2, 0, '14:00', '15:00')]).size).toBe(0)
  })
})

describe('firstFreeStart', () => {
  const bounds = { start: 480, end: 1080 }

  it('finds the first gap that fits', () => {
    const sessions = [s(1, 0, '08:00', '09:00'), s(2, 0, '09:15', '10:00')]
    expect(firstFreeStart(sessions, 0, bounds)).toBe(toMinutes('10:00'))
    expect(firstFreeStart(sessions, 1, bounds)).toBe(480)
  })

  it('respects a starting point', () => {
    expect(firstFreeStart([], 0, bounds, { from: 840 })).toBe(840)
  })

  it('falls back to the starting point on a full day', () => {
    expect(firstFreeStart([s(1, 0, '08:00', '18:00')], 0, bounds, { from: 900 })).toBe(900)
  })
})

describe('timeOptions', () => {
  it('lists 15-minute steps inclusive of both ends', () => {
    const options = timeOptions({ from: 480, to: 540 })
    expect(options).toEqual([480, 495, 510, 525, 540])
  })
})

describe('drag payloads', () => {
  it('round-trips a subject and grab offset', () => {
    expect(decodeDrag(encodeDrag(12, 30))).toEqual({ subjectId: 12, grabOffset: 30 })
    expect(decodeDrag(encodeDrag(3))).toEqual({ subjectId: 3, grabOffset: 0 })
  })

  it('ignores anything that is not ours', () => {
    expect(decodeDrag('hello')).toBeNull()
    expect(decodeDrag('')).toBeNull()
    expect(decodeDrag(undefined)).toBeNull()
  })
})
