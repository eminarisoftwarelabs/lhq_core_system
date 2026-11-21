import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'
import { conflictError, makeStudentSubject } from '../test-utils/sessionFixtures'
import { StudentSubjectCreatePage } from './StudentSubjectCreatePage'

const mockGetStudent = vi.fn()
const mockSearch = vi.fn()
const mockListAllSubjects = vi.fn()
const mockListTopics = vi.fn()
const mockCreate = vi.fn()
vi.mock('../lib/api', () => ({
  clientsApi: {
    getStudent: (...a) => mockGetStudent(...a),
    searchStudents: (...a) => mockSearch(...a),
  },
  academicsApi: {
    listAllSubjects: (...a) => mockListAllSubjects(...a),
    listTopics: (...a) => mockListTopics(...a),
  },
  studentSubjectsApi: { create: (...a) => mockCreate(...a) },
}))

function renderPage(path = '/student-subjects/new?student=1') {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/student-subjects/new" element={<StudentSubjectCreatePage />} />
            <Route path="/students/:id" element={<p>Student page</p>} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

const subjects = [
  { id: 3, name: 'Physics', level: 3, level_name: 'IGCSE', tutors: [{ id: 4, name: 'Mr Banda' }] },
  { id: 5, name: 'Chemistry', level: 3, level_name: 'IGCSE', tutors: [{ id: 4, name: 'Mr Banda' }, { id: 6, name: 'Ms Phiri' }] },
  { id: 9, name: 'Mathematics', level: 4, level_name: 'A Level', tutors: [{ id: 6, name: 'Ms Phiri' }] },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  mockGetStudent.mockResolvedValue({ id: 1, full_name: 'Takondwa Banda', student_number: 'STU-000001' })
  mockListAllSubjects.mockResolvedValue(subjects)
  mockListTopics.mockResolvedValue([
    { chapter: 'Motion', topics: [{ id: 11, number: '1.1', name: 'Forces' }, { id: 12, number: '1.2', name: 'Energy' }] },
  ])
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

async function fillPhysics() {
  await screen.findByText('Takondwa Banda')
  await screen.findByRole('option', { name: 'Physics' })
  fireEvent.change(screen.getByLabelText('Subject'), { target: { value: '3' } })
  await screen.findByRole('checkbox', { name: /Forces/ })
}

describe('StudentSubjectCreatePage', () => {
  it('groups subjects by level and offers only the tutors who teach the chosen one', async () => {
    renderPage()
    const subject = await screen.findByLabelText('Subject')
    await within(subject).findByRole('option', { name: 'Physics' })
    expect(within(subject).getByRole('group', { name: 'IGCSE' })).toBeInTheDocument()
    expect(within(subject).getByRole('group', { name: 'A Level' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tutor')).toBeDisabled()

    fireEvent.change(subject, { target: { value: '5' } })
    const tutor = screen.getByLabelText('Tutor')
    expect(within(tutor).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a tutor', 'Mr Banda', 'Ms Phiri'])
    expect(mockListAllSubjects).toHaveBeenCalledWith({ is_active: true, taught: true })
  })

  it('ticks every topic by default, and can untick them', async () => {
    renderPage()
    await fillPhysics()
    expect(screen.getByText('2 of 2 topics ticked')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Untick all' }))
    expect(screen.getByText('0 of 2 topics ticked')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Energy/ }))
    expect(screen.getByText('1 of 2 topics ticked')).toBeInTheDocument()
  })

  it('books with two weekly times and goes to the student page', async () => {
    mockCreate.mockResolvedValue(makeStudentSubject())
    renderPage()
    await fillPhysics()
    // The only tutor is picked for you.
    expect(screen.getByLabelText('Tutor')).toHaveValue('4')
    fireEvent.change(screen.getByLabelText('Planned sessions'), { target: { value: '24' } })
    fireEvent.change(screen.getByLabelText('Session length'), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly time' }))
    fireEvent.change(screen.getByLabelText('Day for weekly time 2'), { target: { value: '3' } })

    fireEvent.click(screen.getByRole('button', { name: 'Book student' }))
    expect(await screen.findByText('Student page')).toBeInTheDocument()
    expect(mockCreate).toHaveBeenCalledWith(
      {
        student: 1,
        subject: 3,
        tutor: 4,
        planned_sessions: 24,
        session_minutes: 90,
        mode: 'IN_PERSON',
        start_date: '2026-11-18',
        slots: [
          { weekday: 0, start_time: '16:00', end_time: '17:30' },
          { weekday: 3, start_time: '16:00', end_time: '17:30' },
        ],
        topic_ids: [11, 12],
      },
      false,
    )
  })

  it('warns about a clash, and Book anyway sends it again with allow_clash', async () => {
    mockCreate.mockRejectedValueOnce(conflictError(ApiError)).mockResolvedValueOnce(makeStudentSubject())
    renderPage()
    await fillPhysics()
    fireEvent.click(screen.getByRole('button', { name: 'Book student' }))
    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('Mr Banda already teaches IGCSE Physics')
    expect(screen.getByRole('button', { name: 'Book student' })).toBeDisabled()
    fireEvent.click(within(notice).getByRole('button', { name: 'Book anyway' }))
    await waitFor(() => expect(mockCreate).toHaveBeenLastCalledWith(expect.any(Object), true))
    expect(await screen.findByText('Student page')).toBeInTheDocument()
  })

  it('shows field errors from the server', async () => {
    mockCreate.mockRejectedValue(new ApiError(400, { subject: ['Takondwa Banda already has an active IGCSE Physics.'] }))
    renderPage()
    await fillPhysics()
    fireEvent.click(screen.getByRole('button', { name: 'Book student' }))
    expect(await screen.findByText('Takondwa Banda already has an active IGCSE Physics.')).toBeInTheDocument()
  })

  it('finds a student by search when none is given', async () => {
    mockSearch.mockResolvedValue({ results: [{ id: 2, full_name: 'Grace Chirwa', student_number: 'STU-000002' }] })
    vi.useRealTimers()
    renderPage('/student-subjects/new')
    fireEvent.change(screen.getByLabelText('Find the student'), { target: { value: 'Gra' } })
    fireEvent.click(await screen.findByRole('button', { name: /Grace Chirwa/ }, { timeout: 2000 }))
    expect(screen.getByText('Grace Chirwa')).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalledWith('Gra')
  })
})
