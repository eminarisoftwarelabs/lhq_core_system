import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ChangePasswordPage } from './ChangePasswordPage'
import { ApiError } from '../lib/apiClient'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockChangePassword = vi.fn()
vi.mock('../lib/api', () => ({
  authApi: { changePassword: (...args) => mockChangePassword(...args) },
}))

function fillAndSubmit({ current = 'StartingPassw0rd!', next = 'BrandNewPassw0rd!', confirm = next }) {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } })
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

function renderPage(user) {
  const mockSetUser = vi.fn()
  const mockLogout = vi.fn().mockResolvedValue(undefined)
  mockUseAuth.mockReturnValue({ user, setUser: mockSetUser, logout: mockLogout })
  render(
    <MemoryRouter>
      <ChangePasswordPage />
    </MemoryRouter>,
  )
  return { mockSetUser, mockLogout }
}

describe('ChangePasswordPage', () => {
  it('shows the forced-change message when must_change_password is true', () => {
    renderPage({ id: 1, must_change_password: true })
    expect(screen.getByText(/you need to set a new password/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument()
  })

  it('shows the voluntary-change heading when must_change_password is false', () => {
    renderPage({ id: 1, must_change_password: false })
    expect(screen.getByRole('heading', { name: 'Change your password' })).toBeInTheDocument()
    expect(screen.queryByText(/you need to set a new password/i)).not.toBeInTheDocument()
  })

  it('blocks submission client-side when new and confirm do not match, without calling the API', async () => {
    renderPage({ id: 1, must_change_password: true })

    fillAndSubmit({ next: 'BrandNewPassw0rd!', confirm: 'Mismatch123!' })

    expect(await screen.findByText(/do not match/i)).toBeInTheDocument()
    expect(mockChangePassword).not.toHaveBeenCalled()
  })

  it('renders server-side field errors for current_password and new_password', async () => {
    mockChangePassword.mockRejectedValueOnce(
      new ApiError(400, { current_password: ['Incorrect password.'] }),
    )
    renderPage({ id: 1, must_change_password: true })

    fillAndSubmit({})

    expect(await screen.findByText('Incorrect password.')).toBeInTheDocument()
  })

  it('on success, clears the flag via setUser with a new object and navigates home', async () => {
    mockChangePassword.mockResolvedValueOnce(null)
    const { mockSetUser } = renderPage({ id: 1, must_change_password: true })

    fillAndSubmit({})

    await waitFor(() => expect(mockChangePassword).toHaveBeenCalledWith('StartingPassw0rd!', 'BrandNewPassw0rd!'))
    expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })

    const updater = mockSetUser.mock.calls[0][0]
    const before = { id: 1, must_change_password: true }
    const after = updater(before)
    expect(after).not.toBe(before)
    expect(after.must_change_password).toBe(false)
  })

  it('logs out via the escape hatch button', async () => {
    const { mockLogout } = renderPage({ id: 1, must_change_password: true })

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    await waitFor(() => expect(mockLogout).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })
})
