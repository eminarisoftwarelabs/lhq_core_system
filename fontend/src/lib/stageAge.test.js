import { describe, expect, it } from 'vitest'
import { formatStageAge, getStageEnteredAt } from './stageAge'

describe('getStageEnteredAt', () => {
  it('falls back to created_at when the enquiry has no stage history', () => {
    const enquiry = { created_at: '2026-08-01T00:00:00Z', stage_history: [] }
    expect(getStageEnteredAt(enquiry, 'INITIAL_CALL')).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('falls back to created_at when stage_history is missing entirely', () => {
    const enquiry = { created_at: '2026-08-01T00:00:00Z' }
    expect(getStageEnteredAt(enquiry, 'INITIAL_CALL')).toEqual(new Date('2026-08-01T00:00:00Z'))
  })

  it('uses the stage_history entry that moved the enquiry into the current stage, not created_at', () => {
    const enquiry = {
      created_at: '2026-08-01T00:00:00Z',
      stage_history: [
        { from_stage: null, to_stage: 'INITIAL_CALL', changed_at: '2026-08-01T00:00:00Z' },
        { from_stage: 'INITIAL_CALL', to_stage: 'MEETING_SET', changed_at: '2026-08-10T00:00:00Z' },
      ],
    }
    expect(getStageEnteredAt(enquiry, 'MEETING_SET')).toEqual(new Date('2026-08-10T00:00:00Z'))
  })

  it('resets to the latest transition if a record re-enters a stage more than once', () => {
    const enquiry = {
      created_at: '2026-08-01T00:00:00Z',
      stage_history: [
        { from_stage: null, to_stage: 'INITIAL_CALL', changed_at: '2026-08-01T00:00:00Z' },
        { from_stage: 'INITIAL_CALL', to_stage: 'MEETING_SET', changed_at: '2026-08-05T00:00:00Z' },
        { from_stage: 'MEETING_SET', to_stage: 'INITIAL_CALL', changed_at: '2026-08-12T00:00:00Z' },
      ],
    }
    expect(getStageEnteredAt(enquiry, 'INITIAL_CALL')).toEqual(new Date('2026-08-12T00:00:00Z'))
  })
})

describe('formatStageAge', () => {
  const now = new Date('2026-08-15T12:00:00Z')

  it('shows "Just now" for under a minute', () => {
    expect(formatStageAge(new Date('2026-08-15T11:59:30Z'), now)).toBe('Just now')
  })

  it('shows minutes under an hour', () => {
    expect(formatStageAge(new Date('2026-08-15T11:42:00Z'), now)).toBe('18m')
  })

  it('shows hours under a day', () => {
    expect(formatStageAge(new Date('2026-08-15T05:00:00Z'), now)).toBe('7h')
  })

  it('shows days under a month', () => {
    expect(formatStageAge(new Date('2026-08-10T12:00:00Z'), now)).toBe('5d')
  })

  it('shows months under a year', () => {
    expect(formatStageAge(new Date('2026-05-01T12:00:00Z'), now)).toBe('3mo')
  })

  it('shows years past a year', () => {
    expect(formatStageAge(new Date('2024-08-15T12:00:00Z'), now)).toBe('2y')
  })

  it('never goes negative for a clock-skewed future timestamp', () => {
    expect(formatStageAge(new Date('2026-08-16T00:00:00Z'), now)).toBe('Just now')
  })
})
