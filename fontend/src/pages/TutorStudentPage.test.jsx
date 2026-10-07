import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TutorStudentPage } from './TutorStudentPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockGetStudent = vi.fn()
const mockListNotes = vi.fn()

vi.mock('../lib/api', () => ({
  clientsApi: {
    getStudent: (...args) => mockGetStudent(...args),
    listStudentNotes: (...args) => mockListNotes(...args),
    addStudentNote: vi.fn(),
  },
}))

const student = {
  id: 5,
  student_number: 'STU-000001',
  full_name: 'Alice Wang',
  year_group: 9,
  school: 'Kamuzu Academy',
  grade: 'B+',
  shared_subjects: [
    { id: 1, name: 'Maths' },
    { id: 2, name: 'Physics' },
  ],
}

function renderPage(path = '/students/5?subject=2') {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/students/:id" element={<TutorStudentPage />} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockGetStudent.mockReset().mockResolvedValue(student)
  mockListNotes.mockReset().mockResolvedValue({ count: 0, next: null, results: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TutorStudentPage', () => {
  it('shows who the student is and the add assessment form', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Alice Wang' })).toBeInTheDocument()
    expect(screen.getByText('STU-000001')).toBeInTheDocument()
    expect(screen.getByText(/Year 9/)).toBeInTheDocument()
    expect(screen.getByText(/Kamuzu Academy/)).toBeInTheDocument()
    expect(screen.getByText(/Grade: B\+/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add assessment' })).toBeInTheDocument()
  })

  it('has none of the staff only sections', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'Alice Wang' })

    for (const staffOnly of [/Guardians/, /Enrollments/, /Timetable/, /New enrollment/, /Withdraw/]) {
      expect(screen.queryByText(staffOnly)).not.toBeInTheDocument()
    }
  })

  it('goes back to the roster of the subject the tutor came from, and preselects it', async () => {
    renderPage('/students/5?subject=2')

    expect(await screen.findByRole('link', { name: /Back to roster/ })).toHaveAttribute('href', '/subjects/2/roster')
    expect(screen.getByLabelText('Subject')).toHaveValue('2')
  })

  it('falls back to their first shared subject when none (or one they do not teach) is given', async () => {
    renderPage('/students/5?subject=99')

    expect(await screen.findByRole('link', { name: /Back to roster/ })).toHaveAttribute('href', '/subjects/1/roster')
  })

  it('shows "Student not found." for a student outside their classes', async () => {
    mockGetStudent.mockRejectedValue(new ApiError(404, null))
    renderPage()

    expect(await screen.findByText('Student not found.')).toBeInTheDocument()
  })

  it('shows an error when the student cannot be loaded', async () => {
    mockGetStudent.mockRejectedValue(new ApiError(500, null))
    renderPage()

    expect(await screen.findByText('Could not load this student.')).toBeInTheDocument()
  })
})
