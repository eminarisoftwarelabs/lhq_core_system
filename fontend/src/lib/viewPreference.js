// A per-browser choice between two views of a page, kept in localStorage.
// Storage can be missing or throw (private windows, blocked site data), so
// every access is wrapped and the page falls back to the default.

export function readView(key, allowed, fallback) {
  try {
    const value = window.localStorage.getItem(key)
    return allowed.includes(value) ? value : fallback
  } catch {
    return fallback
  }
}

export function writeView(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Not remembering the choice is fine.
  }
}
