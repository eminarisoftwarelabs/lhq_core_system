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
})
