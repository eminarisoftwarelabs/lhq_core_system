import { fireEvent, render, screen, within } from '@testing-library/react'
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
const mockGetOverview = vi.fn()

vi.mock('../lib/api', () => ({
  lessonPlansApi: { list: (...args) => mockListPlans(...args) },
  overviewApi: { get: (...args) => mockGetOverview(...args) },
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

const OWNER = { user: { full_name: 'Wanangwa Banda', role: 'OWNER' }, isStaffLevel: true }

const overview = {
  period: { key: 'this_month', start: '2026-10-01', end: '2026-11-01' },
  counts: { active_students: 42, tutors: 7, active_subjects: 9, open_enquiries: 5 },
  money: {
    invoiced: '1250000.00',
    collected: '900000.00',
    outstanding: '475000.50',
    overdue_amount: '120000.00',
    overdue_count: 2,
  },
  enrollment_trend: [
    { month: '2026-05', enrolled: 2, withdrawn: 0 },
    { month: '2026-06', enrolled: 0, withdrawn: 0 },
    { month: '2026-07', enrolled: 4, withdrawn: 1 },
    { month: '2026-08', enrolled: 1, withdrawn: 0 },
    { month: '2026-09', enrolled: 3, withdrawn: 2 },
    { month: '2026-10', enrolled: 8, withdrawn: 1 },
  ],
  funnel: {
    stages: [
      { stage: 'INITIAL_CALL', label: 'Initial call', count: 3 },
      { stage: 'MEETING_SET', label: 'Meeting set', count: 1 },
      { stage: 'INVOICED', label: 'Invoiced', count: 1 },
      { stage: 'ENROLLED', label: 'Enrolled', count: 15 },
    ],
    total: 20,
    enrolled: 15,
    conversion_rate: 0.75,
  },
}

const TUTOR = { user: { full_name: '', email: 'tam@lhq.test', role: 'TUTOR' }, isStaffLevel: false }

beforeEach(() => {
  mockGetOverview.mockReset().mockResolvedValue(overview)
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
  it('shows an Admin the day-to-day staff dashboard, never the company overview', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa Banda', role: 'ADMIN' },
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
    expect(mockGetOverview).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Money' })).not.toBeInTheDocument()
  })

  it('shows a card-bordered recent enrollments list below the stat cards, defaulted to 30 days, linking to the student', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa Banda', role: 'ADMIN' },
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
      user: { full_name: 'Wanangwa Banda', role: 'ADMIN' },
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
    mockUseAuth.mockReturnValue({ user: { full_name: 'Tam', role: 'ADMIN' }, isStaffLevel: true })
    renderPage()

    expect(await screen.findByText('—')).toBeInTheDocument()
  })

  it('shows a message instead of crashing when recent enrollments fail to load', async () => {
    mockListEnrollments.mockReset().mockRejectedValue(new Error('network error'))
    mockUseAuth.mockReturnValue({ user: { full_name: 'Wanangwa Banda', role: 'ADMIN' }, isStaffLevel: true })
    renderPage()

    expect(await screen.findByText('Could not load recent enrollments.')).toBeInTheDocument()
  })

  describe('for an Owner', () => {
    it('shows the company counts from one overview call, and none of the per-page fetches', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      renderPage()

      expect(await screen.findByRole('link', { name: /active students/i })).toHaveTextContent('42')
      expect(screen.getByRole('link', { name: /tutors/i })).toHaveTextContent('7')
      expect(screen.getByRole('link', { name: /active subjects/i })).toHaveTextContent('9')
      expect(screen.getByRole('link', { name: /open enquiries/i })).toHaveTextContent('5')
      expect(screen.getByRole('link', { name: /open enquiries/i })).toHaveAttribute('href', '/enquiries')

      expect(mockGetOverview).toHaveBeenCalledTimes(1)
      expect(mockGetOverview).toHaveBeenCalledWith('this_month')
      for (const unused of [mockListEnquiries, mockSearchStudents, mockListSubjects, mockListTeaching, mockListEnrollments]) {
        expect(unused).not.toHaveBeenCalled()
      }
    })

    it('shows the same overview to a System Admin', async () => {
      mockUseAuth.mockReturnValue({ user: { role: 'SYS_ADMIN' }, isStaffLevel: true })
      renderPage()

      expect(await screen.findByRole('heading', { name: 'Money' })).toBeInTheDocument()
    })

    it('shows the money figures, saying which follow the period and which are as of today', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      renderPage()

      expect(await screen.findByText('MK 1,250,000.00')).toBeInTheDocument()
      expect(screen.getByText('MK 900,000.00')).toBeInTheDocument()
      expect(screen.getByText('MK 475,000.50')).toBeInTheDocument()
      expect(screen.getAllByText('this month')).toHaveLength(2)
      expect(screen.getByText('owed as of today')).toBeInTheDocument()

      const overdue = screen.getByRole('link', { name: /overdue/i })
      expect(overdue).toHaveAttribute('href', '/invoices')
      expect(overdue).toHaveTextContent('MK 120,000.00')
      expect(overdue).toHaveTextContent('2 invoices past due')
    })

    it('asks the server again when the period changes, keeping the old figures up meanwhile', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      renderPage()
      await screen.findByText('MK 1,250,000.00')

      let resolve
      mockGetOverview.mockReturnValue(new Promise((r) => (resolve = r)))
      fireEvent.click(screen.getByRole('button', { name: 'This year' }))

      expect(mockGetOverview).toHaveBeenLastCalledWith('this_year')
      expect(screen.getByRole('button', { name: 'This year' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByText('MK 1,250,000.00')).toBeInTheDocument()

      resolve({ ...overview, money: { ...overview.money, invoiced: '9000000.00', overdue_count: 1 } })
      expect(await screen.findByText('MK 9,000,000.00')).toBeInTheDocument()
      expect(screen.getAllByText('this year')).toHaveLength(2)
      expect(screen.getByText('1 invoice past due')).toBeInTheDocument()
    })

    it('gives the enrollment trend as a table too, month by month', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      renderPage()

      const table = await screen.findByRole('table', { name: /enrollments and withdrawals per month/i })
      const october = within(table).getByRole('row', { name: /October 2026/ })
      expect(within(october).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['8', '1'])
      expect(within(table).getAllByRole('row')).toHaveLength(7)
    })

    it('scales the trend columns to the busiest month', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      renderPage()
      await screen.findByRole('table')

      const months = document.querySelectorAll('.trend-chart__month')
      expect(months).toHaveLength(6)
      const [enrolled, withdrawn] = months[5].querySelectorAll('.trend-chart__bar')
      expect(enrolled).toHaveStyle({ height: '100%' })
      expect(withdrawn).toHaveStyle({ height: '12.5%' })
      expect(months[1].querySelector('.trend-chart__bar')).toHaveStyle({ height: '0%' })
    })

    it('shows the onboarding funnel in stage order with the conversion rate', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      renderPage()

      expect(await screen.findByText('75%')).toBeInTheDocument()
      expect(screen.getByText(/of all enquiries have enrolled \(15\s+of 20\)/)).toBeInTheDocument()
      const rows = document.querySelectorAll('.funnel__row')
      expect([...rows].map((row) => row.textContent)).toEqual(['Initial call3', 'Meeting set1', 'Invoiced1', 'Enrolled15'])
      expect(rows[3].querySelector('.funnel__bar')).toHaveStyle({ width: '100%' })
      expect(rows[0].querySelector('.funnel__bar')).toHaveStyle({ width: '20%' })
    })

    it('says so, instead of drawing empty charts, for a company with no history yet', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      mockGetOverview.mockResolvedValue({
        ...overview,
        money: { invoiced: '0.00', collected: '0.00', outstanding: '0.00', overdue_amount: '0.00', overdue_count: 0 },
        enrollment_trend: overview.enrollment_trend.map((row) => ({ ...row, enrolled: 0, withdrawn: 0 })),
        funnel: { stages: overview.funnel.stages.map((s) => ({ ...s, count: 0 })), total: 0, enrolled: 0, conversion_rate: null },
      })
      renderPage()

      expect(await screen.findByText('No enrollments or withdrawals in the last six months.')).toBeInTheDocument()
      expect(screen.getByText('No enquiries yet.')).toBeInTheDocument()
      expect(screen.getByText('nothing past due')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
    })

    it('reports a failed load with dashes, not zeroes', async () => {
      mockUseAuth.mockReturnValue(OWNER)
      mockGetOverview.mockRejectedValue(new Error('boom'))
      renderPage()

      expect(await screen.findByText('Could not load the company overview.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /active students/i })).toHaveTextContent('—')
      expect(screen.queryByText(/MK/)).not.toBeInTheDocument()
    })
  })
})
