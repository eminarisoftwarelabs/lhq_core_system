import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'

const me = {
  id: 2,
  email: 'tam@lhq.test',
  full_name: 'Tam Tutor',
  role: 'TUTOR',
  is_active: true,
  teaches: true,
  phone: '0999 123 456',
  employee_id: 'EMP-7',
  employment_type: 'PART_TIME',
  start_date: '2025-01-06',
  address: '',
  tutor_profile: { hourly_rate: '40.00', is_available: true },
}

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({ user: me, setUser: vi.fn() }),
}))

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter>
          <ProfilePage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

describe('ProfilePage', () => {
  it('shows an identity header with name, role, status, and contact details', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Tam Tutor' })).toBeInTheDocument()
    expect(screen.getByText('TT')).toHaveClass('avatar-badge')
    expect(screen.getByText('Tutor')).toBeInTheDocument()
    expect(screen.getByText('Active')).toHaveClass('user-status-badge--active')
    expect(screen.getByText('Teaches')).toHaveClass('role-badge')
    expect(screen.getByText('tam@lhq.test')).toBeInTheDocument()
    expect(screen.getByText('0999 123 456')).toBeInTheDocument()
    expect(screen.getByText('EMP-7 · Part time · Since Jan 6, 2025')).toBeInTheDocument()
  })

  it('offers Change password as a header action', () => {
    renderPage()

    expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/change-password')
  })

  it('renders the self-edit form inside a card', () => {
    const { container } = renderPage()

    expect(container.querySelector('.form-card form')).not.toBeNull()
    expect(screen.getByLabelText('Full name')).toHaveValue('Tam Tutor')
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument()
  })
})
