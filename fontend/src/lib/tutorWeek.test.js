import { describe, expect, it } from 'vitest'
import { buildWeekClasses, countDistinctStudents, weekdayIndex } from './tutorWeek'

const slot = (day, start) => ({ day_of_week: day, start_time: start, end_time: '23:00:00' })
// 2026-10-07 is a Wednesday.
const WEDNESDAY = new Date(2026, 9, 7)

describe('weekdayIndex', () => {
  it('numbers Monday 0 through Sunday 6, like the backend', () => {
    expect(weekdayIndex(new Date(2026, 9, 5))).toBe(0)
    expect(weekdayIndex(WEDNESDAY)).toBe(2)
    expect(weekdayIndex(new Date(2026, 9, 11))).toBe(6)
  })
})

describe('buildWeekClasses', () => {
  const subjects = [
    { id: 1, name: 'Physics', timetable_slot: slot(4, '14:00:00') },
    { id: 2, name: 'Maths', timetable_slot: slot(2, '15:00:00') },
    { id: 3, name: 'Biology', timetable_slot: slot(2, '09:00:00') },
    { id: 4, name: 'Zoology', timetable_slot: null },
    { id: 5, name: 'Art', timetable_slot: null },
  ]

  it('orders by day then start time, with unscheduled subjects last by name', () => {
    const rows = buildWeekClasses(subjects, [], {}, WEDNESDAY)
    expect(rows.map((r) => r.name)).toEqual(['Biology', 'Maths', 'Physics', 'Art', 'Zoology'])
  })

  it("attaches each subject's planned topic, or null when nothing is planned", () => {
    const plans = [{ subject: 2, topic_name: 'Fractions' }]
    const rows = buildWeekClasses(subjects, plans, {}, WEDNESDAY)
    expect(rows.find((r) => r.id === 2).topicName).toBe('Fractions')
    expect(rows.find((r) => r.id === 1).topicName).toBeNull()
  })

  it('counts students per subject, null where the roster did not load', () => {
    const rows = buildWeekClasses(subjects, [], { 1: [{ id: 7 }, { id: 8 }], 2: [] }, WEDNESDAY)
    expect(rows.find((r) => r.id === 1).studentCount).toBe(2)
    expect(rows.find((r) => r.id === 2).studentCount).toBe(0)
    expect(rows.find((r) => r.id === 3).studentCount).toBeNull()
  })

  it("flags today's classes only, never an unscheduled one", () => {
    const rows = buildWeekClasses(subjects, [], {}, WEDNESDAY)
    expect(rows.filter((r) => r.isToday).map((r) => r.name)).toEqual(['Biology', 'Maths'])
  })

  it('flags nothing at the weekend', () => {
    const rows = buildWeekClasses(subjects, [], {}, new Date(2026, 9, 10))
    expect(rows.some((r) => r.isToday)).toBe(false)
  })

  it('handles a tutor with no subjects', () => {
    expect(buildWeekClasses([], [], {}, WEDNESDAY)).toEqual([])
  })
})

describe('countDistinctStudents', () => {
  it('counts a student in two of the tutor\'s classes once', () => {
    expect(countDistinctStudents({ 1: [{ id: 7 }, { id: 8 }], 2: [{ id: 8 }, { id: 9 }] })).toBe(3)
  })

  it('is 0 when rosters loaded but are empty', () => {
    expect(countDistinctStudents({ 1: [] })).toBe(0)
  })

  it('is null when no roster loaded at all', () => {
    expect(countDistinctStudents({})).toBeNull()
  })
})
