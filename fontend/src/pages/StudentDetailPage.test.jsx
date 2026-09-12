import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentDetailPage } from './StudentDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockGetStudent = vi.fn()
const mockGetStudentTimetable = vi.fn()
const mockListForStudent = vi.fn()

vi.mock('../lib/api', () => ({
  clientsApi: {
    getStudent: (...args) => mockGetStudent(...args),
    getStudentTimetable: (...args) => mockGetStudentTimetable(...args),
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
  guardianships: [],
}

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter initialEntries={['/students/1']}>
        <Routes>
          <Route path="/students/:id" element={<StudentDetailPage />} />
        </Routes>
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockGetStudent.mockReset().mockResolvedValue(baseStudent)
  mockGetStudentTimetable.mockReset().mockResolvedValue([])
  mockListForStudent.mockReset().mockResolvedValue({ results: [] })
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

  it('shows a placeholder when there are no guardians, no timetable entries, and no enrollments', async () => {
    renderPage()

    expect(await screen.findByText('No guardians on file.')).toBeInTheDocument()
    expect(screen.getByText('No active subjects.')).toBeInTheDocument()
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
})
