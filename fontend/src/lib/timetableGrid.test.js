import { describe, expect, it } from 'vitest'
import {
  FULL_DAY_END,
  FULL_DAY_START,
  WEEKDAYS,
  formatDuration,
  formatRange,
  fromMinutes,
  gridBounds,
  layoutLanes,
  toMinutes,
} from './timetableGrid'

const item = (key, start, end) => ({ key, start: toMinutes(start), end: toMinutes(end) })

describe('timetableGrid', () => {
  it('covers the whole week, Monday to Sunday', () => {
    expect(WEEKDAYS.map((d) => d.short)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(WEEKDAYS[6].day).toBe(6)
  })

  it('converts between HH:MM and minutes', () => {
    expect(toMinutes('14:05:00')).toBe(845)
    expect(toMinutes('14:05')).toBe(845)
    expect(fromMinutes(845)).toBe('14:05')
    expect(formatRange(960, 1020)).toBe('16:00–17:00')
  })

  it('formats durations', () => {
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(60)).toBe('1 h')
    expect(formatDuration(45)).toBe('45 min')
  })

  describe('gridBounds', () => {
    it('always covers the full day, empty or not, so mornings show', () => {
      const full = { start: FULL_DAY_START, end: FULL_DAY_END }
      expect(gridBounds([])).toEqual(full)
      expect(gridBounds([item(1, '14:00', '15:00')])).toEqual(full)
      expect(gridBounds([item(1, '08:00', '09:00')])).toEqual(full)
    })

    it('never clips something booked outside the usual day', () => {
      const bounds = gridBounds([item(1, '06:30', '07:30'), item(2, '20:30', '21:45')])
      expect(bounds.start).toBe(toMinutes('06:00'))
      expect(bounds.end).toBe(toMinutes('22:00'))
    })
  })

  describe('layoutLanes', () => {
    it('puts overlapping items side by side and touching ones in one lane', () => {
      const lanes = layoutLanes([item('a', '14:00', '15:00'), item('b', '14:30', '15:30'), item('c', '15:30', '16:00')])
      expect(lanes.get('a')).toEqual({ lane: 0, lanes: 2 })
      expect(lanes.get('b')).toEqual({ lane: 1, lanes: 2 })
      expect(lanes.get('c')).toEqual({ lane: 0, lanes: 1 })
    })
  })
})
