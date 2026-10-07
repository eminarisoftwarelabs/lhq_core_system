// The tutor dashboard's "this week" view, as pure data: which of the
// tutor's classes run on which day, what's planned, and who's in them.
// Kept free of React and the clock (today is passed in) so it's testable.

/** 0=Monday ... 6=Sunday, matching TimetableSlot.day_of_week. */
export function weekdayIndex(date) {
  return (date.getDay() + 6) % 7
}

/**
 * One row per subject for the given week, in teaching order (day, then
 * start time); subjects with no timetable slot go last, by name.
 *
 * @param subjects   the tutor's subjects (GET /subjects/)
 * @param plans      that week's lesson plans (GET /lesson-plans/)
 * @param rosters    { [subjectId]: students[] } - a subject missing here
 *                   (its roster failed to load) gets studentCount null
 */
export function buildWeekClasses(subjects, plans, rosters, today) {
  const topicBySubject = new Map(plans.map((plan) => [plan.subject, plan.topic_name]))
  const todayIndex = weekdayIndex(today)

  return subjects
    .map((subject) => {
      const slot = subject.timetable_slot ?? null
      return {
        id: subject.id,
        name: subject.name,
        slot,
        topicName: topicBySubject.get(subject.id) ?? null,
        studentCount: rosters[subject.id] ? rosters[subject.id].length : null,
        isToday: slot !== null && slot.day_of_week === todayIndex,
      }
    })
    .sort((a, b) => {
      if (!a.slot || !b.slot) return a.slot ? -1 : b.slot ? 1 : a.name.localeCompare(b.name)
      return (
        a.slot.day_of_week - b.slot.day_of_week ||
        a.slot.start_time.localeCompare(b.slot.start_time) ||
        a.name.localeCompare(b.name)
      )
    })
}

/**
 * Distinct students across every roster that loaded - a student taking two
 * of the tutor's subjects counts once. Null when no roster loaded at all,
 * so the card shows a dash rather than a misleading 0.
 */
export function countDistinctStudents(rosters) {
  const loaded = Object.values(rosters)
  if (loaded.length === 0) return null
  return new Set(loaded.flat().map((student) => student.id)).size
}
