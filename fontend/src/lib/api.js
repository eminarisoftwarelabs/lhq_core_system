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
