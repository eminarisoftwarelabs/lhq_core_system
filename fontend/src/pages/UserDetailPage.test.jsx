import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserDetailPage } from './UserDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'

// The panel has its own tests; here it only matters that the page shows it
// for a teaching account, with the right mode.
vi.mock('../components/tutors/TutorTeachingPanel', () => ({
  TutorTeachingPanel: ({ tutorId, mode }) => (
    <div data-testid="teaching-panel" data-tutor={tutorId} data-mode={mode} />
  ),
}))


const mockGet = vi.fn()
vi.mock('../lib/api', () => ({
  usersApi: { get: (...args) => mockGet(...args), update: vi.fn() },
}))

let mockActorRole = 'OWNER'
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role: mockActorRole } }),
}))

const deactivatedTutor = {
  id: 2,
  email: 'tam@lhq.test',
  full_name: 'Tam Tutor',
  role: 'TUTOR',
  is_active: false,
  teaches: true,
  phone: '',
  employee_id: null,
  employment_type: '',
  start_date: null,
  address: '',
  tutor_profile: { id: 44, hourly_rate: '40.00', is_available: true },
}

function renderAt(path) {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/users/:id" element={<UserDetailPage />} />
            <Route path="/me" element={<p>my profile</p>} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(deactivatedTutor)
})

describe('UserDetailPage', () => {
  it('shows the user header with a deactivated badge and a back link', async () => {
    renderAt('/users/2')

    expect(await screen.findByRole('heading', { name: 'Tam Tutor' })).toBeInTheDocument()
    expect(screen.getByText('Deactivated')).toHaveClass('user-status-badge--inactive')
    expect(screen.getByRole('link', { name: 'All users' })).toHaveAttribute('href', '/users')
    // No phone or employment on file: those meta lines are omitted, not blank.
    expect(screen.queryByText(/Since/)).not.toBeInTheDocument()
  })

  it('renders the staff edit form in a card', async () => {
    const { container } = renderAt('/users/2')
    await screen.findByRole('heading', { name: 'Tam Tutor' })

    expect(container.querySelector('.form-card form')).not.toBeNull()
    expect(screen.getByLabelText('Role')).toHaveValue('TUTOR')
    expect(screen.getByLabelText('Active')).not.toBeChecked()
  })

  it('redirects the actor\'s own id to /me', async () => {
    renderAt('/users/1')

    expect(await screen.findByText('my profile')).toBeInTheDocument()
  })

  it('shows not found for a 404', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockGet.mockRejectedValue(new ApiError(404, { detail: 'Not found.' }))
    renderAt('/users/99')

    expect(await screen.findByText('User not found.')).toBeInTheDocument()
  })

  it('shows the subjects and working hours panel for a teaching account, in direct mode', async () => {
    renderAt('/users/2')
    const panel = await screen.findByTestId('teaching-panel')
    expect(panel).toHaveAttribute('data-tutor', '44')
    expect(panel).toHaveAttribute('data-mode', 'direct')
  })

  it('shows the panel read-only to an Admin looking at an Owner who teaches', async () => {
    mockActorRole = 'ADMIN'
    mockGet.mockResolvedValue({ ...deactivatedTutor, role: 'OWNER' })
    renderAt('/users/2')
    expect(await screen.findByTestId('teaching-panel')).toHaveAttribute('data-mode', 'readonly')
    mockActorRole = 'OWNER'
  })

  it('shows no panel for an account that does not teach', async () => {
    mockGet.mockResolvedValue({ ...deactivatedTutor, teaches: false, tutor_profile: null })
    renderAt('/users/2')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByTestId('teaching-panel')).not.toBeInTheDocument()
  })
})
