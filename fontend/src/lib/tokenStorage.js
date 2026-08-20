const ACCESS_KEY = 'lhq.access'
const REFRESH_KEY = 'lhq.refresh'

function readStorage(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

let accessToken = readStorage(ACCESS_KEY)
let refreshToken = readStorage(REFRESH_KEY)

export function getAccessToken() {
  return accessToken
}

export function getRefreshToken() {
  return refreshToken
}

export function setTokens({ access, refresh } = {}) {
  if (access !== undefined) {
    accessToken = access
    try {
      if (access) window.localStorage.setItem(ACCESS_KEY, access)
      else window.localStorage.removeItem(ACCESS_KEY)
    } catch {
      // localStorage unavailable (e.g. private mode) — in-memory token still works
    }
  }
  if (refresh !== undefined) {
    refreshToken = refresh
    try {
      if (refresh) window.localStorage.setItem(REFRESH_KEY, refresh)
      else window.localStorage.removeItem(REFRESH_KEY)
    } catch {
      // ignore
    }
  }
}

export function clearTokens() {
  setTokens({ access: null, refresh: null })
}
