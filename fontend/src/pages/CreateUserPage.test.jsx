import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CreateUserPage } from './CreateUserPage'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

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
