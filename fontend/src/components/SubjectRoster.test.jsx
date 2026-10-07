import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectRoster } from './SubjectRoster'
import { ApiError } from '../lib/apiClient'

const mockGetSubjectRoster = vi.fn()

vi.mock('../lib/api', () => ({
  clientsApi: {
    getSubjectRoster: (...args) => mockGetSubjectRoster(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const OWNER = { user: { id: 1, role: 'OWNER', tutor_profile: null }, isStaffLevel: true }
const TUTOR = { user: { id: 2, role: 'TUTOR', tutor_profile: { id: 9 } }, isStaffLevel: false }

const maths = { id: 1, name: 'Maths', tutor: 9 }

function renderPage() {
  return render(
    <MemoryRouter>
      <SubjectRoster subject={maths} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseAuth.mockReturnValue(OWNER)
  mockGetSubjectRoster.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectRoster', () => {
  it('asks for this subject\'s roster and titles the card', async () => {
    renderPage()

    expect(await screen.findByText('0 active students')).toBeInTheDocument()
    expect(screen.getByText('Class roster')).toBeInTheDocument()
    expect(mockGetSubjectRoster).toHaveBeenCalledWith(1)
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
    // comment in SubjectRoster.jsx / index.css.
    expect(link).toHaveAccessibleName('Alice Wang')
  })

  it("sends the class's tutor to the student's assessment page, not the staff-only record", async () => {
    mockUseAuth.mockReturnValue(TUTOR)
    mockGetSubjectRoster.mockResolvedValue([{ id: 5, full_name: 'Alice Wang', student_number: 'STU-000001' }])
    renderPage()

    expect(await screen.findByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/subjects/1/students/5')
  })

  it('sends a staff member who teaches the class to the assessment page too', async () => {
    mockUseAuth.mockReturnValue({ user: { id: 1, role: 'OWNER', tutor_profile: { id: 9 } }, isStaffLevel: true })
    mockGetSubjectRoster.mockResolvedValue([{ id: 5, full_name: 'Alice Wang', student_number: 'STU-000001' }])
    renderPage()

    expect(await screen.findByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/subjects/1/students/5')
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

  it('reports a failed load without a count', async () => {
    mockGetSubjectRoster.mockRejectedValue(new ApiError(500, {}))
    renderPage()

    expect(await screen.findByText('Could not load the class roster.')).toBeInTheDocument()
    expect(screen.queryByText(/active student/)).not.toBeInTheDocument()
  })
})
