import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function ProtectedRoute({ staffOnly = false }) {
  const { status, isAuthenticated, isStaffLevel } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <div className="page-loading">Loading…</div>
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (staffOnly && !isStaffLevel) {
    return <Navigate to="/me" replace />
  }

  return <Outlet />
}
