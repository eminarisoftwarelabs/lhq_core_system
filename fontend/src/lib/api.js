import { apiFetch } from './apiClient'

export const authApi = {
  login: (email, password) =>
    apiFetch('/auth/login/', { method: 'POST', body: { email, password }, skipAuth: true }),
  logout: (refresh) => apiFetch('/auth/logout/', { method: 'POST', body: { refresh } }),
  setupPassword: (uid, token, newPassword) =>
    apiFetch('/auth/setup-password/', {
      method: 'POST',
      body: { uid, token, new_password: newPassword },
      skipAuth: true,
    }),
  changePassword: (currentPassword, newPassword) =>
    apiFetch('/auth/change-password/', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    }),
}

export const usersApi = {
  me: () => apiFetch('/me/'),
  list: (page = 1) => apiFetch(`/users/?page=${page}`),
  create: (payload) => apiFetch('/users/create/', { method: 'POST', body: payload }),
  get: (id) => apiFetch(`/users/${id}/`),
  update: (id, payload) => apiFetch(`/users/${id}/`, { method: 'PATCH', body: payload }),
  delete: (id) => apiFetch(`/users/${id}/`, { method: 'DELETE' }),
}

export const tutorsApi = {
  // Reuses GET /users/ (staff-scoped) rather than a dedicated endpoint -
  // there isn't a separate tutor-list API. Filters to users who teach and
  // pulls out the tutor_profile id, since the /tutors/{id}/... endpoints
  // are keyed by TutorProfile, not User. `page=1` only - fine at this
  // app's scale (a single tutoring business's staff roster).
  async listTeaching() {
    const res = await usersApi.list(1)
    return res.results
      .filter((u) => u.teaches)
      .map((u) => ({ id: u.tutor_profile.id, name: u.full_name || u.email }))
  },
  // Keyed by TutorProfile id. GET: staff, or the tutor themself. PUT:
  // staff only - saves straight away, no approval.
  getSubjects: (tutorId) => apiFetch(`/tutors/${tutorId}/subjects/`),
  setSubjects: (tutorId, subjectIds) =>
    apiFetch(`/tutors/${tutorId}/subjects/`, { method: 'PUT', body: { subjects: subjectIds } }),
  getWorkingHours: (tutorId) => apiFetch(`/tutors/${tutorId}/working-hours/`),
  setWorkingHours: (tutorId, blocks) =>
    apiFetch(`/tutors/${tutorId}/working-hours/`, { method: 'PUT', body: { working_hours: blocks } }),
  // {week_start, days: [{weekday, date, working, busy, free}]}; `week` is any
  // 'YYYY-MM-DD' in the week (snapped to its Monday server-side).
  getFreeSlots: (tutorId, week) => apiFetch(`/tutors/${tutorId}/free-slots/${toQuery({ week })}`),
  // Held sessions and hours for 'YYYY-MM', plus an estimated amount.
  getHours: (tutorId, month) => apiFetch(`/tutors/${tutorId}/hours/${toQuery({ month })}`),
}

// A tutor proposes new subjects or working hours; staff approve or reject.
// kind: 'SUBJECTS' (proposed = subject ids) or 'WORKING_HOURS'
// (proposed = [{weekday, start_time, end_time}]).
export const changeRequestsApi = {
  listMine: () => apiFetch('/tutors/me/change-requests/'),
  submit: (kind, proposed, note = '') =>
    apiFetch('/tutors/me/change-requests/', { method: 'POST', body: { kind, proposed, note } }),
  cancel: (id) => apiFetch(`/tutors/me/change-requests/${id}/cancel/`, { method: 'POST' }),
  list: (params = {}) => apiFetch(`/change-requests/${toQuery(params)}`),
  approve: (id) => apiFetch(`/change-requests/${id}/approve/`, { method: 'POST' }),
  reject: (id, reason) => apiFetch(`/change-requests/${id}/reject/`, { method: 'POST', body: { reason } }),
}

// The signed-in user's own notifications: {unread_count, results}.
export const notificationsApi = {
  list: () => apiFetch('/notifications/'),
  markRead: (id) => apiFetch(`/notifications/${id}/read/`, { method: 'POST' }),
}

function toQuery(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export const academicsApi = {
  listSchools: (params = {}) => apiFetch(`/schools/${toQuery(params)}`),
  listLevels: () => apiFetch('/levels/'),
  listSubjects: (params = {}) => apiFetch(`/subjects/${toQuery(params)}`),
  // Every Subject at once (the catalog grouped by level, pickers, the
  // timetable), not one page at a time - so this walks every page via
  // `next` rather than exposing pagination to the caller. Bounded at 50 pages (1000 subjects at PAGE_SIZE=20) so a
  // server bug returning `next` forever can't spin this forever.
  async listAllSubjects(params = {}) {
    const results = []
    for (let page = 1; page <= 50; page += 1) {
      const res = await academicsApi.listSubjects({ ...params, page })
      results.push(...res.results)
      if (!res.next) break
    }
    return results
  },
  getSubject: (id) => apiFetch(`/subjects/${id}/`),
  createSubject: (payload) => apiFetch('/subjects/', { method: 'POST', body: payload }),
  updateSubject: (id, payload) => apiFetch(`/subjects/${id}/`, { method: 'PATCH', body: payload }),
  // The official syllabus, read-only: [{chapter, topics: [...]}].
  listTopics: (subjectId) => apiFetch(`/subjects/${subjectId}/topics/`),
}

// A student taking one subject with one tutor, with weekly slots and
// progress. Writes are staff only. A booking that clashes or falls outside
// the tutor's working hours answers 409 {detail, code: 'BOOKING_CONFLICT',
// warnings, can_override}; staff resend with allowClash = true.
export const studentSubjectsApi = {
  list: (params = {}) => apiFetch(`/student-subjects/${toQuery(params)}`),
  listForStudent: (studentId) => apiFetch(`/students/${studentId}/subjects/`),
  get: (id) => apiFetch(`/student-subjects/${id}/`),
  create: (payload, allowClash = false) =>
    apiFetch('/student-subjects/', { method: 'POST', body: { ...payload, allow_clash: allowClash } }),
  update: (id, payload, allowClash = false) =>
    apiFetch(`/student-subjects/${id}/`, { method: 'PATCH', body: { ...payload, allow_clash: allowClash } }),
  addSlot: (id, slot, allowClash = false) =>
    apiFetch(`/student-subjects/${id}/slots/`, { method: 'POST', body: { ...slot, allow_clash: allowClash } }),
  updateSlot: (slotId, slot, allowClash = false) =>
    apiFetch(`/slots/${slotId}/`, { method: 'PATCH', body: { ...slot, allow_clash: allowClash } }),
  deleteSlot: (slotId) => apiFetch(`/slots/${slotId}/`, { method: 'DELETE' }),
  confirmEnd: (id, lastDate) =>
    apiFetch(`/student-subjects/${id}/confirm-end/`, { method: 'POST', body: { last_date: lastDate } }),
  addSessions: (id, count) => apiFetch(`/student-subjects/${id}/add-sessions/`, { method: 'POST', body: { count } }),
}

// Dated sessions. list() needs {from, to} ('YYYY-MM-DD', at most 62 days)
// and takes tutor / student / subject / student_subject filters. Tutors
// only ever get their own.
export const sessionsApi = {
  list: (params) => apiFetch(`/sessions/${toQuery(params)}`),
  get: (id) => apiFetch(`/sessions/${id}/`),
  log: (id, payload) => apiFetch(`/sessions/${id}/log/`, { method: 'POST', body: payload }),
  plan: (id, topicIds) => apiFetch(`/sessions/${id}/plan/`, { method: 'PUT', body: { topic_ids: topicIds } }),
  // Staff, directly.
  move: (id, payload, allowClash = false) =>
    apiFetch(`/sessions/${id}/move/`, { method: 'POST', body: { ...payload, allow_clash: allowClash } }),
  cancel: (id, reason) => apiFetch(`/sessions/${id}/cancel/`, { method: 'POST', body: { reason } }),
  // The session's tutor asks; kind 'MOVE' (with new_date, new_start_time,
  // new_end_time) or 'CANCEL'.
  requestChange: (id, payload) => apiFetch(`/sessions/${id}/change-requests/`, { method: 'POST', body: payload }),
}

export const sessionChangeRequestsApi = {
  list: (params = {}) => apiFetch(`/session-change-requests/${toQuery(params)}`),
  approve: (id, allowClash = false) =>
    apiFetch(`/session-change-requests/${id}/approve/`, { method: 'POST', body: { allow_clash: allowClash } }),
  reject: (id, reason) => apiFetch(`/session-change-requests/${id}/reject/`, { method: 'POST', body: { reason } }),
  withdraw: (id) => apiFetch(`/session-change-requests/${id}/withdraw/`, { method: 'POST' }),
}

export const clientsApi = {
  searchStudents: (q, page = 1) => apiFetch(`/students/${toQuery({ q, page })}`),
  getStudent: (id) => apiFetch(`/students/${id}/`),
  updateStudent: (id, payload) => apiFetch(`/students/${id}/`, { method: 'PATCH', body: payload }),
  getSubjectRoster: (subjectId) => apiFetch(`/subjects/${subjectId}/students/`),
}

// A student's assessment record: tutors' academic and behavioural comments.
// Append-only - there is no update or delete endpoint.
export const assessmentsApi = {
  listForStudent: (studentId, params = {}) => apiFetch(`/students/${studentId}/assessments/${toQuery(params)}`),
  create: (studentId, payload) => apiFetch(`/students/${studentId}/assessments/`, { method: 'POST', body: payload }),
}

export const enrollmentsApi = {
  list: (params = {}) => apiFetch(`/enrollments/${toQuery(params)}`),
  listForStudent: (studentId) => enrollmentsApi.list({ student: studentId }),
  create: (payload) => apiFetch('/enrollments/', { method: 'POST', body: payload }),
  withdraw: (id, reason) => apiFetch(`/enrollments/${id}/withdraw/`, { method: 'POST', body: { reason } }),
}

export const enquiriesApi = {
  list: (params = {}) => apiFetch(`/enquiries/${toQuery(params)}`),
  get: (id) => apiFetch(`/enquiries/${id}/`),
  create: (payload) => apiFetch('/enquiries/', { method: 'POST', body: payload }),
  update: (id, payload) => apiFetch(`/enquiries/${id}/`, { method: 'PATCH', body: payload }),
  changeStage: (id, newStage, note) =>
    apiFetch(`/enquiries/${id}/stage/`, { method: 'PATCH', body: { new_stage: newStage, note } }),
  generateInvoice: (id) => apiFetch(`/enquiries/${id}/generate-invoice/`, { method: 'POST' }),
}

export const billingApi = {
  listInvoices: (params = {}) => apiFetch(`/invoices/${toQuery(params)}`),
  getInvoice: (id) => apiFetch(`/invoices/${id}/`),
  recordPayment: (id, amount) =>
    apiFetch(`/invoices/${id}/record-payment/`, { method: 'POST', body: { amount } }),
}

// Company-wide figures for the Owner dashboard, summed server-side.
// Owner and SYS_ADMIN only - 403 for everyone else.
export const overviewApi = {
  get: (period) => apiFetch(`/overview/${toQuery({ period })}`),
}
