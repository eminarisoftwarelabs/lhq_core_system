import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnrollmentCreatePage } from './EnrollmentCreatePage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockListSubjects = vi.fn()
const mockGetStudent = vi.fn()
const mockSearchStudents = vi.fn()
const mockCreateEnrollment = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: { listSubjects: (...args) => mockListSubjects(...args) },
  clientsApi: {
    getStudent: (...args) => mockGetStudent(...args),
    searchStudents: (...args) => mockSearchStudents(...args),
  },
  enrollmentsApi: { create: (...args) => mockCreateEnrollment(...args) },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderPage(initialPath = '/enrollments/new') {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <EnrollmentCreatePage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockListSubjects.mockReset().mockResolvedValue({ results: [{ id: 1, name: 'Maths', is_active: true }] })
  mockGetStudent.mockReset()
  mockSearchStudents.mockReset().mockResolvedValue({ results: [] })
  mockCreateEnrollment.mockReset()
  mockNavigate.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

async function search(query, results) {
  mockSearchStudents.mockResolvedValue({ results })
  fireEvent.change(screen.getByLabelText('Name or student number'), { target: { value: query } })
  await waitFor(() => expect(mockSearchStudents).toHaveBeenCalledWith(query), { timeout: 1000 })
}

describe('EnrollmentCreatePage', () => {
  it('shows the student search step first, with no enrollment form yet', () => {
    renderPage()

    expect(screen.getByLabelText('Name or student number')).toBeInTheDocument()
    expect(screen.queryByLabelText('Duration (weeks)')).not.toBeInTheDocument()
  })

  it('searches after typing and lists matching candidates', async () => {
    renderPage()

    await search('ada', [{ id: 3, full_name: 'Ada Lee', student_number: 'STU-003' }])

    expect(mockSearchStudents).toHaveBeenCalledWith('ada')
    expect(screen.getByText('Ada Lee')).toBeInTheDocument()
    expect(screen.getByText('STU-003')).toBeInTheDocument()
  })

  it('selecting a candidate reveals the enrollment form', async () => {
    renderPage()
    await search('ada', [{ id: 3, full_name: 'Ada Lee', student_number: 'STU-003' }])

    fireEvent.click(screen.getByText('Ada Lee'))

    expect(screen.queryByLabelText('Name or student number')).not.toBeInTheDocument()
    expect(screen.getByText(/Enrolling/)).toHaveTextContent('Enrolling Ada Lee (STU-003)')
    expect(screen.getByLabelText('Duration (weeks)')).toBeInTheDocument()
    expect(await screen.findByLabelText('Maths')).toBeInTheDocument()
  })

  it('"Change" returns to the search step', async () => {
    renderPage()
    await search('ada', [{ id: 3, full_name: 'Ada Lee', student_number: 'STU-003' }])
    fireEvent.click(screen.getByText('Ada Lee'))

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))

    expect(screen.getByLabelText('Name or student number')).toBeInTheDocument()
  })

  it('preselects a student from a ?student= query param and hides the Change button', async () => {
    mockGetStudent.mockResolvedValue({ id: 7, full_name: 'Jimmy Doe', student_number: 'STU-007' })
    renderPage('/enrollments/new?student=7')

    expect(await screen.findByText(/Enrolling/)).toHaveTextContent('Enrolling Jimmy Doe (STU-007)')
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
  })

  it('submits the enrollment, shows a confirmation toast, and navigates to the student', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-15T00:00:00'))
    mockCreateEnrollment.mockResolvedValue({ id: 10, student: 3 })
    renderPage()
    await search('ada', [{ id: 3, full_name: 'Ada Lee', student_number: 'STU-003' }])
    fireEvent.click(screen.getByText('Ada Lee'))

    fireEvent.click(await screen.findByLabelText('Maths'))
    fireEvent.click(screen.getByLabelText('Start date'))
    fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))
    fireEvent.change(screen.getByLabelText('Duration (weeks)'), { target: { value: '10' } })

    fireEvent.click(screen.getByRole('button', { name: 'Enroll' }))

    await waitFor(() =>
      expect(mockCreateEnrollment).toHaveBeenCalledWith(
        expect.objectContaining({ student: 3, subjects: [1], duration_weeks: 10 }),
      ),
    )
    expect(await screen.findByText('Enrollment created')).toBeInTheDocument()
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/students/3', { replace: true }))
    vi.useRealTimers()
  })

  it('shows field errors from the API and does not navigate', async () => {
    mockCreateEnrollment.mockRejectedValue(new ApiError(400, { duration_weeks: ['This field is required.'] }))
    renderPage()
    await search('ada', [{ id: 3, full_name: 'Ada Lee', student_number: 'STU-003' }])
    fireEvent.click(screen.getByText('Ada Lee'))

    fireEvent.change(screen.getByLabelText('Duration (weeks)'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enroll' }))

    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('has a Cancel link back to the students list once a student is selected', async () => {
    renderPage()
    await search('ada', [{ id: 3, full_name: 'Ada Lee', student_number: 'STU-003' }])
    fireEvent.click(screen.getByText('Ada Lee'))

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/students')
  })
})
