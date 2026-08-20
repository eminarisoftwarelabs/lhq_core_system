import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokenStorage'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'

// Paths that never carry an Authorization header and never trigger the
// refresh-and-retry flow on 401.
const PUBLIC_PATHS = new Set(['/auth/login/', '/auth/token/refresh/', '/auth/setup-password/'])

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.detail) || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

let authFailureHandler = () => {}

// Registered by AuthContext so a failed refresh (or a retried request that
// still 401s) can clear app-level auth state, not just stored tokens.
export function setAuthFailureHandler(handler) {
  authFailureHandler = handler
}

async function parseBody(res) {
  if (res.status === 204) return null
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function rawFetch(path, { method, body, isPublic }) {
  const headers = { 'Content-Type': 'application/json' }
  if (!isPublic) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return res
}

// Single-flight refresh: concurrent 401s share one refresh call instead of
// each racing to rotate the (single-use) refresh token.
let refreshPromise = null

async function doRefresh() {
  const refresh = getRefreshToken()
  if (!refresh) {
    throw new ApiError(401, { detail: 'No refresh token available.' })
  }
  const res = await rawFetch('/auth/token/refresh/', {
    method: 'POST',
    body: { refresh },
    isPublic: true,
  })
  const data = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(res.status, data)
  }
  setTokens({ access: data.access, refresh: data.refresh })
  return data.access
}

function refreshTokens() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

export async function apiFetch(path, { method = 'GET', body, skipAuth } = {}) {
  const isPublic = skipAuth ?? PUBLIC_PATHS.has(path)

  let res = await rawFetch(path, { method, body, isPublic })

  if (res.status === 401 && !isPublic) {
    try {
      await refreshTokens()
    } catch {
      clearTokens()
      authFailureHandler()
      throw new ApiError(401, { detail: 'Session expired.' })
    }
    res = await rawFetch(path, { method, body, isPublic })
    if (res.status === 401) {
      clearTokens()
      authFailureHandler()
      const data = await parseBody(res)
      throw new ApiError(401, data)
    }
  }

  const data = await parseBody(res)
  if (!res.ok) {
    throw new ApiError(res.status, data)
  }
  return data
}
