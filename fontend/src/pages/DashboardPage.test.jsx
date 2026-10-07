import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const mockListEnquiries = vi.fn()
const mockSearchStudents = vi.fn()
const mockListSubjects = vi.fn()
const mockListTeaching = vi.fn()
const mockListEnrollments = vi.fn()
const mockListAllSubjects = vi.fn()
const mockGetSubjectRoster = vi.fn()
const mockListPlans = vi.fn()

vi.mock('../lib/api', () => ({
  lessonPlansApi: { list: (...args) => mockListPlans(...args) },
  enquiriesApi: { list: (...args) => mockListEnquiries(...args) },
  clientsApi: {
    searchStudents: (...args) => mockSearchStudents(...args),
    getSubjectRoster: (...args) => mockGetSubjectRoster(...args),
  },
  academicsApi: {
    listSubjects: (...args) => mockListSubjects(...args),
    listAllSubjects: (...args) => mockListAllSubjects(...args),
  },
  tutorsApi: { listTeaching: (...args) => mockListTeaching(...args) },
  enrollmentsApi: { list: (...args) => mockListEnrollments(...args) },
}))

function enrolledOn(daysAgo, id, studentId, studentName) {
  const createdAt = new Date()
  createdAt.setDate(createdAt.getDate() - daysAgo)
  return { id, student: studentId, student_name: studentName, created_at: createdAt.toISOString() }
}

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

const TUTOR = { user: { full_name: '', email: 'tam@lhq.test', role: 'TUTOR' }, isStaffLevel: false }

beforeEach(() => {
  mockListAllSubjects.mockReset().mockResolvedValue([
    { id: 1, name: 'Physics', timetable_slot: { day_of_week: 4, start_time: '14:00:00', end_time: '15:30:00' } },
    { id: 2, name: 'Maths', timetable_slot: { day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00' } },
    { id: 3, name: 'Biology', timetable_slot: null },
  ])
  // Student 8 takes both Physics and Maths - 3 distinct students in all.
  mockGetSubjectRoster.mockReset().mockImplementation((id) =>
    Promise.resolve({ 1: [{ id: 7 }, { id: 8 }], 2: [{ id: 8 }], 3: [{ id: 9 }] }[id]),
  )
  mockListPlans.mockReset().mockResolvedValue([{ subject: 2, topic_name: 'Fractions' }])
  mockListEnquiries.mockReset().mockResolvedValue({ count: 4, results: [] })
  mockSearchStudents.mockReset().mockResolvedValue({ count: 12, results: [] })
  mockListSubjects.mockReset().mockResolvedValue({
    count: 9,
    results: [
      { id: 1, is_active: true },
      { id: 2, is_active: true },
      { id: 3, is_active: false },
      { id: 4, is_active: true },
      { id: 5, is_active: true },
      { id: 6, is_active: true },
      { id: 7, is_active: true },
    ],
  })
  mockListTeaching.mockReset().mockResolvedValue([
    { id: 1, name: 'A' },
    { id: 2, name: 'B' },
    { id: 3, name: 'C' },
    { id: 4, name: 'D' },
    { id: 5, name: 'E' },
  ])
  // 2 of these 3 fall within the default 30-day window (5 and 10 days ago);
  // the third (45 days ago) should be excluded from the recent list.
  mockListEnrollments.mockReset().mockResolvedValue({
    count: 3,
    results: [
      enrolledOn(5, 301, 201, 'Chisomo Mbewe'),
      enrolledOn(45, 302, 202, 'Blessings Nyirenda'),
      enrolledOn(10, 303, 203, 'Grace Kaunda'),
    ],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('DashboardPage', () => {
  it('shows a card per accessible section, for staff', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa Banda', role: 'OWNER' },
      isStaffLevel: true,
    })
    renderPage()

    for (const label of ['Onboarding', 'Enrolled Students', 'Active Subjects', 'Tutors']) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toBeInTheDocument()
    }
    expect(screen.queryByRole('link', { name: /invoices/i })).not.toBeInTheDocument()

    expect(await screen.findByText('4')).toBeInTheDocument() // Onboarding
    expect(await screen.findByText('12')).toBeInTheDocument() // Enrolled Students
    expect(await screen.findByText('6')).toBeInTheDocument() // Active Subjects - 6 of 7 fetched are active
    expect(await screen.findByText('5')).toBeInTheDocument() // Tutors
  })

  it('shows a card-bordered recent enrollments list below the stat cards, defaulted to 30 days, linking to the student', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa Banda', role: 'OWNER' },
      isStaffLevel: true,
    })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Recently enrolled' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'true')

    // Links to the student record, not the (no-longer-listing-ENROLLED) Onboarding pipeline.
    const inWindow = await screen.findByRole('link', { name: /Chisomo Mbewe/ })
    expect(inWindow).toHaveAttribute('href', '/students/201')
    expect(screen.getByRole('link', { name: /Grace Kaunda/ })).toHaveAttribute('href', '/students/203')

    // Outside the default 30-day window - excluded.
    expect(screen.queryByText('Blessings Nyirenda')).not.toBeInTheDocument()

    // Newest enrollment (5 days ago) listed before the older one (10 days ago).
    const names = screen.getAllByText(/Chisomo Mbewe|Grace Kaunda/).map((el) => el.textContent)
    expect(names).toEqual(['Chisomo Mbewe', 'Grace Kaunda'])
  })

  it('lets staff switch the period, filtering instantly with no refetch', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa Banda', role: 'OWNER' },
      isStaffLevel: true,
    })
    renderPage()

    await screen.findByRole('link', { name: /Chisomo Mbewe/ })
    mockListEnrollments.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '7d' }))

    expect(screen.getByRole('button', { name: '7d' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '30d' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('link', { name: /Chisomo Mbewe/ })).toBeInTheDocument() // 5 days ago
    expect(screen.queryByRole('link', { name: /Grace Kaunda/ })).not.toBeInTheDocument() // 10 days ago - now excluded

    fireEvent.click(screen.getByRole('button', { name: '60d' }))
    expect(screen.getByRole('link', { name: /Blessings Nyirenda/ })).toBeInTheDocument() // 45 days ago - now included

    // Switching periods re-filters the already-fetched list, it never re-hits the API.
    expect(mockListEnrollments).not.toHaveBeenCalled()
  })

  it("shows a tutor their own stat cards and nothing school-wide, fetching none of it", async () => {
    mockUseAuth.mockReturnValue(TUTOR)
    renderPage()

    const subjects = await screen.findByRole('link', { name: /my subjects/i })
    expect(subjects).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /my students/i })).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /topics this week/i })).toHaveTextContent('1/3')
    expect(screen.getByRole('link', { name: /topics this week/i })).toHaveAttribute('href', '/timetable')

    expect(screen.queryByRole('link', { name: /onboarding/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /enrolled students/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /tutors/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recently enrolled' })).not.toBeInTheDocument()

    expect(mockListEnquiries).not.toHaveBeenCalled()
    expect(mockSearchStudents).not.toHaveBeenCalled()
    expect(mockListTeaching).not.toHaveBeenCalled()
    expect(mockListEnrollments).not.toHaveBeenCalled()
  })

  it("lists a tutor's classes for the week in teaching order, with topic, time and class size", async () => {
    mockUseAuth.mockReturnValue(TUTOR)
    renderPage()

    expect(await screen.findByRole('heading', { name: "This week's classes" })).toBeInTheDocument()
    const rows = await screen.findAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('.week-class__name').firstChild.textContent)).toEqual([
      'Maths',
      'Physics',
      'Biology',
    ])

    expect(rows[0]).toHaveTextContent('Tuesday 09:00–10:00 · 1 student')
    expect(rows[0]).toHaveTextContent('Fractions')
    expect(rows[1]).toHaveTextContent('Friday 14:00–15:30 · 2 students')
    expect(rows[1]).toHaveTextContent('No topic planned')
    expect(rows[2]).toHaveTextContent('Not on the timetable yet · 1 student')
    expect(screen.getByRole('link', { name: /Maths/ })).toHaveAttribute('href', '/subjects/2')
    expect(mockListAllSubjects).toHaveBeenCalledWith({ is_active: true })
  })

  it('tells a tutor with no subjects so, with zeroes rather than dashes', async () => {
    mockUseAuth.mockReturnValue(TUTOR)
    mockListAllSubjects.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText('No subjects are assigned to you yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my subjects/i })).toHaveTextContent('0')
    expect(screen.getByRole('link', { name: /my students/i })).toHaveTextContent('0')
    expect(mockGetSubjectRoster).not.toHaveBeenCalled()
  })

  it("still lists a tutor's classes when rosters and lesson plans fail, without guessing at the gaps", async () => {
    mockUseAuth.mockReturnValue(TUTOR)
    mockGetSubjectRoster.mockRejectedValue(new Error('boom'))
    mockListPlans.mockRejectedValue(new Error('boom'))
    renderPage()

    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('Tuesday 09:00–10:00')
    expect(rows[0]).not.toHaveTextContent('student')
    // Unknown is not the same as "nothing planned".
    expect(screen.queryByText('No topic planned')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my students/i })).toHaveTextContent('—')
    expect(screen.getByRole('link', { name: /topics this week/i })).toHaveTextContent('—')
  })

  it("says so when a tutor's subjects cannot be loaded at all", async () => {
    mockUseAuth.mockReturnValue(TUTOR)
    mockListAllSubjects.mockRejectedValue(new Error('boom'))
    renderPage()

    expect(await screen.findByText('Could not load your classes.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my subjects/i })).toHaveTextContent('—')
  })

  it('shows a dash instead of crashing when a count fails to load', async () => {
    mockListSubjects.mockReset().mockRejectedValue(new Error('network error'))
    mockUseAuth.mockReturnValue({ user: { full_name: 'Tam', role: 'OWNER' }, isStaffLevel: true })
    renderPage()

    expect(await screen.findByText('—')).toBeInTheDocument()
  })

  it('shows a message instead of crashing when recent enrollments fail to load', async () => {
    mockListEnrollments.mockReset().mockRejectedValue(new Error('network error'))
    mockUseAuth.mockReturnValue({ user: { full_name: 'Wanangwa Banda', role: 'OWNER' }, isStaffLevel: true })
    renderPage()

    expect(await screen.findByText('Could not load recent enrollments.')).toBeInTheDocument()
  })
})
