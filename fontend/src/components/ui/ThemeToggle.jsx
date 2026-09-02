import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../../theme/useTheme'

export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className={['icon-button', className].filter(Boolean).join(' ')}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun size={20} strokeWidth={1.75} aria-hidden="true" /> : <Moon size={20} strokeWidth={1.75} aria-hidden="true" />}
    </button>
  )
}
