import { useCallback, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from './context'

const STORAGE_KEY = 'lhq-theme'

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    // localStorage unavailable (private browsing, disabled storage) - fall
    // back to following the OS preference.
    return null
  }
}

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// A stored value means the user explicitly picked a theme via ThemeToggle,
// and it's pinned regardless of OS preference from then on. With nothing
// stored, index.html's inline script leaves the `data-theme` attribute
// unset so the CSS `prefers-color-scheme` media query keeps following the
// OS live - state here still resolves to a concrete value for ThemeToggle's
// icon/label to show the theme that's actually rendered.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => getStoredTheme() ?? getSystemTheme())
  const [isExplicit, setIsExplicit] = useState(() => getStoredTheme() !== null)

  useEffect(() => {
    if (!isExplicit) return undefined
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // Ignore - the in-memory state and DOM attribute still stay correct
      // for this session even if persistence fails.
    }
    return undefined
  }, [theme, isExplicit])

  useEffect(() => {
    if (isExplicit) return undefined
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event) => setTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [isExplicit])

  const toggleTheme = useCallback(() => {
    setIsExplicit(true)
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }, [])

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
