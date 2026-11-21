// API-shaped sessions and student subjects for component tests. Shapes
// match backend academics/scheduling_serializers.py.

export const TUTOR_USER = { id: 9, full_name: 'Mr Banda', role: 'TUTOR', tutor_profile: { id: 4 } }
export const ADMIN_USER = { id: 1, full_name: 'Grace Admin', role: 'ADMIN', tutor_profile: null }

export function makeSession(overrides = {}) {
  return {
    id: 101,
    student_subject: 7,
    student: { id: 1, name: 'Takondwa Banda', student_number: 'STU-000001' },
    subject: { id: 3, name: 'Physics', level_name: 'IGCSE', display_name: 'IGCSE Physics' },
    tutor: { id: 4, name: 'Mr Banda', user_id: 9 },
    mode: 'IN_PERSON',
    slot: 1,
    date: '2026-11-16',
    start_time: '16:00',
    end_time: '17:00',
    status: 'SCHEDULED',
    display_status: 'SCHEDULED',
    log_deadline: '2026-11-17T17:00:00+02:00',
    can_log: false,
    not_held_reason: '',
    admin_note: '',
    topics_covered: [],
    planned_topics: [],
    planned_topic_names: [],
    logged_by_name: null,
    logged_at: null,
    moved_from: null,
    moved_to: null,
    pending_request: null,
    latest_request: null,
    ...overrides,
  }
}

export function makeSessionDetail(overrides = {}) {
  return makeSession({
    events: [],
    change_requests: [],
    topics: [
      { id: 11, number: '1.1', name: 'Forces', chapter: 'Motion', covered_before: true },
      { id: 12, number: '1.2', name: 'Energy', chapter: 'Motion', covered_before: false },
    ],
    moved_from_detail: null,
    ...overrides,
  })
}

export function makeStudentSubject(overrides = {}) {
  return {
    id: 7,
    student: { id: 1, name: 'Takondwa Banda', student_number: 'STU-000001' },
    subject: { id: 3, name: 'Physics', level_name: 'IGCSE', display_name: 'IGCSE Physics' },
    tutor: { id: 4, name: 'Mr Banda', user_id: 9 },
    topic_ids: [11, 12],
    planned_sessions: 24,
    session_minutes: 60,
    mode: 'IN_PERSON',
    start_date: '2026-09-07',
    confirmed_end_date: null,
    status: 'ACTIVE',
    slots: [{ id: 1, weekday: 0, start_time: '16:00', end_time: '17:00' }],
    progress: {
      planned: 24,
      held: 10,
      not_held: 0,
      remaining: 14,
      unlogged: 0,
      held_minutes: 600,
      held_hours: 10,
      topics_covered: 1,
      topics_total: 2,
      covered_topic_ids: [11],
      expected_end_date: '2027-02-15',
      needs_end_confirmation: false,
      end_reason: null,
    },
    ...overrides,
  }
}

export function conflictError(ApiError, canOverride = true) {
  return new ApiError(409, {
    detail: 'Mr Banda already teaches IGCSE Physics (Ann) on Tue 17 Nov 10:00 to 11:00.',
    code: 'BOOKING_CONFLICT',
    can_override: canOverride,
    warnings: [
      {
        code: 'CLASH',
        message: 'Mr Banda already teaches IGCSE Physics (Ann) on Tue 17 Nov 10:00 to 11:00.',
        items: [],
      },
    ],
  })
}
