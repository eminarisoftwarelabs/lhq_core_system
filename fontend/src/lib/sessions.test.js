import { describe, expect, it } from 'vitest'
import { ApiError } from './apiClient'
import {
  addDays,
  addMonths,
  dateWindows,
  bookingConflict,
  errorText,
  formatMonth,
  formatMwk,
  isOwnSession,
  isUpcoming,
  monthKey,
  needsAdminNote,
  progressPercent,
  progressText,
  scheduleLabel,
  slotLabel,
  statusLabel,
  statusTone,
  timeLeft,
  toGridItems,
  weekDates,
  weekEnd,
} from './sessions'

describe('session statuses', () => {
  it('labels and tones every display status', () => {
    expect(statusLabel('UNLOGGED')).toBe('Unlogged')
    expect(statusLabel('MISSED')).toBe('Not held (missed log)')
    expect(statusTone('NOT_HELD')).toBe('not-held')
    expect(statusTone('MOVED')).toBe('moved')
    expect(statusTone('SOMETHING_NEW')).toBe('scheduled')
  })
})

describe('schedule and progress text', () => {
  it('describes weekly slots', () => {
    expect(slotLabel({ weekday: 0, start_time: '16:00', end_time: '17:00' })).toBe('Monday 16:00–17:00')
    expect(
      scheduleLabel([
        { weekday: 0, start_time: '16:00', end_time: '17:00' },
        { weekday: 3, start_time: '15:00', end_time: '16:00' },
      ]),
    ).toBe('Monday 16:00–17:00, Thursday 15:00–16:00')
    expect(scheduleLabel([])).toBe('No weekly time yet')
  })

  it('says how far a student subject has got', () => {
    const progress = { held: 18, planned: 24, topics_covered: 9, topics_total: 12 }
    expect(progressText(progress)).toBe('18 of 24 sessions, 9 of 12 topics')
    expect(progressText({ ...progress, topics_total: 0 })).toBe('18 of 24 sessions')
    expect(progressPercent(progress)).toBe(75)
    expect(progressPercent({ held: 30, planned: 24 })).toBe(100)
  })
})

describe('timeLeft', () => {
  const now = new Date('2026-11-16T18:00:00+02:00')

  it('counts down to the log deadline', () => {
    expect(timeLeft('2026-11-17T17:00:00+02:00', now)).toEqual({ expired: false, urgent: false, label: '23 h 0 min left' })
    expect(timeLeft('2026-11-16T19:30:00+02:00', now)).toEqual({ expired: false, urgent: true, label: '1 h 30 min left' })
    expect(timeLeft('2026-11-16T18:20:00+02:00', now).label).toBe('20 min left')
  })

  it('reports a closed window', () => {
    expect(timeLeft('2026-11-16T17:59:00+02:00', now)).toEqual({ expired: true, urgent: false, label: 'Logging closed' })
  })
})

describe('weeks and months', () => {
  it('lists the seven dates of a week', () => {
    expect(weekDates('2026-11-16')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
      '2026-11-22',
    ])
    expect(weekEnd('2026-12-28')).toBe('2027-01-03')
  })

  it('places sessions on the grid by date, dropping other weeks', () => {
    const items = toGridItems(
      [
        { id: 1, date: '2026-11-19', start_time: '16:00', end_time: '17:30' },
        { id: 2, date: '2026-11-23', start_time: '09:00', end_time: '10:00' },
      ],
      '2026-11-16',
    )
    expect(items).toEqual([{ key: 1, day: 3, start: 960, end: 1050, session: expect.objectContaining({ id: 1 }) }])
  })

  it('formats dates the same way with and without the year', async () => {
    const { formatDate, formatShortDay } = await import('./sessions')
    expect(formatShortDay('2026-11-16')).toBe('Mon 16 Nov')
    expect(formatDate('2026-12-10')).toBe('Thu 10 Dec 2026')
    expect(formatDate(null, 'Not known yet')).toBe('Not known yet')
  })

  it('steps months', () => {
    expect(monthKey(new Date(2026, 10, 19))).toBe('2026-11')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(formatMonth('2026-11')).toBe('November 2026')
  })

  it('formats money', () => {
    expect(formatMwk('36000.00')).toBe('MWK 36,000')
    expect(formatMwk(null)).toBeNull()
  })
})

describe('errors', () => {
  it('recognises a booking conflict', () => {
    const err = new ApiError(409, {
      detail: 'Mr Banda already teaches IGCSE Physics (Ann) on Monday 16:00 to 17:00.',
      code: 'BOOKING_CONFLICT',
      warnings: [{ code: 'CLASH', message: 'x', items: [] }],
      can_override: true,
    })
    expect(bookingConflict(err)).toEqual({
      message: 'Mr Banda already teaches IGCSE Physics (Ann) on Monday 16:00 to 17:00.',
      warnings: [{ code: 'CLASH', message: 'x', items: [] }],
      canOverride: true,
    })
    expect(bookingConflict(new ApiError(400, { detail: 'nope' }))).toBeNull()
    expect(bookingConflict(new Error('offline'))).toBeNull()
  })

  it('finds the first readable message', () => {
    expect(errorText(new ApiError(400, { detail: ['A', 'B'] }), 'x')).toBe('A B')
    expect(errorText(new ApiError(400, { reason: ['Say why.'] }), 'x')).toBe('Say why.')
    expect(errorText(new Error('boom'), 'Fallback')).toBe('Fallback')
  })
})

describe('who may do what', () => {
  const user = { id: 7 }
  const session = { tutor: { user_id: 7 }, status: 'SCHEDULED', display_status: 'UNLOGGED' }

  it('knows the tutor of a session', () => {
    expect(isOwnSession(session, user)).toBe(true)
    expect(isOwnSession(session, { id: 8 })).toBe(false)
  })

  it('asks staff for a note unless they are logging their own session in time', () => {
    expect(needsAdminNote(session, user, false)).toBe(false)
    expect(needsAdminNote(session, user, true)).toBe(false)
    expect(needsAdminNote(session, { id: 8 }, true)).toBe(true)
    expect(needsAdminNote({ ...session, display_status: 'MISSED' }, user, true)).toBe(true)
    expect(needsAdminNote({ ...session, status: 'HELD', display_status: 'HELD' }, user, true)).toBe(true)
  })

  it('knows whether a session is still ahead', () => {
    const now = new Date(2026, 10, 18, 12, 0)
    expect(isUpcoming({ date: '2026-11-18', start_time: '12:30' }, now)).toBe(true)
    expect(isUpcoming({ date: '2026-11-18', start_time: '11:30' }, now)).toBe(false)
  })
})

describe('newSlotRow', () => {
  it('starts on Monday at 16:00 for the session length', async () => {
    const { newSlotRow } = await import('./sessions')
    const first = newSlotRow([], 90)
    expect(first).toMatchObject({ weekday: 0, start_time: '16:00', end_time: '17:30' })
    const second = newSlotRow([first], 60)
    expect(second).toMatchObject({ weekday: 1, start_time: '16:00', end_time: '17:00' })
    expect(second.key).not.toBe(first.key)
    expect(newSlotRow([{ weekday: 6, start_time: '23:30' }], 60)).toMatchObject({ weekday: 0, end_time: '23:59' })
  })
})

describe('dateWindows', () => {
  it('is one window when the range fits', () => {
    expect(dateWindows('2026-11-01', '2026-11-30')).toEqual([{ from: '2026-11-01', to: '2026-11-30' }])
  })

  it('splits a long range into windows of at most 62 days, newest first, with no gaps or overlap', () => {
    const windows = dateWindows('2026-01-01', '2026-06-30')
    expect(windows[0].to).toBe('2026-06-30')
    expect(windows.at(-1).from).toBe('2026-01-01')
    for (const w of windows) {
      const days = (new Date(w.to) - new Date(w.from)) / 86400000 + 1
      expect(days).toBeLessThanOrEqual(62)
    }
    for (let i = 1; i < windows.length; i++) {
      expect(addDays(new Date(windows[i].to + 'T00:00:00'), 1)).toBe(windows[i - 1].from)
    }
  })

  it('is empty when the end is before the start, one day when they match', () => {
    expect(dateWindows('2026-11-02', '2026-11-01')).toEqual([])
    expect(dateWindows('2026-11-01', '2026-11-01')).toEqual([{ from: '2026-11-01', to: '2026-11-01' }])
  })
})

describe('addDays', () => {
  it('adds whole days across a month end', () => {
    expect(addDays(new Date(2026, 10, 28), 5)).toBe('2026-12-03')
    expect(addDays(new Date(2026, 10, 28), -28)).toBe('2026-10-31')
  })
})
