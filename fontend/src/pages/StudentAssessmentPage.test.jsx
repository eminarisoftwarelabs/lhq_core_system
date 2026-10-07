import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentAssessmentPage } from './StudentAssessmentPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockGetSubject = vi.fn()
const mockGetSubjectRoster = vi.fn()
const mockListAssessments = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    getSubject: (...args) => mockGetSubject(...args),
  },
  clientsApi: {
    getSubjectRoster: (...args) => mockGetSubjectRoster(...args),
  },
  assessmentsApi: {
    listForStudent: (...args) => mockListAssessments(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const TUTOR = { user: { id: 2, role: 'TUTOR', tutor_profile: { id: 9 } }, isStaffLevel: false }
const OWNER = { user: { id: 1, role: 'OWNER', tutor_profile: null }, isStaffLevel: true }

const alice = {
  id: 5,
  full_name: 'Alice Wang',
  student_number: 'STU-000001',
  school: 'Kamuzu Academy',
  year_group: 9,
}

function renderPage(path = '/subjects/1/students/5') {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/subjects/:id/students/:studentId" element={<StudentAssessmentPage />} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(TUTOR)
  mockGetSubject.mockReset().mockResolvedValue({ id: 1, name: 'Maths', tutor: 9 })
  mockGetSubjectRoster.mockReset().mockResolvedValue([alice])
  mockListAssessments.mockReset().mockResolvedValue([])
})

describe('StudentAssessmentPage', () => {
  it("shows the student, their class, and lets the class's tutor assess them", async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Alice Wang' })).toBeInTheDocument()
    expect(screen.getByText('STU-000001')).toBeInTheDocument()
    expect(screen.getByText('Year 9 · Kamuzu Academy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to Maths/ })).toHaveAttribute('href', '/subjects/1')
    expect(await screen.findByRole('button', { name: 'Add assessment' })).toBeInTheDocument()
    expect(mockListAssessments).toHaveBeenCalledWith(5)
  })

  it('gives a tutor no route into the staff-only student record', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Alice Wang' })
    expect(screen.queryByRole('link', { name: /Full student record/ })).not.toBeInTheDocument()
  })

  it('is read-only for staff who do not teach the class, with a link to the full record', async () => {
    mockUseAuth.mockReturnValue(OWNER)
    renderPage()

    expect(await screen.findByRole('link', { name: /Full student record/ })).toHaveAttribute('href', '/students/5')
    expect(await screen.findByText('No assessments yet.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add assessment' })).not.toBeInTheDocument()
  })

  it('lets a staff member who teaches the class assess', async () => {
    mockUseAuth.mockReturnValue({ ...OWNER, user: { ...OWNER.user, tutor_profile: { id: 9 } } })
    renderPage()

    expect(await screen.findByRole('button', { name: 'Add assessment' })).toBeInTheDocument()
  })

  it('refuses a student who is not on this class roster, without asking for their record', async () => {
    renderPage('/subjects/1/students/99')

    expect(await screen.findByText('Student not found in this class.')).toBeInTheDocument()
    expect(mockListAssessments).not.toHaveBeenCalled()
  })

  it("treats someone else's subject (404) as not found", async () => {
    mockGetSubject.mockRejectedValue(new ApiError(404, {}))
    mockGetSubjectRoster.mockRejectedValue(new ApiError(404, {}))
    renderPage()

    expect(await screen.findByText('Student not found in this class.')).toBeInTheDocument()
  })

  it('reports any other failure as a load error', async () => {
    mockGetSubjectRoster.mockRejectedValue(new ApiError(500, {}))
    renderPage()

    expect(await screen.findByText('Could not load this student.')).toBeInTheDocument()
  })
})
