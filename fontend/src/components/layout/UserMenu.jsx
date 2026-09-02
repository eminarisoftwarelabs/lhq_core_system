import { CircleUserRound, LogOut, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { roleLabel } from '../../auth/permissions'
import { Button } from '../ui/Button'

export function UserMenu({ user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  if (!user) return null

  const displayName = user.full_name || user.email
  const label = roleLabel(user.role)

  function closeMenu() {
    setIsOpen(false)
  }

  async function handleLogoutClick() {
    closeMenu()
    await onLogout()
  }

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-button user-menu__trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="user-menu-panel"
        aria-label={`Account menu for ${displayName}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <CircleUserRound size={24} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {isOpen && (
        <div id="user-menu-panel" role="menu" className="user-menu__panel" aria-label="Account">
          <div className="user-menu__identity">
            <span className="user-menu__avatar" aria-hidden="true">
              <UserRound size={18} strokeWidth={1.75} />
            </span>
            <span className="user-menu__identity-text">
              <span className="user-menu__name">{displayName}</span>
              <span className="user-menu__role">{label}</span>
            </span>
          </div>

          <Link to="/me" role="menuitem" className="user-menu__item" onClick={closeMenu}>
            My profile
          </Link>

          <Button variant="ghost" role="menuitem" className="user-menu__item user-menu__item--danger" onClick={handleLogoutClick}>
            <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            Log out
          </Button>
        </div>
      )}
    </div>
  )
}
