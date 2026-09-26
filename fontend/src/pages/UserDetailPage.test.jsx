import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserDetailPage } from './UserDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'

const mockGet = vi.fn()
vi.mock('../lib/api', () => ({
  usersApi: { get: (...args) => mockGet(...args), update: vi.fn() },
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: { id: 1, role: 'OWNER' } }),
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
  tutor_profile: { hourly_rate: '40.00', is_available: true },
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
})
