import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'

const mockListEnquiries = vi.fn()
const mockSearchStudents = vi.fn()
const mockListSubjects = vi.fn()
const mockListTeaching = vi.fn()

vi.mock('../lib/api', () => ({
  enquiriesApi: { list: (...args) => mockListEnquiries(...args) },
  clientsApi: { searchStudents: (...args) => mockSearchStudents(...args) },
  academicsApi: { listSubjects: (...args) => mockListSubjects(...args) },
  tutorsApi: { listTeaching: (...args) => mockListTeaching(...args) },
}))

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

  it('only shows the Active Subjects card for a non-staff (Tutor) user, and fetches just that count', async () => {
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

    expect(mockListEnquiries).not.toHaveBeenCalled()
    expect(mockSearchStudents).not.toHaveBeenCalled()
    expect(mockListTeaching).not.toHaveBeenCalled()
  })

  it('shows a dash instead of crashing when a count fails to load', async () => {
    mockListSubjects.mockReset().mockRejectedValue(new Error('network error'))
    mockUseAuth.mockReturnValue({ user: { full_name: 'Tam', role: 'TUTOR' }, isStaffLevel: false })
    renderPage()

    expect(await screen.findByText('—')).toBeInTheDocument()
  })
})
