import { describe, expect, it } from 'vitest'
import { getNextAction } from './onboardingNextAction'

const now = new Date('2026-09-10T12:00:00Z')

describe('getNextAction', () => {
  describe('INITIAL_CALL', () => {
    it('prompts to schedule a meeting when none is set', () => {
      expect(getNextAction('INITIAL_CALL', {}, null, now)).toBe('No meeting scheduled yet')
    })

    it('shows the meeting time if one was recorded early (stage not yet advanced)', () => {
      const enquiry = { meeting_datetime: '2026-09-20T14:00:00Z' }
      expect(getNextAction('INITIAL_CALL', enquiry, null, now)).toMatch(/^Meeting /)
    })
  })

  describe('MEETING_SET', () => {
    it('falls back gracefully if no meeting time is recorded (defensive)', () => {
      expect(getNextAction('MEETING_SET', {}, null, now)).toBe('Meeting time not set')
    })

    it('shows the upcoming meeting time for a future meeting', () => {
      const enquiry = { meeting_datetime: '2026-09-20T14:00:00Z' }
      const result = getNextAction('MEETING_SET', enquiry, null, now)
      expect(result).toMatch(/^Meeting /)
      expect(result).not.toMatch(/follow up/)
    })

    it('flags a past meeting for follow-up', () => {
      const enquiry = { meeting_datetime: '2026-09-01T14:00:00Z' }
      const result = getNextAction('MEETING_SET', enquiry, null, now)
      expect(result).toMatch(/^Meeting was /)
      expect(result).toMatch(/follow up/)
    })
  })

  describe('INVOICED', () => {
    it('falls back to a generic message if the invoice has not loaded yet', () => {
      expect(getNextAction('INVOICED', {}, null, now)).toBe('Awaiting payment')
    })

    it('shows the due date for a not-yet-overdue invoice', () => {
      const invoice = { due_date: '2026-09-24', is_overdue: false }
      expect(getNextAction('INVOICED', {}, invoice, now)).toBe('Awaiting payment — due Sep 24, 2026')
    })

    it('flags an overdue invoice', () => {
      const invoice = { due_date: '2026-08-20', is_overdue: true }
      expect(getNextAction('INVOICED', {}, invoice, now)).toBe('Overdue — was due Aug 20, 2026')
    })
  })

  it('returns an empty string for an unrecognized stage (defensive)', () => {
    expect(getNextAction('ENROLLED', {}, null, now)).toBe('')
  })
})
