import { ArrowLeft, Menu } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getGreeting } from '../../lib/greeting'
import { usePageHeaderContext } from './usePageHeaderContext'
import { ThemeToggle } from '../ui/ThemeToggle'
import { UserMenu } from './UserMenu'

// The dashboard route only - every other page shows its own title (with a
// back arrow) in this same spot instead, via usePageTitle.
const GREETING_PATH = '/'

export function Header({ user, onLogout, onOpenMenu, isMobileNavOpen }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { title } = usePageHeaderContext()
  const isDashboard = location.pathname === GREETING_PATH
  const displayName = user?.full_name || user?.email

  return (
    <header className="app-header">
      <button
        type="button"
        className="icon-button app-header__menu-toggle"
        aria-label="Open navigation menu"
        aria-haspopup="true"
        aria-expanded={isMobileNavOpen}
        aria-controls="primary-navigation"
        onClick={onOpenMenu}
      >
        <Menu size={22} strokeWidth={1.75} aria-hidden="true" />
      </button>

      <div className="app-header__spacer">
        {isDashboard && (
          <p className="app-header__greeting">
            {getGreeting()}, {displayName}
          </p>
        )}
        {!isDashboard && title && (
          <>
            <button
              type="button"
              className="icon-button app-header__back"
              aria-label="Go back"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <h1 className="app-header__title">{title}</h1>
          </>
        )}
      </div>

      <ThemeToggle />
      <UserMenu user={user} onLogout={onLogout} />
    </header>
  )
}
