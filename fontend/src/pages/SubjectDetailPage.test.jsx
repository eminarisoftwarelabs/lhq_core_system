import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectDetailPage } from './SubjectDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'

const mockGetSubject = vi.fn()
const mockUpdateSubject = vi.fn()
const mockCreateTopic = vi.fn()
const mockDeleteTopic = vi.fn()
const mockListTeaching = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    getSubject: (...args) => mockGetSubject(...args),
    updateSubject: (...args) => mockUpdateSubject(...args),
    createTopic: (...args) => mockCreateTopic(...args),
    deleteTopic: (...args) => mockDeleteTopic(...args),
  },
  tutorsApi: {
    listTeaching: (...args) => mockListTeaching(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const baseSubject = {
  id: 1,
  name: 'Maths',
  tutor: 9,
  tutor_name: 'Tam Tutor',
  is_active: true,
  timetable_slot: { day_of_week: 1, start_time: '14:00:00', end_time: '15:00:00' },
  topics: [],
}

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

beforeEach(() => {
  mockUseAuth.mockReturnValue({ isStaffLevel: true })
  mockGetSubject.mockReset().mockResolvedValue(baseSubject)
  mockUpdateSubject.mockReset()
  mockCreateTopic.mockReset()
  mockDeleteTopic.mockReset()
  mockListTeaching.mockReset().mockResolvedValue([{ id: 9, name: 'Tam Tutor' }])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectDetailPage', () => {
  it('shows the subject name, status badge, tutor, timetable, and links to the roster and timetable', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Maths' })).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Tam Tutor', { selector: '.detail-header__parent' })).toBeInTheDocument()
    expect(screen.getByText('Tuesday 14:00–15:00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View class roster/ })).toHaveAttribute('href', '/subjects/1/roster')
    expect(screen.getByRole('link', { name: /Manage timetable/ })).toHaveAttribute('href', '/timetable?subject=1')
  })

  it('shows "Unassigned", "Inactive", and "No timetable slot" as fallbacks', async () => {
    mockGetSubject.mockResolvedValue({ ...baseSubject, tutor: null, tutor_name: null, is_active: false, timetable_slot: null })
    renderPage()

    await screen.findByRole('heading', { name: 'Maths' })
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('Unassigned', { selector: '.detail-header__parent' })).toBeInTheDocument()
    expect(screen.getByText('No timetable slot')).toBeInTheDocument()
  })

  it('shows a collapsed summary with an Edit button for staff, not an open form', async () => {
    renderPage()

    await screen.findByRole('heading', { name: 'Maths' })
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('reveals the edit form, pre-filled from the subject, when Edit is clicked - with no timetable fields', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Name')).toHaveValue('Maths')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Day')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/timetable slot/i)).not.toBeInTheDocument()
  })

  it('saves changes without touching the timetable slot, shows a toast, and collapses back to the summary', async () => {
    mockUpdateSubject.mockResolvedValue({ ...baseSubject, name: 'Advanced Maths' })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Advanced Maths' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdateSubject).toHaveBeenCalledWith(1, {
        name: 'Advanced Maths',
        is_active: true,
        tutor: 9,
      }),
    )
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
  })

  it('cancels out of the edit form without saving', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('Name')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(mockUpdateSubject).not.toHaveBeenCalled()
  })

  it('hides the edit affordance and the Manage timetable link for a Tutor, but still shows read-only info', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    renderPage()

    await screen.findByRole('heading', { name: 'Maths' })
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Manage timetable/ })).not.toBeInTheDocument()
    expect(screen.getByText('Tam Tutor')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows "No topics yet." when there are none', async () => {
    renderPage()

    expect(await screen.findByText('No topics yet.')).toBeInTheDocument()
  })

  it('lists topics as chips and lets staff remove one', async () => {
    mockGetSubject.mockResolvedValue({
      ...baseSubject,
      topics: [
        { id: 1, name: 'Algebra' },
        { id: 2, name: 'Geometry' },
      ],
    })
    renderPage()

    expect(await screen.findByText('Algebra')).toBeInTheDocument()
    expect(screen.getByText('Geometry')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Remove Algebra' }))
    await waitFor(() => expect(mockDeleteTopic).toHaveBeenCalledWith(1))
  })

  it('does not show remove buttons or the add-topic form for a Tutor', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockGetSubject.mockResolvedValue({ ...baseSubject, topics: [{ id: 1, name: 'Algebra' }] })
    renderPage()

    await screen.findByText('Algebra')
    expect(screen.queryByRole('button', { name: 'Remove Algebra' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Add a topic')).not.toBeInTheDocument()
  })

  it('adds a topic', async () => {
    renderPage()
    await screen.findByLabelText('Add a topic')

    fireEvent.change(screen.getByLabelText('Add a topic'), { target: { value: 'Trigonometry' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add topic' }))

    await waitFor(() => expect(mockCreateTopic).toHaveBeenCalledWith(1, { name: 'Trigonometry' }))
  })

  it('shows "Subject not found." for a 404', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockGetSubject.mockRejectedValue(new ApiError(404, {}))
    renderPage()

    expect(await screen.findByText('Subject not found.')).toBeInTheDocument()
  })
})
