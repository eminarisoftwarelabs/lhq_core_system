import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ADMIN_USER, makeSession, makeSessionDetail, makeStudentSubject, TUTOR_USER } from '../test-utils/sessionFixtures'
import { TimetablePage } from './TimetablePage'

const mockListSessions = vi.fn()
const mockGetSession = vi.fn()
const mockListStudentSubjects = vi.fn()
const mockListRequests = vi.fn()
const mockFreeSlots = vi.fn()

vi.mock('../lib/api', () => ({
  sessionsApi: {
    list: (...a) => mockListSessions(...a),
    get: (...a) => mockGetSession(...a),
  },
  studentSubjectsApi: { list: (...a) => mockListStudentSubjects(...a) },
  sessionChangeRequestsApi: { list: (...a) => mockListRequests(...a) },
  tutorsApi: { getFreeSlots: (...a) => mockFreeSlots(...a) },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }))

// Renders the URL's query so tests can read what the page put there.
function LocationSpy() {
  return <output data-testid="location">{useLocation().search}</output>
}

const search = () => screen.getByTestId('location').textContent

function renderPage(path = '/timetable') {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="/timetable"
              element={
                <>
                  <TimetablePage />
                  <LocationSpy />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

const THIS_WEEK = '2026-11-16'
const weekSessions = [
  makeSession({ id: 1, date: '2026-11-16', display_status: 'HELD', status: 'HELD' }),
  makeSession({ id: 2, date: '2026-11-17', start_time: '10:00', end_time: '11:00', display_status: 'UNLOGGED' }),
  makeSession({
    id: 3,
    date: '2026-11-19',
    display_status: 'SCHEDULED',
    pending_request: { id: 9, kind: 'CANCEL', reason: 'Ill' },
    student: { id: 2, name: 'Grace Chirwa', student_number: 'STU-2' },
  }),
  makeSession({ id: 4, date: '2026-11-22', display_status: 'MOVED', status: 'CANCELLED' }),
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0)) // Wednesday 18 Nov 2026
  mockUseAuth.mockReturnValue({ user: ADMIN_USER, isStaffLevel: true })
  mockListSessions.mockReset().mockResolvedValue(weekSessions)
  mockListStudentSubjects.mockReset().mockResolvedValue([
    makeStudentSubject(),
    makeStudentSubject({ id: 8, student: { id: 2, name: 'Grace Chirwa' }, tutor: { id: 5, name: 'Ms Phiri' } }),
  ])
  mockListRequests.mockReset().mockResolvedValue([{ id: 9 }, { id: 10 }])
  mockFreeSlots.mockReset().mockResolvedValue({
    week_start: THIS_WEEK,
    days: Array.from({ length: 7 }, (_, i) => ({
      weekday: i,
      free: i === 0 ? [{ start_time: '14:00', end_time: '16:00' }] : [],
    })),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('TimetablePage for staff (master timetable)', () => {
  it('shows the whole week, Monday to Sunday, each session in its day with a status', async () => {
    renderPage()

    expect(await screen.findByText('16 – 22 Nov 2026')).toBeInTheDocument()
    expect(screen.getByText('This week')).toBeInTheDocument()
    expect(mockListSessions).toHaveBeenCalledWith({ from: THIS_WEEK, to: '2026-11-22', tutor: '', subject: '', student: '' })

    const monday = screen.getByTestId('tt-day-0')
    const block = within(monday).getByRole('button', { name: /IGCSE Physics, Takondwa Banda/ })
    expect(block).toHaveAccessibleName(/Mon 16 Nov 16:00–17:00, Mr Banda, Held/)
    expect(block.closest('.tt-session')).toHaveClass('tt-session--held')

    expect(within(screen.getByTestId('tt-day-1')).getByRole('button')).toHaveAccessibleName(/Unlogged/)
    expect(within(screen.getByTestId('tt-day-3')).getByRole('button')).toHaveAccessibleName(/change requested/)
    expect(within(screen.getByTestId('tt-day-6')).getByRole('button').closest('.tt-session')).toHaveClass('tt-session--moved')
    expect(screen.getByText('1 unlogged')).toBeInTheDocument()
  })

  it('has a key for every status colour', async () => {
    renderPage()
    const legend = await screen.findByRole('list', { name: 'Key' })
    for (const label of ['Scheduled', 'Unlogged', 'Held', 'Not held', 'Cancelled', 'Moved']) {
      expect(within(legend).getByText(label)).toBeInTheDocument()
    }
    expect(within(legend).queryByText('Free time')).not.toBeInTheDocument()
  })

  it('steps weeks and keeps the week in the URL', async () => {
    renderPage()
    await screen.findByText('16 – 22 Nov 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await screen.findByText('23 – 29 Nov 2026')).toBeInTheDocument()
    expect(search()).toContain('week=2026-11-23')
    expect(mockListSessions).toHaveBeenLastCalledWith(expect.objectContaining({ from: '2026-11-23', to: '2026-11-29' }))
    fireEvent.click(screen.getByRole('button', { name: 'This week' }))
    expect(await screen.findByText('16 – 22 Nov 2026')).toBeInTheDocument()
  })

  it('filters by tutor, subject and student, from what is actually booked', async () => {
    renderPage()
    const tutor = await screen.findByRole('combobox', { name: 'Tutor' })
    await waitFor(() => expect(within(tutor).getByRole('option', { name: 'Ms Phiri' })).toBeInTheDocument())
    fireEvent.change(tutor, { target: { value: '5' } })
    await waitFor(() => expect(mockListSessions).toHaveBeenLastCalledWith(expect.objectContaining({ tutor: '5' })))
    expect(search()).toContain('tutor=5')
    expect(within(screen.getByRole('combobox', { name: 'Student' })).getByRole('option', { name: 'Grace Chirwa' })).toBeInTheDocument()
    expect(within(screen.getByRole('combobox', { name: 'Subject' })).getByRole('option', { name: 'IGCSE Physics' })).toBeInTheDocument()
  })

  it('links to pending requests with a count, and has no booking link (booking starts on the student page)', async () => {
    renderPage()
    expect(await screen.findByRole('link', { name: /Requests \(2\)/ })).toHaveAttribute('href', '/timetable/requests')
    expect(screen.queryByRole('link', { name: /Book a student/ })).not.toBeInTheDocument()
  })

  it('opens a session in the panel, and the URL remembers it', async () => {
    mockGetSession.mockResolvedValue(makeSessionDetail({ id: 1 }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /IGCSE Physics, Takondwa Banda, Mon 16 Nov/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(search()).toContain('session=1')
    expect(mockGetSession).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an empty week plainly', async () => {
    mockListSessions.mockResolvedValueOnce([])
    renderPage()
    expect(await screen.findByText('No sessions this week.')).toBeInTheDocument()
  })

  it('shows a load failure', async () => {
    mockListSessions.mockRejectedValue(new Error('offline'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the timetable.')
  })
})

describe('TimetablePage for a tutor', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ user: TUTOR_USER, isStaffLevel: false })
  })

  it('shows their own week with free time shaded and no staff tools', async () => {
    renderPage()
    await screen.findByText('16 – 22 Nov 2026')
    await waitFor(() => expect(within(screen.getByTestId('tt-day-0')).getAllByTestId('tt-free')).toHaveLength(1))
    expect(mockFreeSlots).toHaveBeenCalledWith(4, THIS_WEEK)
    expect(mockListSessions).toHaveBeenCalledWith({ from: THIS_WEEK, to: '2026-11-22' })
    expect(within(screen.getByRole('list', { name: 'Key' })).getByText('Free time')).toBeInTheDocument()

    expect(screen.queryByRole('combobox', { name: 'Tutor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Requests/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Book a student/ })).not.toBeInTheDocument()
    expect(mockListStudentSubjects).not.toHaveBeenCalled()
    expect(mockListRequests).not.toHaveBeenCalled()
  })

  it('switches the visible day on a phone', async () => {
    renderPage()
    await screen.findByText('16 – 22 Nov 2026')
    const tabs = screen.getByRole('group', { name: 'Day' })
    expect(within(tabs).getByRole('button', { name: 'Wed' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('tt-day-0')).toHaveClass('tt-grid__hide-mobile')
    fireEvent.click(within(tabs).getByRole('button', { name: 'Mon' }))
    expect(screen.getByTestId('tt-day-0')).not.toHaveClass('tt-grid__hide-mobile')
  })
})
