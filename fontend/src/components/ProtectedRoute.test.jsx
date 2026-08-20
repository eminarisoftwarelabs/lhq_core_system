import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProtectedRoute } from './ProtectedRoute'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderApp(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route path="/me" element={<div>Profile page</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Home</div>} />
          <Route element={<ProtectedRoute staffOnly />}>
            <Route path="/users" element={<div>Users list</div>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProtectedRoute', () => {
  it('redirects to /login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ status: 'unauthenticated', isAuthenticated: false, isStaffLevel: false })
    renderApp('/users')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('shows a loading state while auth status is resolving', () => {
    mockUseAuth.mockReturnValue({ status: 'loading', isAuthenticated: false, isStaffLevel: false })
    renderApp('/users')
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects a non-staff (Tutor) user away from a staffOnly route', () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', isAuthenticated: true, isStaffLevel: false })
    renderApp('/users')
    expect(screen.getByText('Profile page')).toBeInTheDocument()
    expect(screen.queryByText('Users list')).not.toBeInTheDocument()
  })

  it('lets a staff-level user through to a staffOnly route', () => {
    mockUseAuth.mockReturnValue({ status: 'authenticated', isAuthenticated: true, isStaffLevel: true })
    renderApp('/users')
    expect(screen.getByText('Users list')).toBeInTheDocument()
  })
})
