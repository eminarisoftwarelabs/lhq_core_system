import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function NavBar() {
  const { user, isStaffLevel, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="nav-bar">
      <div className="nav-bar__brand">LHQ Learning Hub</div>
      <nav className="nav-bar__links">
        {isStaffLevel && (
          <NavLink to="/users" className={({ isActive }) => (isActive ? 'active' : '')}>
            Users
          </NavLink>
        )}
        <NavLink to="/me" className={({ isActive }) => (isActive ? 'active' : '')}>
          My profile
        </NavLink>
      </nav>
      <div className="nav-bar__user">
        <span>{user?.full_name || user?.email}</span>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  )
}
