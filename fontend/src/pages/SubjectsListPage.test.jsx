import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectsListPage } from './SubjectsListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockListSubjects = vi.fn()
vi.mock('../lib/api', () => ({
  academicsApi: {
    listSubjects: (...args) => mockListSubjects(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter>
        <SubjectsListPage />
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockListSubjects.mockReset()
  mockListSubjects.mockResolvedValue({
    count: 1,
    results: [
      {
        id: 1,
        name: 'Maths',
        tutor_name: 'Tam Tutor',
        is_active: true,
        timetable_slot: { day_of_week: 1, start_time: '14:00:00', end_time: '15:00:00' },
      },
    ],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectsListPage', () => {
  it('shows the "Add subject" link for staff', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: true })
    renderPage()

    expect(await screen.findByText('Maths')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add subject' })).toBeInTheDocument()
  })

  it('hides the "Add subject" link for a Tutor', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    renderPage()

    await screen.findByText('Maths')
    expect(screen.queryByRole('link', { name: 'Add subject' })).not.toBeInTheDocument()
  })

  it('shows the tutor name and formatted timetable slot', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: true })
    renderPage()

    await screen.findByText('Maths')
    expect(screen.getByText('Tam Tutor')).toBeInTheDocument()
    expect(screen.getByText('14:00–15:00')).toBeInTheDocument()
  })
})
