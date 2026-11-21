import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentDetailPage } from './StudentDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { makeSession } from '../test-utils/sessionFixtures'

const mockGetStudent = vi.fn()
const mockListStudentSubjects = vi.fn()
const mockConfirmEnd = vi.fn()
const mockAddSessions = vi.fn()
const mockListForStudent = vi.fn()
const mockListAssessments = vi.fn()
const mockListSessions = vi.fn()
const mockUpdateStudent = vi.fn()

vi.mock('../lib/api', () => ({
  assessmentsApi: {
    listForStudent: (...args) => mockListAssessments(...args),
  },
  clientsApi: {
    getStudent: (...args) => mockGetStudent(...args),
    updateStudent: (...args) => mockUpdateStudent(...args),
  },
  sessionsApi: {
    list: (...args) => mockListSessions(...args),
  },
  studentSubjectsApi: {
    listForStudent: (...args) => mockListStudentSubjects(...args),
    confirmEnd: (...args) => mockConfirmEnd(...args),
    addSessions: (...args) => mockAddSessions(...args),
  },
  enrollmentsApi: {
    listForStudent: (...args) => mockListForStudent(...args),
  },
}))

const baseStudent = {
  id: 1,
  student_number: 'STU-000001',
  full_name: 'Alice Wang',
  year_group: 7,
  school: 'Kamuzu Academy',
  phone: '0888123456',
  email: 'alice@example.com',
  grade: 'B+',
  enrolled_on: '2026-10-05',
  guardianships: [],
}

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={['/students/1']}>
          <Routes>
            <Route path="/students/:id" element={<StudentDetailPage />} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockGetStudent.mockReset().mockResolvedValue(baseStudent)
  mockListStudentSubjects.mockReset().mockResolvedValue([])
  mockListForStudent.mockReset().mockResolvedValue({ results: [] })
  mockListAssessments.mockReset().mockResolvedValue([])
  mockListSessions.mockReset().mockResolvedValue([])
  mockUpdateStudent.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StudentDetailPage', () => {
  it('shows the year group, school and previous-school grade', async () => {
    renderPage()

    expect(await screen.findByText(/Year 7/)).toBeInTheDocument()
    expect(screen.getByText(/Kamuzu Academy/)).toBeInTheDocument()
    expect(screen.getByText(/Grade: B\+/)).toBeInTheDocument()
  })

  it('shows the student\'s own phone and email when present', async () => {
    renderPage()

    expect(await screen.findByText('0888123456 · alice@example.com')).toBeInTheDocument()
  })

  it('omits the contact line entirely when the student has no phone or email', async () => {
    mockGetStudent.mockResolvedValue({ ...baseStudent, phone: '', email: '' })
    renderPage()

    await screen.findByText(/Kamuzu Academy/)
    expect(screen.queryByText('0888123456', { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText('alice@example.com', { exact: false })).not.toBeInTheDocument()
  })

  it('shows a dash for year group when the student has none on file', async () => {
    mockGetStudent.mockResolvedValue({ ...baseStudent, year_group: null, school: '', grade: '' })
    renderPage()

    expect(await screen.findByText('—')).toBeInTheDocument()
  })

  it('shows the student\'s initials as an avatar and the student number next to their name', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Alice Wang' })).toBeInTheDocument()
    expect(screen.getByText('AW')).toBeInTheDocument()
    expect(screen.getByText('STU-000001')).toBeInTheDocument()
  })

  it('badges the student as active only when an enrollment is ACTIVE', async () => {
    mockListForStudent.mockResolvedValue({
      results: [
        {
          id: 1,
          subject_names: ['Maths'],
          start_date: '2026-01-01',
          end_date: '2026-06-01',
          learning_mode: 'IN_PERSON',
          status: 'ACTIVE',
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('Active student')).toBeInTheDocument()
  })

  it('badges the student as having no active enrollment when there are none', async () => {
    renderPage()

    expect(await screen.findByText('No active enrollment')).toBeInTheDocument()
  })

  it('shows a placeholder when there are no guardians, no subjects, and no enrollments', async () => {
    renderPage()

    expect(await screen.findByText('No guardians on file.')).toBeInTheDocument()
    expect(screen.getByText('Not booked for any subject yet.')).toBeInTheDocument()
    expect(await screen.findByText('No upcoming sessions.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a subject' })).toHaveAttribute('href', '/student-subjects/new?student=1')
    expect(screen.getByText('No enrollments yet.')).toBeInTheDocument()
  })

  it('lists guardians with a Primary badge for the primary contact', async () => {
    mockGetStudent.mockResolvedValue({
      ...baseStudent,
      guardianships: [
        {
          id: 1,
          relationship: 'Mother',
          is_primary_contact: true,
          parent: { full_name: 'Jane Doe', phone: '0999000111', email: 'jane@example.com' },
        },
        {
          id: 2,
          relationship: 'Father',
          is_primary_contact: false,
          parent: { full_name: 'John Doe', phone: '', email: '' },
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText(/Mother.*0999000111.*jane@example.com/)).toBeInTheDocument()
  })

  it('shows an enrollment status badge with the withdraw action only on active rows', async () => {
    mockListForStudent.mockResolvedValue({
      results: [
        {
          id: 1,
          subject_names: ['Maths'],
          start_date: '2026-01-01',
          end_date: '2026-06-01',
          learning_mode: 'IN_PERSON',
          status: 'ACTIVE',
        },
        {
          id: 2,
          subject_names: ['Physics'],
          start_date: '2025-01-01',
          end_date: '2025-06-01',
          learning_mode: 'ONLINE',
          status: 'WITHDRAWN',
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Withdrawn')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Withdraw' })).toHaveLength(1)
  })

  it("shows the tutors' assessments on the record, read-only", async () => {
    mockListAssessments.mockResolvedValue([
      {
        id: 3,
        student: 1,
        subject: 4,
        subject_name: 'Maths',
        author: 9,
        author_name: 'Grace Banda',
        category: 'BEHAVIOURAL',
        comment: 'Talks over others.',
        created_at: '2026-10-05T09:00:00Z',
      },
    ])
    renderPage()

    expect(await screen.findByText('Talks over others.')).toBeInTheDocument()
    expect(screen.getByText('Grace Banda')).toBeInTheDocument()
    expect(mockListAssessments).toHaveBeenCalledWith(1)
    expect(screen.queryByRole('button', { name: 'Add assessment' })).not.toBeInTheDocument()
  })
})


const physics = {
  id: 7,
  student: { id: 1, name: 'Alice Wang', student_number: 'STU-000001' },
  subject: { id: 3, name: 'Physics', level_name: 'IGCSE', display_name: 'IGCSE Physics' },
  tutor: { id: 2, name: 'Mr Banda', user_id: 9 },
  topic_ids: [1, 2],
  planned_sessions: 24,
  session_minutes: 60,
  mode: 'IN_PERSON',
  start_date: '2026-09-07',
  confirmed_end_date: null,
  status: 'ACTIVE',
  slots: [
    { id: 1, weekday: 0, start_time: '16:00', end_time: '17:00' },
    { id: 2, weekday: 3, start_time: '16:00', end_time: '17:00' },
  ],
  progress: {
    planned: 24,
    held: 18,
    not_held: 1,
    remaining: 6,
    unlogged: 0,
    held_minutes: 1080,
    held_hours: 18,
    topics_covered: 9,
    topics_total: 12,
    covered_topic_ids: [],
    expected_end_date: '2026-12-10',
    needs_end_confirmation: false,
    end_reason: null,
  },
}

describe('StudentDetailPage subjects', () => {
  it('shows each subject with tutor, schedule, progress and expected end', async () => {
    mockListStudentSubjects.mockResolvedValue([physics])
    renderPage()

    const card = await screen.findByRole('article', { name: 'IGCSE Physics' })
    expect(within(card).getByText('Mr Banda')).toBeInTheDocument()
    expect(within(card).getByText('Monday 16:00–17:00, Thursday 16:00–17:00')).toBeInTheDocument()
    expect(within(card).getByText('18 of 24 sessions, 9 of 12 topics')).toBeInTheDocument()
    expect(within(card).getByText(/Expected end/)).toHaveTextContent('Thu 10 Dec 2026')
    expect(within(card).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '18')
    expect(within(card).queryByRole('region', { name: /Confirm the end/ })).not.toBeInTheDocument()
    expect(mockListStudentSubjects).toHaveBeenCalledWith('1')
  })

  it('prompts to confirm the end when sessions run out, and confirming updates the card', async () => {
    const due = {
      ...physics,
      progress: { ...physics.progress, held: 24, remaining: 0, needs_end_confirmation: true, end_reason: 'SESSIONS_USED', expected_end_date: '2026-11-19' },
    }
    mockListStudentSubjects.mockResolvedValue([due])
    mockConfirmEnd.mockResolvedValue({
      ...due,
      confirmed_end_date: '2026-11-19',
      progress: { ...due.progress, needs_end_confirmation: false },
    })
    renderPage()

    const prompt = await screen.findByRole('region', { name: 'Confirm the end or add sessions' })
    expect(within(prompt).getByText('All planned sessions have been held.')).toBeInTheDocument()
    fireEvent.click(within(prompt).getByRole('button', { name: 'Confirm last session' }))
    expect(within(prompt).getByRole('button', { name: 'Confirming…' })).toBeDisabled()
    await screen.findByText(/Last session/)
    expect(mockConfirmEnd).toHaveBeenCalledWith(7, '2026-11-19')
    expect(screen.queryByRole('region', { name: 'Confirm the end or add sessions' })).not.toBeInTheDocument()
  })

  it('adds sessions from the prompt', async () => {
    const due = { ...physics, progress: { ...physics.progress, needs_end_confirmation: true, end_reason: 'TOPICS_COVERED' } }
    mockListStudentSubjects.mockResolvedValue([due])
    mockAddSessions.mockResolvedValue({ ...physics, planned_sessions: 30 })
    renderPage()

    const prompt = await screen.findByRole('region', { name: 'Confirm the end or add sessions' })
    expect(within(prompt).getByText('All of the student’s topics have been covered.')).toBeInTheDocument()
    fireEvent.change(within(prompt).getByLabelText('Sessions to add'), { target: { value: '6' } })
    fireEvent.click(within(prompt).getByRole('button', { name: 'Add sessions' }))
    await screen.findByText('18 of 24 sessions, 9 of 12 topics')
    expect(mockAddSessions).toHaveBeenCalledWith(7, 6)
  })
})

describe('StudentDetailPage layout', () => {
  it('shows the header facts, then Subjects, Upcoming sessions, Guardians and Session history in that order', async () => {
    mockListStudentSubjects.mockResolvedValue([physics])
    renderPage()
    await screen.findByRole('article', { name: 'IGCSE Physics' })

    expect(screen.getByText(/Year 7/)).toBeInTheDocument()
    expect(screen.getByText(/Kamuzu Academy/)).toBeInTheDocument()
    expect(screen.getByText(/0888123456/)).toBeInTheDocument()
    expect(screen.getByText(/Enrolled Mon 5 Oct 2026/)).toBeInTheDocument()

    const headers = [...document.querySelectorAll('.detail-section__header')].map((h) => h.textContent.trim())
    const order = ['Subjects', 'Upcoming sessions', 'Guardians', 'Session history']
    const found = order.map((name) => headers.findIndex((h) => h.startsWith(name)))
    expect(found.every((i) => i >= 0)).toBe(true)
    expect(found).toEqual([...found].sort((a, b) => a - b))
    // The v1 enrollments section stays, after the new ones.
    expect(headers.findIndex((h) => h.startsWith('Enrollments'))).toBeGreaterThan(found[3])
  })

  it('lets staff change the enrolment date', async () => {
    mockUpdateStudent.mockResolvedValue({ ...baseStudent, enrolled_on: '2026-09-02' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(mockUpdateStudent).toHaveBeenCalledWith(1, { enrolled_on: '2026-10-05' }))
    expect(await screen.findByText(/Enrolled Wed 2 Sep/)).toBeInTheDocument()
  })

  it('shows the server error when the date is refused', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockUpdateStudent.mockRejectedValue(new ApiError(400, { enrolled_on: ['The enrolment date cannot be in the future.'] }))
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Change' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The enrolment date cannot be in the future.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })
})

describe('StudentDetailPage sessions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 10, 18, 12, 0)) // Wednesday 18 Nov 2026
    mockListStudentSubjects.mockResolvedValue([{ ...physics, start_date: '2026-09-07' }])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const upcoming = (id, date, extra = {}) =>
    makeSession({ id, date, start_time: '16:00', end_time: '17:00', display_status: 'SCHEDULED', ...extra })

  it('lists the next few upcoming sessions across subjects, soonest first, skipping cancelled ones', async () => {
    mockListSessions.mockResolvedValue([
      upcoming(5, '2026-11-26'),
      upcoming(1, '2026-11-19'),
      upcoming(2, '2026-11-20', { display_status: 'CANCELLED' }),
      upcoming(3, '2026-11-23', { subject: { id: 9, name: 'Maths', level_name: 'IGCSE', display_name: 'IGCSE Maths' } }),
      upcoming(4, '2026-11-24'),
      upcoming(6, '2026-11-30'),
      upcoming(7, '2026-12-01'),
      upcoming(8, '2026-12-02'),
    ])
    renderPage()
    await screen.findByRole('article', { name: 'IGCSE Physics' })
    await screen.findByText(/Thu 19 Nov 2026/)

    expect(mockListSessions).toHaveBeenCalledWith({ student: 1, from: '2026-11-18', to: '2027-01-18' })
    const rows = screen.getAllByRole('link', { name: /Scheduled/ })
    expect(rows).toHaveLength(5)
    expect(rows[0]).toHaveAttribute('href', '/timetable?session=1')
    expect(within(rows[1]).getByText('IGCSE Maths')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('collapses the history until it is opened, then lists past sessions newest first with their status', async () => {
    mockListSessions.mockImplementation((params) =>
      Promise.resolve(
        [
          makeSession({ id: 11, date: '2026-11-02', display_status: 'HELD' }),
          makeSession({ id: 12, date: '2026-11-09', display_status: 'NOT_HELD' }),
          upcoming(13, '2026-11-25'),
        ].filter((s) => s.date >= params.from && s.date <= params.to),
      ),
    )
    renderPage()
    await screen.findByRole('article', { name: 'IGCSE Physics' })
    const toggle = screen.getByRole('button', { name: /Session history/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const callsBefore = mockListSessions.mock.calls.length

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const held = await screen.findByRole('link', { name: /Held/ })
    expect(mockListSessions.mock.calls.length).toBeGreaterThan(callsBefore)
    const history = within(document.getElementById('student-session-history'))
    expect(history.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/timetable?session=12',
      '/timetable?session=11',
    ])
    expect(held).toHaveAttribute('href', '/timetable?session=11')
    expect(history.getByText('Not held')).toBeInTheDocument()
    // Reads back to the first subject's start: Sep 7 to Nov 18 needs two 62-day windows or fewer.
    for (const [params] of mockListSessions.mock.calls.slice(callsBefore)) {
      expect(params.from >= '2026-09-07').toBe(true)
    }
  })

  it('says so when there is no history yet', async () => {
    renderPage()
    await screen.findByRole('article', { name: 'IGCSE Physics' })
    fireEvent.click(screen.getByRole('button', { name: /Session history/ }))
    expect(await screen.findByText('No past sessions yet.')).toBeInTheDocument()
  })
})
