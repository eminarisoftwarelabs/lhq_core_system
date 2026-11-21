import { render, screen, within } from '@testing-library/react'
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

const maths = { id: 1, name: 'Maths', taught_by_me: true }

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

  describe('grouped by tutor', () => {
    const subject = {
      id: 1,
      name: 'Maths',
      taught_by_me: false,
      tutors: [
        { id: 4, name: 'Mr Banda' },
        { id: 5, name: 'Ms Phiri' },
        { id: 6, name: 'Mr Zulu' },
      ],
    }
    const row = (id, name, tutor, slots, extra = {}) => ({
      id,
      student_subject_id: id * 10,
      full_name: name,
      student_number: `STU-${id}`,
      tutor,
      mode: 'IN_PERSON',
      slots,
      ...extra,
    })
    const roster = [
      row(1, 'Alice Wang', { id: 4, name: 'Mr Banda' }, [
        { weekday: 0, start_time: '16:00', end_time: '17:00' },
        { weekday: 3, start_time: '16:00', end_time: '17:00' },
      ]),
      row(2, 'Bob Chen', { id: 5, name: 'Ms Phiri' }, [{ weekday: 2, start_time: '10:00', end_time: '11:00' }], { mode: 'ONLINE' }),
    ]

    function renderWith(sub) {
      return render(
        <MemoryRouter>
          <SubjectRoster subject={sub} />
        </MemoryRouter>,
      )
    }

    it('shows a heading per tutor with their students, weekly times and mode underneath', async () => {
      mockGetSubjectRoster.mockResolvedValue(roster)
      renderWith(subject)

      const banda = within(await screen.findByRole('region', { name: /Mr Banda/ }))
      expect(banda.getByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/students/1')
      expect(banda.getByText('Monday 16:00–17:00, Thursday 16:00–17:00 · In person')).toBeInTheDocument()
      expect(banda.queryByText('Bob Chen')).not.toBeInTheDocument()

      const phiri = within(screen.getByRole('region', { name: /Ms Phiri/ }))
      expect(phiri.getByText('Wednesday 10:00–11:00 · Online')).toBeInTheDocument()
      expect(screen.getByText('2 active students')).toBeInTheDocument()
    })

    it('shows "No students yet" for a tutor who teaches the subject but has none', async () => {
      mockGetSubjectRoster.mockResolvedValue(roster)
      renderWith(subject)

      const zulu = within(await screen.findByRole('region', { name: /Mr Zulu/ }))
      expect(zulu.getByText('No students yet')).toBeInTheDocument()
    })

    it('still lists tutors with no students when the whole roster is empty', async () => {
      mockGetSubjectRoster.mockResolvedValue([])
      renderWith(subject)

      expect(await screen.findAllByText('No students yet')).toHaveLength(3)
      expect(screen.queryByText('No active students enrolled in this subject yet.')).not.toBeInTheDocument()
    })

    it('keeps a tutor who no longer teaches the subject but still has a student', async () => {
      mockGetSubjectRoster.mockResolvedValue([row(3, 'Cara Zulu', { id: 99, name: 'Former Tutor' }, [])])
      renderWith(subject)

      const former = within(await screen.findByRole('region', { name: /Former Tutor/ }))
      expect(former.getByRole('link', { name: 'Cara Zulu' })).toBeInTheDocument()
      expect(former.getByText('No weekly time yet · In person')).toBeInTheDocument()
    })

    it('shows a tutor one flat list with no tutor headings', async () => {
      mockUseAuth.mockReturnValue(TUTOR)
      mockGetSubjectRoster.mockResolvedValue([roster[0]])
      renderWith({ id: 1, name: 'Maths', taught_by_me: true })

      expect(await screen.findByRole('link', { name: 'Alice Wang' })).toHaveAttribute('href', '/subjects/1/students/1')
      expect(screen.queryByRole('region')).not.toBeInTheDocument()
      expect(screen.getByText('1 active student')).toBeInTheDocument()
    })
  })
})
