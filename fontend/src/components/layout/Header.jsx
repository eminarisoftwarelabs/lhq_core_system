import { Menu } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { UserMenu } from './UserMenu'

export function Header({ user, onLogout, onOpenMenu, isMobileNavOpen }) {
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

      <div className="app-header__spacer" />

      <ThemeToggle />
      <UserMenu user={user} onLogout={onLogout} />
    </header>
  )
}
