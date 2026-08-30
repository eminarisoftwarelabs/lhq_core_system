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
  // pulls out the tutor_profile id, since Subject.tutor references a
  // TutorProfile, not a User. `page=1` only - fine at this app's scale
  // (a single tutoring business's staff roster), not meant to scale past
  // one page of users.
  async listTeaching() {
    const res = await usersApi.list(1)
    return res.results
      .filter((u) => u.teaches)
      .map((u) => ({ id: u.tutor_profile.id, name: u.full_name || u.email }))
  },
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
  listSubjects: (params = {}) => apiFetch(`/subjects/${toQuery(params)}`),
  getSubject: (id) => apiFetch(`/subjects/${id}/`),
  createSubject: (payload) => apiFetch('/subjects/', { method: 'POST', body: payload }),
  updateSubject: (id, payload) => apiFetch(`/subjects/${id}/`, { method: 'PATCH', body: payload }),
  createTopic: (subjectId, payload) =>
    apiFetch(`/subjects/${subjectId}/topics/`, { method: 'POST', body: payload }),
  updateTopic: (id, payload) => apiFetch(`/topics/${id}/`, { method: 'PATCH', body: payload }),
  deleteTopic: (id) => apiFetch(`/topics/${id}/`, { method: 'DELETE' }),
}

export const clientsApi = {
  searchStudents: (q, page = 1) => apiFetch(`/students/${toQuery({ q, page })}`),
  getStudent: (id) => apiFetch(`/students/${id}/`),
  getStudentTimetable: (id) => apiFetch(`/students/${id}/timetable/`),
  getSubjectRoster: (subjectId) => apiFetch(`/subjects/${subjectId}/students/`),
}

export const enrollmentsApi = {
  listForStudent: (studentId) => apiFetch(`/enrollments/${toQuery({ student: studentId })}`),
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
