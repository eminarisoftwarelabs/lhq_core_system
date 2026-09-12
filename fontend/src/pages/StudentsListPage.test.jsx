import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentsListPage } from './StudentsListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockSearch = vi.fn()
const mockListEnrollments = vi.fn()
vi.mock('../lib/api', () => ({
  clientsApi: {
    searchStudents: (...args) => mockSearch(...args),
  },
  enrollmentsApi: {
    list: (...args) => mockListEnrollments(...args),
  },
}))

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter>
        <StudentsListPage />
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockSearch.mockReset()
  mockSearch.mockResolvedValue({
    count: 1,
    results: [{ id: 1, full_name: 'Alice Wang', student_number: 'STU-000001' }],
  })
  mockListEnrollments.mockReset().mockResolvedValue({ count: 0, results: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StudentsListPage', () => {
  it('loads and shows results for an empty query on mount', async () => {
    renderPage()

    expect(await screen.findByText('Alice Wang')).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalledWith('', 1)
  })

  it('debounces the search query - typing does not fire a request per keystroke', async () => {
    renderPage()
    await screen.findByText('Alice Wang')
    mockSearch.mockClear()

    fireEvent.change(screen.getByLabelText(/search by name or student number/i), {
      target: { value: 'alice' },
    })

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('alice', 1), { timeout: 1000 })
    expect(mockSearch).toHaveBeenCalledTimes(1)
  })

  it('shows a message when no students are found', async () => {
    mockSearch.mockResolvedValue({ count: 0, results: [] })
    renderPage()

    expect(await screen.findByText('No students found.')).toBeInTheDocument()
  })

  it('shows the student count and the student number, with no initials avatar', async () => {
    renderPage()

    expect(await screen.findByText('Alice Wang')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('STU-000001')).toBeInTheDocument()
    expect(screen.queryByText('AW')).not.toBeInTheDocument()
  })

  it('does not show a grade column - grade is never rendered in the directory', async () => {
    mockSearch.mockResolvedValue({
      count: 1,
      results: [{ id: 1, full_name: 'Alice Wang', student_number: 'STU-000001', grade: 'B+', year_group: 7, school: 'Kamuzu Academy' }],
    })
    renderPage()

    await screen.findByText('Alice Wang')
    expect(screen.queryByText(/B\+/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Grade/)).not.toBeInTheDocument()
  })

  it("shows the student's active enrollment status, subjects, and learning mode", async () => {
    mockListEnrollments.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 1,
          student: 1,
          subject_names: ['Maths', 'Physics'],
          learning_mode: 'IN_PERSON',
          status: 'ACTIVE',
          created_at: '2026-01-15T00:00:00Z',
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Maths, Physics · In person')).toBeInTheDocument()
  })

  it('shows the school on the student line and the enrollment date next to the status', async () => {
    mockSearch.mockResolvedValue({
      count: 1,
      results: [{ id: 1, full_name: 'Alice Wang', student_number: 'STU-000001', school: 'Kamuzu Academy' }],
    })
    mockListEnrollments.mockResolvedValue({
      count: 1,
      results: [
        {
          id: 1,
          student: 1,
          subject_names: ['Maths'],
          learning_mode: 'IN_PERSON',
          status: 'ACTIVE',
          created_at: '2026-01-15T00:00:00Z',
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('STU-000001 · Kamuzu Academy')).toBeInTheDocument()
    expect(screen.getByText('Enrolled Jan 15, 2026')).toBeInTheDocument()
  })

  it('shows the school alone, with no stray separator, when the student has a blank student number', async () => {
    mockSearch.mockResolvedValue({
      count: 1,
      results: [{ id: 1, full_name: 'Legacy Student', student_number: '', school: 'St. Andrews International' }],
    })
    renderPage()

    expect(await screen.findByText('St. Andrews International')).toBeInTheDocument()
  })

  it('does not show an enrollment date for a student with no enrollment', async () => {
    mockSearch.mockResolvedValue({
      count: 1,
      results: [{ id: 1, full_name: 'Alice Wang', student_number: 'STU-000001', school: 'Kamuzu Academy' }],
    })
    renderPage()

    expect(await screen.findByText('STU-000001 · Kamuzu Academy')).toBeInTheDocument()
    expect(screen.queryByText(/Enrolled/)).not.toBeInTheDocument()
  })

  it('prefers an ACTIVE enrollment over a more recent withdrawn one for the same student', async () => {
    mockListEnrollments.mockResolvedValue({
      count: 2,
      results: [
        {
          id: 2,
          student: 1,
          subject_names: ['Chemistry'],
          learning_mode: 'ONLINE',
          status: 'WITHDRAWN',
          created_at: '2026-02-01T00:00:00Z',
        },
        {
          id: 1,
          student: 1,
          subject_names: ['Maths'],
          learning_mode: 'IN_PERSON',
          status: 'ACTIVE',
          created_at: '2026-01-15T00:00:00Z',
        },
      ],
    })
    renderPage()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Maths · In person')).toBeInTheDocument()
    expect(screen.queryByText('Chemistry · Online')).not.toBeInTheDocument()
  })

  it('shows "Not enrolled" for a student with no enrollment history', async () => {
    renderPage()

    expect(await screen.findByText('Not enrolled')).toBeInTheDocument()
  })

  it('shows Previous/Next controls once there is more than one page, with Previous disabled on page 1', async () => {
    mockSearch.mockImplementation((q, page) =>
      Promise.resolve(
        page === 1
          ? {
              count: 21,
              next: 'http://testserver/api/students/?page=2',
              previous: null,
              results: [{ id: 1, full_name: 'Page One Student', student_number: 'STU-000001' }],
            }
          : {
              count: 21,
              next: null,
              previous: 'http://testserver/api/students/?page=1',
              results: [{ id: 2, full_name: 'Page Two Student', student_number: 'STU-000002' }],
            },
      ),
    )
    renderPage()

    expect(await screen.findByText('Page One Student')).toBeInTheDocument()
    expect(screen.queryByText('Page Two Student')).not.toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('clicking Next loads page 2, and Next disables once there is no next page', async () => {
    mockSearch.mockImplementation((q, page) =>
      Promise.resolve(
        page === 1
          ? {
              count: 21,
              next: 'http://testserver/api/students/?page=2',
              previous: null,
              results: [{ id: 1, full_name: 'Page One Student', student_number: 'STU-000001' }],
            }
          : {
              count: 21,
              next: null,
              previous: 'http://testserver/api/students/?page=1',
              results: [{ id: 2, full_name: 'Page Two Student', student_number: 'STU-000002' }],
            },
      ),
    )
    renderPage()
    await screen.findByText('Page One Student')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByText('Page Two Student')).toBeInTheDocument()
    expect(screen.queryByText('Page One Student')).not.toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalledWith('', 2)
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled()
  })

  it('resets to page 1 when the search query changes', async () => {
    mockSearch.mockImplementation((q, page) =>
      Promise.resolve(
        page === 1
          ? {
              count: 21,
              next: 'http://testserver/api/students/?page=2',
              previous: null,
              results: [{ id: 1, full_name: 'Page One Student', student_number: 'STU-000001' }],
            }
          : {
              count: 21,
              next: null,
              previous: 'http://testserver/api/students/?page=1',
              results: [{ id: 2, full_name: 'Page Two Student', student_number: 'STU-000002' }],
            },
      ),
    )
    renderPage()
    await screen.findByText('Page One Student')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 2')
    mockSearch.mockClear()

    fireEvent.change(screen.getByLabelText(/search by name or student number/i), {
      target: { value: 'alice' },
    })

    await waitFor(() => expect(mockSearch).toHaveBeenCalledWith('alice', 1), { timeout: 1000 })
  })

  it('does not show pagination controls when everything fits on one page', async () => {
    renderPage()

    await screen.findByText('Alice Wang')
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
  })

  it('fetches every page of enrollments, so a student past page 1 still shows the right status', async () => {
    mockListEnrollments.mockImplementation(({ page } = {}) =>
      Promise.resolve(
        page === 2
          ? {
              count: 21,
              next: null,
              results: [
                {
                  id: 1,
                  student: 1,
                  subject_names: ['Maths'],
                  learning_mode: 'IN_PERSON',
                  status: 'ACTIVE',
                  created_at: '2026-01-15T00:00:00Z',
                },
              ],
            }
          : {
              count: 21,
              next: 'http://testserver/api/enrollments/?page=2',
              results: [
                {
                  id: 2,
                  student: 999,
                  subject_names: ['Filler'],
                  learning_mode: 'ONLINE',
                  status: 'ACTIVE',
                  created_at: '2026-01-01T00:00:00Z',
                },
              ],
            },
      ),
    )
    renderPage()

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Maths · In person')).toBeInTheDocument()
  })
})
