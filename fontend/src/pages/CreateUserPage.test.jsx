import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateUserPage } from './CreateUserPage'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockCreate = vi.fn()
vi.mock('../lib/api', () => ({
  usersApi: { create: (...args) => mockCreate(...args) },
}))

beforeEach(() => {
  mockNavigate.mockClear()
  mockCreate.mockReset()
})

function renderWithActor(role) {
  mockUseAuth.mockReturnValue({ user: { id: 1, role } })
  return render(
    <MemoryRouter>
      <CreateUserPage />
    </MemoryRouter>,
  )
}

describe('CreateUserPage role dropdown gating', () => {
  it('an Admin only ever sees TUTOR as a creatable role', () => {
    renderWithActor('ADMIN')

    const roleSelect = screen.getByLabelText('Role')
    const optionValues = [...roleSelect.querySelectorAll('option')].map((o) => o.value)
    expect(optionValues).toEqual(['TUTOR'])
  })

  it('an Owner sees ADMIN and TUTOR, never OWNER or SYS_ADMIN', () => {
    renderWithActor('OWNER')

    const roleSelect = screen.getByLabelText('Role')
    const optionValues = [...roleSelect.querySelectorAll('option')].map((o) => o.value)
    expect(optionValues).toEqual(['TUTOR', 'ADMIN'])
  })

  it('a SYS_ADMIN sees every role', () => {
    renderWithActor('SYS_ADMIN')

    const roleSelect = screen.getByLabelText('Role')
    const optionValues = [...roleSelect.querySelectorAll('option')].map((o) => o.value)
    expect(optionValues).toEqual(['TUTOR', 'ADMIN', 'OWNER', 'SYS_ADMIN'])
  })

  it('shows an explanatory message instead of a form for an actor who can create nobody', () => {
    renderWithActor('TUTOR')

    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument()
    expect(screen.getByText(/don.t have permission to create any accounts/i)).toBeInTheDocument()
  })

  it('the tutor-profile fields default open when TUTOR is the (only) selected role, with no checkbox needed', () => {
    renderWithActor('ADMIN')

    expect(screen.getByLabelText('Hourly rate')).toBeInTheDocument()
    expect(screen.queryByLabelText(/also teaches/i)).not.toBeInTheDocument()
  })

  it('tutor-profile fields are hidden by default for a non-Tutor role and appear once "also teaches" is checked', () => {
    renderWithActor('OWNER')

    // Default selected role is the first assignable one, TUTOR, so the
    // fields start visible; switch to ADMIN to exercise the checkbox path.
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'ADMIN' } })

    expect(screen.queryByLabelText('Hourly rate')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/also teaches/i)).toBeInTheDocument()
  })
})

describe('CreateUserPage submission', () => {
  it('returns to the users list (not the new user\'s edit page) after a successful create', async () => {
    mockCreate.mockResolvedValueOnce({ id: 4, email: 'johndoe@gmail.com', full_name: 'John Doe', role: 'TUTOR' })
    renderWithActor('ADMIN')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'johndoe@gmail.com' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'John Doe' } })
    fireEvent.change(screen.getByLabelText('Starting password'), { target: { value: 'TemporaryPassw0rd!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockNavigate).toHaveBeenCalledWith('/users', { replace: true })
    expect(mockNavigate).not.toHaveBeenCalledWith(expect.stringMatching(/^\/users\/\d+$/), expect.anything())
  })
})

describe('CreateUserPage starting password field', () => {
  it('is required and included in the submitted payload', async () => {
    mockCreate.mockResolvedValueOnce({ id: 5 })
    renderWithActor('ADMIN')

    const passwordInput = screen.getByLabelText('Starting password')
    expect(passwordInput).toBeRequired()
    expect(passwordInput).toHaveAttribute('type', 'password')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'A B' } })
    fireEvent.change(passwordInput, { target: { value: 'TemporaryPassw0rd!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1))
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ password: 'TemporaryPassw0rd!' })
  })

  it('renders a server-side password validation error', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockCreate.mockRejectedValueOnce(new ApiError(400, { password: ['This password is too common.'] }))
    renderWithActor('ADMIN')

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'A B' } })
    fireEvent.change(screen.getByLabelText('Starting password'), { target: { value: 'password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByText('This password is too common.')).toBeInTheDocument()
  })
})
