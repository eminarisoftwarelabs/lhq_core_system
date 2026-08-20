import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { RequirePasswordChange } from './RequirePasswordChange'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderApp(initialPath) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/change-password" element={<div>Change password page</div>} />
        <Route element={<RequirePasswordChange />}>
          <Route path="/users" element={<div>Users list</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('RequirePasswordChange', () => {
  it('redirects to /change-password when the user must change their password', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, must_change_password: true } })
    renderApp('/users')
    expect(screen.getByText('Change password page')).toBeInTheDocument()
    expect(screen.queryByText('Users list')).not.toBeInTheDocument()
  })

  it('renders the guarded route when the flag is false', () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, must_change_password: false } })
    renderApp('/users')
    expect(screen.getByText('Users list')).toBeInTheDocument()
  })

  it('does not crash if user is not yet loaded', () => {
    mockUseAuth.mockReturnValue({ user: null })
    renderApp('/users')
    expect(screen.getByText('Users list')).toBeInTheDocument()
  })
})
