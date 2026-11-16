import { describe, expect, it } from 'vitest'
import {
  blockKey,
  diffHours,
  diffSubjects,
  formatBlock,
  groupByLevel,
  openRequestFor,
  sameHours,
  sameSubjectIds,
  sharesTutor,
  sortBlocks,
  subjectLabel,
  teachingSetupMissing,
  tutorNames,
} from './tutorTeaching'

const igcsePhysics = { id: 1, name: 'Physics', level: 3, level_name: 'IGCSE' }
const igcseMaths = { id: 2, name: 'Mathematics', level: 3, level_name: 'IGCSE' }
const aPhysics = { id: 3, name: 'Physics', level: 4, level_name: 'A Level' }
const primaryMaths = { id: 4, name: 'Mathematics', level: 1, level_name: 'Primary (Year 6)' }

describe('groupByLevel', () => {
  it('keeps level order as given and sorts subjects by name within a level', () => {
    const groups = groupByLevel([primaryMaths, igcsePhysics, igcseMaths, aPhysics])
    expect(groups.map((g) => g.levelName)).toEqual(['Primary (Year 6)', 'IGCSE', 'A Level'])
    expect(groups[1].subjects.map((s) => s.name)).toEqual(['Mathematics', 'Physics'])
  })

  it('handles nothing', () => {
    expect(groupByLevel(undefined)).toEqual([])
  })
})

describe('subject and tutor labels', () => {
  it('prefixes the level so same-named subjects are distinguishable', () => {
    expect(subjectLabel(igcsePhysics)).toBe('IGCSE Physics')
    expect(subjectLabel(aPhysics)).toBe('A Level Physics')
    expect(subjectLabel({ name: 'Art' })).toBe('Art')
  })

  it('joins tutor names and copes with a tutor response that has none', () => {
    expect(tutorNames({ tutors: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Ben' }] })).toBe('Ana, Ben')
    expect(tutorNames({})).toBe('')
  })

  it('detects a shared tutor', () => {
    expect(sharesTutor({ tutors: [{ id: 1 }, { id: 2 }] }, { tutors: [{ id: 2 }] })).toBe(true)
    expect(sharesTutor({ tutors: [{ id: 1 }] }, { tutors: [{ id: 2 }] })).toBe(false)
    expect(sharesTutor({}, { tutors: [{ id: 2 }] })).toBe(false)
  })
})

describe('working-hours blocks', () => {
  it('normalises seconds away and sorts by day then start', () => {
    expect(
      sortBlocks([
        { weekday: 2, start_time: '09:00:00', end_time: '10:00:00' },
        { weekday: 0, start_time: '14:00', end_time: '17:00' },
        { weekday: 0, start_time: '08:00', end_time: '12:00' },
      ]),
    ).toEqual([
      { weekday: 0, start_time: '08:00', end_time: '12:00' },
      { weekday: 0, start_time: '14:00', end_time: '17:00' },
      { weekday: 2, start_time: '09:00', end_time: '10:00' },
    ])
  })

  it('formats a block for people', () => {
    expect(formatBlock({ weekday: 6, start_time: '09:00', end_time: '12:30' })).toBe('Sunday 09:00 to 12:30')
  })

  it('keys equal blocks equally regardless of seconds', () => {
    expect(blockKey({ weekday: 1, start_time: '09:00:00', end_time: '10:00' })).toBe(
      blockKey({ weekday: '1', start_time: '09:00', end_time: '10:00:00' }),
    )
  })
})

describe('diffs for the review screens', () => {
  it('splits subjects into added, removed and unchanged', () => {
    const diff = diffSubjects([igcseMaths, igcsePhysics], [igcsePhysics, aPhysics])
    expect(diff.added).toEqual([aPhysics])
    expect(diff.removed).toEqual([igcseMaths])
    expect(diff.unchanged).toEqual([igcsePhysics])
  })

  it('splits hours block by block, so a moved block is one removed and one added', () => {
    const diff = diffHours(
      [
        { weekday: 0, start_time: '08:00', end_time: '12:00' },
        { weekday: 2, start_time: '14:00', end_time: '17:00' },
      ],
      [
        { weekday: 0, start_time: '08:00', end_time: '12:00' },
        { weekday: 2, start_time: '15:00', end_time: '17:00' },
      ],
    )
    expect(diff.unchanged).toHaveLength(1)
    expect(diff.removed).toEqual([{ weekday: 2, start_time: '14:00', end_time: '17:00' }])
    expect(diff.added).toEqual([{ weekday: 2, start_time: '15:00', end_time: '17:00' }])
  })

  it('compares whole sets ignoring order and duplicates', () => {
    expect(sameSubjectIds([2, 1, 1], [1, 2])).toBe(true)
    expect(sameSubjectIds([1], [1, 2])).toBe(false)
    expect(
      sameHours(
        [{ weekday: 1, start_time: '09:00:00', end_time: '10:00:00' }],
        [{ weekday: 1, start_time: '09:00', end_time: '10:00' }],
      ),
    ).toBe(true)
    expect(sameHours([], [{ weekday: 1, start_time: '09:00', end_time: '10:00' }])).toBe(false)
  })
})

describe('openRequestFor', () => {
  const req = (id, kind, status) => ({ id, kind, status })

  it('shows the newest pending request of that kind', () => {
    const requests = [req(3, 'SUBJECTS', 'PENDING'), req(2, 'SUBJECTS', 'CANCELLED'), req(1, 'WORKING_HOURS', 'PENDING')]
    expect(openRequestFor(requests, 'SUBJECTS').id).toBe(3)
    expect(openRequestFor(requests, 'WORKING_HOURS').id).toBe(1)
  })

  it('keeps showing a rejection until a newer request replaces it', () => {
    expect(openRequestFor([req(5, 'SUBJECTS', 'REJECTED')], 'SUBJECTS').id).toBe(5)
    expect(openRequestFor([req(6, 'SUBJECTS', 'APPROVED'), req(5, 'SUBJECTS', 'REJECTED')], 'SUBJECTS')).toBeNull()
  })

  it('skips cancelled requests to find what came before', () => {
    expect(openRequestFor([req(7, 'SUBJECTS', 'CANCELLED'), req(5, 'SUBJECTS', 'REJECTED')], 'SUBJECTS').id).toBe(5)
    expect(openRequestFor([], 'SUBJECTS')).toBeNull()
  })
})

describe('teachingSetupMissing', () => {
  it('is true until both subjects and hours exist', () => {
    expect(teachingSetupMissing([], [{ weekday: 0 }])).toBe(true)
    expect(teachingSetupMissing([igcseMaths], [])).toBe(true)
    expect(teachingSetupMissing([igcseMaths], [{ weekday: 0 }])).toBe(false)
  })
})

describe('working-hours editor rows', () => {
  it('round-trips blocks through rows with unique keys', async () => {
    const { toRows, fromRows } = await import('./tutorTeaching')
    const rows = toRows([
      { weekday: 3, start_time: '14:00:00', end_time: '17:00:00' },
      { weekday: 0, start_time: '08:00', end_time: '12:00' },
    ])
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
    expect(fromRows(rows)).toEqual([
      { weekday: 0, start_time: '08:00', end_time: '12:00' },
      { weekday: 3, start_time: '14:00', end_time: '17:00' },
    ])
  })

  it('starts a new row on the day after the last one, wrapping Sunday to Monday', async () => {
    const { newRow } = await import('./tutorTeaching')
    expect(newRow([]).weekday).toBe(0)
    expect(newRow([{ weekday: 2 }]).weekday).toBe(3)
    expect(newRow([{ weekday: 6 }]).weekday).toBe(0)
  })
})
