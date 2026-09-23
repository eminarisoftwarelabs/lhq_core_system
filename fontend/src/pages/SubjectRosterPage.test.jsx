import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectRosterPage } from './SubjectRosterPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockGetSubject = vi.fn()
const mockGetSubjectRoster = vi.fn()

vi.mock('../lib/api', () => ({
  academicsApi: {
    getSubject: (...args) => mockGetSubject(...args),
  },
  clientsApi: {
    getSubjectRoster: (...args) => mockGetSubjectRoster(...args),
  },
}))

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter initialEntries={['/subjects/1/roster']}>
        <Routes>
          <Route path="/subjects/:id/roster" element={<SubjectRosterPage />} />
        </Routes>
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockGetSubject.mockReset().mockResolvedValue({ id: 1, name: 'Maths' })
  mockGetSubjectRoster.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectRosterPage', () => {
  it('shows the subject name in the header and a link back to the subject', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Maths roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Back to subject/ })).toHaveAttribute('href', '/subjects/1')
  })

  it('shows a message and an icon when no students are enrolled', async () => {
    renderPage()

    expect(await screen.findByText('No active students enrolled in this subject yet.')).toBeInTheDocument()
    expect(document.querySelector('.empty-state__icon')).toBeInTheDocument()
    expect(await screen.findByText('0 active students')).toBeInTheDocument()
  })

  it('lists each student with a link, their number, and grade', async () => {
    mockGetSubjectRoster.mockResolvedValue([
      { id: 5, full_name: 'Alice Wang', student_number: 'STU-000001', grade: 'B+' },
    ])
    renderPage()

    const link = await screen.findByRole('link', { name: 'Alice Wang' })
    expect(link).toHaveAttribute('href', '/students/5')
    expect(screen.getByText('STU-000001')).toBeInTheDocument()
    expect(screen.getByText('B+')).toBeInTheDocument()
    // Accessible name stays exactly the student's name even though the row
    // carries more visible text (number, grade) - see the stretched-link
    // comment in SubjectRosterPage.jsx / index.css.
    expect(link).toHaveAccessibleName('Alice Wang')
  })

  it('shows initials, an aria-label on the grade badge, and the singular/plural header count', async () => {
    mockGetSubjectRoster.mockResolvedValue([
      { id: 5, full_name: 'Alice Wang', student_number: 'STU-000001', grade: 'B+' },
    ])
    renderPage()

    await screen.findByRole('link', { name: 'Alice Wang' })
    expect(screen.getByText('AW')).toBeInTheDocument()
    expect(screen.getByLabelText('Grade B+')).toBeInTheDocument()
    expect(screen.getByText('1 active student')).toBeInTheDocument()
  })

  it('joins student number, school, and year group in the subtext, dropping missing fields', async () => {
    mockGetSubjectRoster.mockResolvedValue([
      { id: 5, full_name: 'Alice Wang', student_number: 'STU-000001', school: 'Kamuzu Academy', year_group: 9 },
      { id: 6, full_name: 'Isaac Kanyenda', student_number: 'STU-000030' },
    ])
    renderPage()

    await screen.findByRole('link', { name: 'Alice Wang' })
    expect(screen.getByText('STU-000001 · Kamuzu Academy · Year 9')).toBeInTheDocument()
    expect(screen.getByText('STU-000030')).toBeInTheDocument()
    expect(screen.getByText('2 active students')).toBeInTheDocument()
  })

  it('shows "Subject not found." for a 404', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockGetSubject.mockRejectedValue(new ApiError(404, {}))
    renderPage()

    expect(await screen.findByText('Subject not found.')).toBeInTheDocument()
  })
})
