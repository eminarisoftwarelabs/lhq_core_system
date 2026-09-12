import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TimetablePage } from './TimetablePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockListAllSubjects = vi.fn()
const mockUpdateSubject = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    listAllSubjects: (...args) => mockListAllSubjects(...args),
    updateSubject: (...args) => mockUpdateSubject(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const maths = {
  id: 1,
  name: 'Maths',
  tutor: 9,
  tutor_name: 'Tam Tutor',
  is_active: true,
  timetable_slot: { day_of_week: 1, start_time: '14:00:00', end_time: '15:00:00' },
  topics: [],
}
const english = {
  id: 2,
  name: 'English',
  tutor: null,
  tutor_name: null,
  is_active: true,
  timetable_slot: { day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00' },
  topics: [],
}
const chemistry = {
  id: 3,
  name: 'Chemistry',
  tutor: 9,
  tutor_name: 'Tam Tutor',
  is_active: true,
  timetable_slot: null,
  topics: [],
}

function renderPage(initialEntries = ['/timetable']) {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <TimetablePage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ isStaffLevel: true })
  mockListAllSubjects.mockReset().mockResolvedValue([maths, english, chemistry])
  mockUpdateSubject.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TimetablePage', () => {
  it('shows all seven days, each scheduled subject under its day sorted by start time', async () => {
    renderPage()

    for (const label of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
      expect(await screen.findByText(label)).toBeInTheDocument()
    }

    const tuesdayHeading = screen.getByText('Tuesday')
    const tuesdayColumn = tuesdayHeading.closest('.timetable-day')
    const names = within(tuesdayColumn).getAllByText(/^(Maths|English)$/).map((el) => el.textContent)
    expect(names).toEqual(['English', 'Maths'])
  })

  it('lists Chemistry under Unscheduled subjects, not on the board', async () => {
    renderPage()

    expect(await screen.findByText('Unscheduled subjects')).toBeInTheDocument()
    const unscheduledSection = screen.getByText('Unscheduled subjects').closest('.timetable-unscheduled')
    expect(within(unscheduledSection).getByText('Chemistry')).toBeInTheDocument()
  })

  it('opens a pre-filled editor when a staff user clicks a scheduled subject, and saves it', async () => {
    mockUpdateSubject.mockResolvedValue({ ...maths, timetable_slot: { day_of_week: 1, start_time: '16:00:00', end_time: '17:00:00' } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Maths/ }))

    expect(screen.getByLabelText('Start time')).toHaveValue('14:00')
    expect(screen.getByLabelText('End time')).toHaveValue('15:00')

    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '16:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '17:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save slot' }))

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(1, {
        timetable_slot: { day_of_week: 1, start_time: '16:00', end_time: '17:00' },
      }),
    )
    expect(await screen.findByText('Timetable slot saved for Maths')).toBeInTheDocument()
  })

  it('shows a Remove slot button only for a subject that already has a slot, and removes it', async () => {
    mockUpdateSubject.mockResolvedValue({ ...maths, timetable_slot: null })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Maths/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove slot' }))

    await waitFor(() => expect(mockUpdateSubject).toHaveBeenCalledWith(1, { timetable_slot: null }))
    expect(await screen.findByText('Timetable slot removed for Maths')).toBeInTheDocument()
  })

  it('sets a new slot for an unscheduled subject from the "Set slot" button', async () => {
    mockUpdateSubject.mockResolvedValue({ ...chemistry, timetable_slot: { day_of_week: 3, start_time: '10:00:00', end_time: '11:00:00' } })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'Set slot' }))
    expect(screen.queryByRole('button', { name: 'Remove slot' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '11:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save slot' }))

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(3, {
        timetable_slot: { day_of_week: 3, start_time: '10:00', end_time: '11:00' },
      }),
    )
  })

  it('closes the editor on Cancel without saving', async () => {
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: /Maths/ }))
    expect(screen.getByLabelText('Start time')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Start time')).not.toBeInTheDocument()
    expect(mockUpdateSubject).not.toHaveBeenCalled()
  })

  it('auto-opens the editor for ?subject=<id> deep-linked from SubjectDetailPage', async () => {
    renderPage(['/timetable?subject=3'])

    expect(await screen.findByLabelText('Day')).toBeInTheDocument()
    expect(screen.getAllByText('Chemistry').length).toBeGreaterThan(0)
  })

  it('renders scheduled subjects as plain (non-interactive) rows for a non-staff Tutor', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    renderPage()

    await screen.findByText('Maths')
    expect(screen.queryByRole('button', { name: /Maths/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set slot' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add subject' })).not.toBeInTheDocument()
  })

  it('shows an "Add subject" link to staff in the toolbar', async () => {
    renderPage()

    expect(await screen.findByRole('link', { name: /Add subject/ })).toHaveAttribute('href', '/subjects/new')
  })

  it('shows an empty state when there are no subjects at all', async () => {
    mockListAllSubjects.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('No subjects to schedule yet.')).toBeInTheDocument()
  })

  it('shows an error message if the timetable fails to load', async () => {
    mockListAllSubjects.mockRejectedValue(new ApiError(500, { detail: 'Server error.' }))
    renderPage()

    expect(await screen.findByText('Server error.')).toBeInTheDocument()
  })
})
