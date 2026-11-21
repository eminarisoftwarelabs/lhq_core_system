import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectDetailPage } from './SubjectDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'

const mockGetSubject = vi.fn()
const mockUpdateSubject = vi.fn()
const mockListTopics = vi.fn()
const mockListLevels = vi.fn()
const mockGetSubjectRoster = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    getSubject: (...args) => mockGetSubject(...args),
    updateSubject: (...args) => mockUpdateSubject(...args),
    listTopics: (...args) => mockListTopics(...args),
    listLevels: (...args) => mockListLevels(...args),
  },
  clientsApi: {
    getSubjectRoster: (...args) => mockGetSubjectRoster(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const levels = [
  { id: 3, name: 'IGCSE' },
  { id: 4, name: 'A Level' },
]

const baseSubject = {
  id: 1,
  name: 'Mathematics',
  level: 3,
  level_name: 'IGCSE',
  code: '0580',
  has_paper: true,
  is_active: true,
  taught_by_me: false,
  tutors: [{ id: 9, name: 'Tam Tutor' }],
}

const chapters = [
  {
    chapter: 'Number',
    topics: [
      { id: 11, number: '1.1', name: 'Types of number', extended_only: false, order: 1 },
      { id: 12, number: '1.17', name: 'Exponential growth and decay', extended_only: true, order: 2 },
    ],
  },
  { chapter: 'Algebra and graphs', topics: [{ id: 13, number: '2.1', name: 'Introduction', extended_only: false, order: 3 }] },
]

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={['/subjects/1']}>
          <Routes>
            <Route path="/subjects/:id" element={<SubjectDetailPage />} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

const tutorUser = { id: 2, role: 'TUTOR', tutor_profile: { id: 9 } }

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 1, role: 'OWNER' }, isStaffLevel: true })
  mockGetSubject.mockReset().mockResolvedValue(baseSubject)
  mockUpdateSubject.mockReset()
  mockListTopics.mockReset().mockResolvedValue(chapters)
  mockListLevels.mockReset().mockResolvedValue(levels)
  mockGetSubjectRoster.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectDetailPage', () => {
  it('shows name, level and code, the Core / Extended flag, status, tutors and a timetable link', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mathematics' })).toBeInTheDocument()
    expect(screen.getByText('IGCSE · 0580')).toBeInTheDocument()
    expect(screen.getByText('Core / Extended')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Tam Tutor', { selector: '.detail-header__parent' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Manage timetable' })).toHaveAttribute('href', '/timetable?subject=1')
  })

  it('lists topics grouped by chapter with an Extended badge on extended-only topics', async () => {
    renderPage()

    const number = await screen.findByRole('region', { name: 'Number' })
    const exponential = within(number).getByText('Exponential growth and decay').closest('li')
    expect(within(exponential).getByText('Extended')).toBeInTheDocument()
    expect(within(exponential).getByText('1.17')).toBeInTheDocument()
    expect(within(within(number).getByText('Types of number').closest('li')).queryByText('Extended')).toBeNull()
    expect(screen.getByRole('region', { name: 'Algebra and graphs' })).toBeInTheDocument()
    expect(mockListTopics).toHaveBeenCalledWith(1)
    // Read-only: no way to add or remove topics.
    expect(screen.queryByLabelText(/Add a topic/)).not.toBeInTheDocument()
  })

  it('says when a subject has no topics loaded', async () => {
    mockListTopics.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No topics loaded for this subject yet.')).toBeInTheDocument()
  })

  it('edits catalog fields for staff, including the level', async () => {
    mockUpdateSubject.mockResolvedValue({ ...baseSubject, code: '0607', level: 4, level_name: 'A Level' })
    renderPage()
    await screen.findByRole('heading', { name: 'Mathematics' })

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(screen.getByLabelText('Level')).toHaveValue('3'))
    fireEvent.change(screen.getByLabelText('Syllabus code'), { target: { value: '0607' } })
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(1, {
        name: 'Mathematics',
        level: 4,
        code: '0607',
        has_paper: true,
        is_active: true,
      }),
    )
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(screen.getByText('A Level · 0607')).toBeInTheDocument()
  })

  it('shows who teaches it in the staff summary, and a hint when nobody does', async () => {
    mockGetSubject.mockResolvedValue({ ...baseSubject, tutors: [] })
    renderPage()
    expect(await screen.findByText(/No tutors yet\. Set subjects on a tutor/)).toBeInTheDocument()
  })

  it('gives a tutor the catalog view with no edit, no tutors and no timetable link', async () => {
    mockUseAuth.mockReturnValue({ user: tutorUser, isStaffLevel: false })
    mockGetSubject.mockResolvedValue({ ...baseSubject, tutors: undefined })
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mathematics' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Manage timetable' })).not.toBeInTheDocument()
    expect(screen.queryByText('Tam Tutor')).not.toBeInTheDocument()
    expect(mockListLevels).not.toHaveBeenCalled()
  })

  it('shows the roster to a tutor who teaches the subject, linking to assessments', async () => {
    mockUseAuth.mockReturnValue({ user: tutorUser, isStaffLevel: false })
    mockGetSubject.mockResolvedValue({ ...baseSubject, tutors: undefined, taught_by_me: true })
    mockGetSubjectRoster.mockResolvedValue([{ id: 5, full_name: 'Alice Wang', student_number: 'STU-000001' }])
    renderPage()

    expect(await screen.findByText('You teach this')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/subjects/1/students/5')
  })

  it('does not load the roster for a tutor who does not teach the subject', async () => {
    mockUseAuth.mockReturnValue({ user: tutorUser, isStaffLevel: false })
    mockGetSubject.mockResolvedValue({ ...baseSubject, tutors: undefined, taught_by_me: false })
    renderPage()

    await screen.findByRole('heading', { name: 'Mathematics' })
    expect(mockGetSubjectRoster).not.toHaveBeenCalled()
    expect(screen.queryByText('Class roster')).not.toBeInTheDocument()
  })

  it('shows staff the roster in its own card below the topics', async () => {
    mockGetSubjectRoster.mockResolvedValue([{ id: 5, full_name: 'Alice Wang', student_number: 'STU-000001' }])
    renderPage()

    expect(await screen.findByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/students/5')
    const cards = document.querySelectorAll('.form-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('Topics')
    expect(cards[1]).toHaveTextContent('Class roster')
  })

  it('still shows the subject when topics fail to load', async () => {
    mockListTopics.mockRejectedValue(new Error('boom'))
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Mathematics' })).toBeInTheDocument()
    expect(await screen.findByText('Could not load the topics.')).toBeInTheDocument()
  })

  it('shows "Subject not found." for a 404', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockGetSubject.mockRejectedValue(new ApiError(404, {}))
    renderPage()

    expect(await screen.findByText('Subject not found.')).toBeInTheDocument()
  })
})
