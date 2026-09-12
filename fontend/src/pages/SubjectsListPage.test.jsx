import { fireEvent, render, screen } from '@testing-library/react'
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
  mockUseAuth.mockReturnValue({ isStaffLevel: true })
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

  it('shows the subject count, tutor name, status badge, and formatted timetable slot', async () => {
    renderPage()

    expect(await screen.findByText('Maths')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Tam Tutor')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Tuesday 14:00–15:00')).toBeInTheDocument()
  })

  it('shows "Unassigned" and "Inactive" for a subject with no tutor that is not active', async () => {
    mockListSubjects.mockResolvedValue({
      count: 1,
      results: [{ id: 2, name: 'Physics', tutor_name: null, is_active: false, timetable_slot: null }],
    })
    renderPage()

    expect(await screen.findByText('Physics')).toBeInTheDocument()
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('No timetable slot')).toBeInTheDocument()
  })

  it('shows a message when no subjects are found', async () => {
    mockListSubjects.mockResolvedValue({ count: 0, results: [] })
    renderPage()

    expect(await screen.findByText('No subjects found.')).toBeInTheDocument()
  })

  it('shows Previous/Next controls once there is more than one page', async () => {
    mockListSubjects.mockImplementation(({ page } = {}) =>
      Promise.resolve(
        page === 2
          ? {
              count: 21,
              next: null,
              previous: 'http://testserver/api/subjects/?page=1',
              results: [{ id: 2, name: 'Page Two Subject', tutor_name: null, is_active: true, timetable_slot: null }],
            }
          : {
              count: 21,
              next: 'http://testserver/api/subjects/?page=2',
              previous: null,
              results: [{ id: 1, name: 'Page One Subject', tutor_name: null, is_active: true, timetable_slot: null }],
            },
      ),
    )
    renderPage()

    expect(await screen.findByText('Page One Subject')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Page Two Subject')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
