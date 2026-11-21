import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectsListPage } from './SubjectsListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const VIEW_KEY = 'lhq.subjects.view'
const mockListAllSubjects = vi.fn()
const mockListStudentSubjects = vi.fn()
vi.mock('../lib/api', () => ({
  academicsApi: {
    listAllSubjects: (...args) => mockListAllSubjects(...args),
  },
  studentSubjectsApi: {
    list: (...args) => mockListStudentSubjects(...args),
  },
}))

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderPage(path = '/subjects') {
  return render(
    <PageHeaderProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/subjects" element={<SubjectsListPage />} />
        </Routes>
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

// What a tutor's API response looks like: no `tutors`, plus taught_by_me.
function tutorCatalog(taughtIds) {
  return staffCatalog.map((subject) => {
    const rest = { ...subject, taught_by_me: taughtIds.includes(subject.id) }
    delete rest.tutors
    return rest
  })
}

const staffCatalog = [
  { id: 1, name: 'Mathematics', level: 1, level_name: 'Primary (Year 6)', code: '0096', has_paper: false, is_active: true, tutors: [] },
  {
    id: 2,
    name: 'Physics',
    level: 3,
    level_name: 'IGCSE',
    code: '0625',
    has_paper: true,
    is_active: true,
    tutors: [
      { id: 7, name: 'Tam Tutor' },
      { id: 8, name: 'Olu Other' },
    ],
  },
  { id: 3, name: 'Geography', level: 3, level_name: 'IGCSE', code: '', has_paper: false, is_active: false, tutors: [] },
]

function levelSection(name) {
  return screen.getByRole('heading', { name: new RegExp(`^${name}`) }).closest('section')
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ isStaffLevel: true })
  mockListAllSubjects.mockReset().mockResolvedValue(staffCatalog)
  mockListStudentSubjects.mockReset().mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('SubjectsListPage (list view)', () => {
  beforeEach(() => {
    window.localStorage.setItem(VIEW_KEY, 'list')
  })

  it('groups subjects under their level', async () => {
    renderPage()

    await screen.findByText('Physics')
    expect(within(levelSection('Primary')).getByText('Mathematics')).toBeInTheDocument()
    const igcse = within(levelSection('IGCSE'))
    expect(igcse.getByText('Geography')).toBeInTheDocument()
    expect(igcse.getByText('Physics')).toBeInTheDocument()
  })

  it('shows the syllabus code and the Core / Extended flag', async () => {
    renderPage()

    expect(await screen.findByText('0625')).toBeInTheDocument()
    expect(screen.getAllByText('Core / Extended')).toHaveLength(1)
    expect(screen.getByText('No syllabus code')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
  })

  it('shows staff who teaches each subject', async () => {
    renderPage()

    expect(await screen.findByText('Tam Tutor, Olu Other')).toBeInTheDocument()
    expect(screen.getAllByText('No tutors yet')).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'Add subject' })).toBeInTheDocument()
  })

  it('never shows tutors to a tutor browsing all subjects, and marks what they teach', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockListAllSubjects.mockResolvedValue(tutorCatalog([2]))
    renderPage('/subjects?view=all')

    expect(await screen.findByRole('heading', { name: 'All subjects' })).toBeInTheDocument()
    await screen.findByText('Physics')
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
    expect(screen.queryByText(/Tam Tutor/)).not.toBeInTheDocument()
    expect(screen.queryByText('No tutors yet')).not.toBeInTheDocument()
    expect(screen.getByText('You teach this')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add subject' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My subjects' })).toHaveAttribute('href', '/subjects')
  })

  it('says when a taught subject has no students yet', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockListAllSubjects.mockResolvedValue(tutorCatalog([1]))
    renderPage()
    expect(await screen.findByText('No students yet')).toBeInTheDocument()
  })

  it('switches a tutor to all subjects and back', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockListAllSubjects.mockResolvedValue(tutorCatalog([2]))
    renderPage()

    fireEvent.click(await screen.findByRole('link', { name: 'Browse all subjects' }))
    expect(await screen.findByRole('heading', { name: 'All subjects' })).toBeInTheDocument()
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
    expect(screen.getByText('3', { selector: '.onboarding-section__count' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'My subjects' }))
    expect(await screen.findByRole('heading', { name: 'My subjects' })).toBeInTheDocument()
    expect(screen.queryByText('Mathematics')).not.toBeInTheDocument()
    // Loaded once; switching views only filters.
    expect(mockListAllSubjects).toHaveBeenCalledTimes(1)
  })

  it('points a tutor with no subjects to My Profile and the full catalog', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockListAllSubjects.mockResolvedValue(tutorCatalog([]))
    renderPage()

    expect(await screen.findByText('You don’t teach any subjects yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My Profile' })).toHaveAttribute('href', '/me')
    expect(screen.getByRole('link', { name: 'Browse all subjects' })).toHaveAttribute('href', '/subjects?view=all')
    expect(screen.queryByText(/seed_cambridge_topics/)).not.toBeInTheDocument()
  })

  it('keeps staff on the full catalog, even with ?view=all absent', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Subjects' })).toBeInTheDocument()
    await screen.findByText('Mathematics')
    expect(screen.queryByRole('link', { name: 'Browse all subjects' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /subjects$/ })).not.toBeInTheDocument()
  })

  it('explains how to load the catalog when it is empty', async () => {
    mockListAllSubjects.mockResolvedValue([])
    renderPage()

    expect(await screen.findByText(/seed_cambridge_topics/)).toBeInTheDocument()
  })

  it('shows an error when loading fails', async () => {
    mockListAllSubjects.mockRejectedValue(new Error('down'))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load subjects.')
  })
})

const withCounts = (subject, tutor_count, active_student_count) => ({ ...subject, tutor_count, active_student_count })

describe('SubjectsListPage (thumbnails and the view switch)', () => {
  beforeEach(() => {
    mockListAllSubjects.mockResolvedValue([
      withCounts(staffCatalog[0], 0, 0),
      withCounts(staffCatalog[1], 2, 5),
      withCounts(staffCatalog[2], 1, 1),
    ])
  })

  it('opens on thumbnails by default, grouped by level, one card per subject', async () => {
    renderPage()

    await screen.findByText('Physics')
    expect(screen.getByRole('button', { name: 'Thumbnails' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false')
    const igcse = within(levelSection('IGCSE'))
    const card = igcse.getByRole('link', { name: /Physics/ })
    expect(card).toHaveAttribute('href', '/subjects/2')
    expect(card).toHaveClass('my-subject-card')
    expect(within(card).getByText('IGCSE · 0625')).toBeInTheDocument()
    expect(within(levelSection('Primary')).getByRole('link', { name: /Mathematics/ })).toBeInTheDocument()
  })

  it('shows staff the number of tutors and active students on each card', async () => {
    renderPage()

    const card = within(await screen.findByRole('link', { name: /Physics/ }))
    expect(card.getByText(/2 tutors/)).toBeInTheDocument()
    expect(card.getByText(/5 active students/)).toBeInTheDocument()
    const geography = within(screen.getByRole('link', { name: /Geography/ }))
    expect(geography.getByText(/1 tutor(?!s)/)).toBeInTheDocument()
    expect(geography.getByText(/1 active student(?!s)/)).toBeInTheDocument()
    const maths = within(screen.getByRole('link', { name: /Mathematics/ }))
    expect(maths.getByText(/0 tutors/)).toBeInTheDocument()
  })

  it('switches to the list and remembers the choice for next time', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Physics')

    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('No syllabus code')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'IGCSE subjects' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('list')

    unmount()
    renderPage()
    expect(await screen.findByText('No syllabus code')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Thumbnails' }))
    expect(screen.getByRole('list', { name: 'IGCSE subjects' })).toBeInTheDocument()
    expect(window.localStorage.getItem(VIEW_KEY)).toBe('thumbnails')
  })

  it('falls back to thumbnails when the stored choice is unusable or storage fails', async () => {
    window.localStorage.setItem(VIEW_KEY, 'grid')
    const { unmount } = renderPage()
    await screen.findByText('Physics')
    expect(screen.getByRole('button', { name: 'Thumbnails' })).toHaveAttribute('aria-pressed', 'true')
    unmount()

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    renderPage()
    await screen.findByText('Physics')
    expect(screen.getByRole('button', { name: 'Thumbnails' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
    vi.restoreAllMocks()
  })

  describe('for a tutor', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ isStaffLevel: false })
      mockListAllSubjects.mockResolvedValue(tutorCatalog([2]))
      mockListStudentSubjects.mockResolvedValue([{ id: 1, subject: { id: 2 } }, { id: 2, subject: { id: 2 } }])
    })

  it('opens a tutor on their own subjects as thumbnails, with how many students they teach', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'My subjects' })).toBeInTheDocument()
    const mine = screen.getByRole('list', { name: 'IGCSE subjects' })
    const card = within(mine).getByRole('link', { name: /Physics/ })
    expect(card).toHaveAttribute('href', '/subjects/2')
    expect(card).toHaveClass('dashboard-card')
    expect(within(card).getByText('IGCSE · 0625')).toBeInTheDocument()
    expect(within(card).getByText('Core / Extended')).toBeInTheDocument()
    expect(await within(card).findByText('2 students')).toBeInTheDocument()
    expect(mockListStudentSubjects).toHaveBeenCalledWith({ status: 'ACTIVE' })
    // Only what they teach; the catalog stays behind the link.
    expect(within(mine).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('Mathematics')).not.toBeInTheDocument()
    // The page count and the IGCSE level's count.
    expect(screen.getAllByText('1', { selector: '.onboarding-section__count' })).toHaveLength(2)
  })


    it('has the same switch, and Mine keeps working in the list', async () => {
      renderPage()
      fireEvent.click(await screen.findByRole('button', { name: 'List' }))
      expect(screen.getByText('Physics')).toBeInTheDocument()
      expect(screen.queryByText('Mathematics')).not.toBeInTheDocument()
      expect(await screen.findByText('2 students')).toBeInTheDocument()
    })

    it('never shows counts of tutors or all students to a tutor browsing the catalog', async () => {
      renderPage('/subjects?view=all')
      await screen.findByRole('link', { name: /Physics/ })
      expect(screen.queryByText(/tutors?$/)).not.toBeInTheDocument()
      expect(screen.queryByText(/active students?/)).not.toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Mathematics/ })).toBeInTheDocument()
    })
  })
})
