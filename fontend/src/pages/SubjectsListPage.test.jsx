import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectsListPage } from './SubjectsListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockListAllSubjects = vi.fn()
vi.mock('../lib/api', () => ({
  academicsApi: {
    listAllSubjects: (...args) => mockListAllSubjects(...args),
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
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SubjectsListPage', () => {
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

  it('opens a tutor on their own subjects as cards, with the lesson time', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockListAllSubjects.mockResolvedValue(
      tutorCatalog([2]).map((s) =>
        s.id === 2 ? { ...s, timetable_slot: { day_of_week: 2, start_time: '14:00:00', end_time: '15:30:00' } } : s,
      ),
    )
    renderPage()

    expect(await screen.findByRole('heading', { name: 'My subjects' })).toBeInTheDocument()
    const mine = screen.getByRole('list', { name: 'My subjects' })
    const card = within(mine).getByRole('link', { name: /Physics/ })
    expect(card).toHaveAttribute('href', '/subjects/2')
    expect(card).toHaveClass('dashboard-card')
    expect(within(card).getByText('IGCSE · 0625')).toBeInTheDocument()
    expect(within(card).getByText('Core / Extended')).toBeInTheDocument()
    expect(within(card).getByText('Wednesday 14:00–15:30')).toBeInTheDocument()
    // Only what they teach; the catalog stays behind the link.
    expect(within(mine).getAllByRole('listitem')).toHaveLength(1)
    expect(screen.queryByText('Mathematics')).not.toBeInTheDocument()
    expect(screen.getByText('1', { selector: '.onboarding-section__count' })).toBeInTheDocument()
  })

  it('says when a taught subject has no lesson time yet', async () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    mockListAllSubjects.mockResolvedValue(tutorCatalog([1]))
    renderPage()
    expect(await screen.findByText('No lesson time yet')).toBeInTheDocument()
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
    expect(screen.queryByRole('list', { name: 'My subjects' })).not.toBeInTheDocument()
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
