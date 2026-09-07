import { useCallback, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { Header } from './layout/Header'
import { PageHeaderProvider } from './layout/PageHeaderProvider'
import { Sidebar } from './layout/Sidebar'

const SIDEBAR_COLLAPSED_KEY = 'lhq-sidebar-collapsed'

function getStoredSidebarCollapsed() {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    // localStorage unavailable (private browsing, disabled storage) - default
    // to expanded rather than failing.
    return false
  }
}

export function AppLayout() {
  const { user, isStaffLevel, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(getStoredSidebarCollapsed)

  // Close the mobile drawer whenever the route changes (link click, back
  // button, redirect) rather than only on explicit link clicks. Adjusting
  // state during render (rather than in an effect) avoids an extra
  // cascading render on every navigation.
  const [lastPathname, setLastPathname] = useState(location.pathname)
  if (location.pathname !== lastPathname) {
    setLastPathname(location.pathname)
    setIsMobileNavOpen(false)
  }

  const handleLogout = useCallback(async () => {
    await logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  const toggleSidebarCollapsed = useCallback(() => {
    setIsSidebarCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        // Ignore - the in-memory state still stays correct for this session.
      }
      return next
    })
  }, [])

  return (
    <div className={`app-shell${isSidebarCollapsed ? ' app-shell--sidebar-collapsed' : ''}`}>
      <Sidebar
        isStaffLevel={isStaffLevel}
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
      <div className="app-shell__main">
        <PageHeaderProvider>
          <Header
            user={user}
            onLogout={handleLogout}
            onOpenMenu={() => setIsMobileNavOpen(true)}
            isMobileNavOpen={isMobileNavOpen}
          />
          <main className="app-shell__content">
            <Outlet />
          </main>
        </PageHeaderProvider>
      </div>
    </div>
  )
}
