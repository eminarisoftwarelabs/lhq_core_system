import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const mockListEnquiries = vi.fn()
const mockSearchStudents = vi.fn()
const mockListSubjects = vi.fn()
const mockListTeaching = vi.fn()
const mockListEnrollments = vi.fn()

vi.mock('../lib/api', () => ({
  enquiriesApi: { list: (...args) => mockListEnquiries(...args) },
  clientsApi: { searchStudents: (...args) => mockSearchStudents(...args) },
  academicsApi: { listSubjects: (...args) => mockListSubjects(...args) },
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

vi.mock('../lib/greeting', () => ({
  getGreeting: () => 'Good afternoon',
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
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
  it('greets the user and shows a card per accessible section, for staff', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa Banda', role: 'OWNER' },
      isStaffLevel: true,
    })
    renderPage()

    expect(screen.getByRole('heading', { name: 'Good afternoon, Wanangwa Banda' })).toBeInTheDocument()

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

  it('hides the recent enrollments list, and never fetches it, for a non-staff (Tutor) user', async () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: '', email: 'tam@lhq.test', role: 'TUTOR' },
      isStaffLevel: false,
    })
    renderPage()

    expect(screen.getByRole('heading', { name: 'Good afternoon, tam@lhq.test' })).toBeInTheDocument()
    expect(await screen.findByText('6')).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /active subjects/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /onboarding/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /enrolled students/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /tutors/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Recently enrolled' })).not.toBeInTheDocument()

    expect(mockListEnquiries).not.toHaveBeenCalled()
    expect(mockSearchStudents).not.toHaveBeenCalled()
    expect(mockListTeaching).not.toHaveBeenCalled()
    expect(mockListEnrollments).not.toHaveBeenCalled()
  })

  it('shows a dash instead of crashing when a count fails to load', async () => {
    mockListSubjects.mockReset().mockRejectedValue(new Error('network error'))
    mockUseAuth.mockReturnValue({ user: { full_name: 'Tam', role: 'TUTOR' }, isStaffLevel: false })
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
