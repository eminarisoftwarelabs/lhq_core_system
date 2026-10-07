import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentNotesPanel } from './StudentNotesPanel'
import { ToastProvider } from './toast/ToastProvider'
import { ApiError } from '../lib/apiClient'

const mockListNotes = vi.fn()
const mockAddNote = vi.fn()

vi.mock('../lib/api', () => ({
  clientsApi: {
    listStudentNotes: (...args) => mockListNotes(...args),
    addStudentNote: (...args) => mockAddNote(...args),
  },
}))

const academicNote = {
  id: 2,
  subject: 1,
  subject_name: 'Maths',
  category: 'ACADEMIC',
  text: 'Solid grasp of fractions.',
  author: 9,
  author_name: 'Tessa Tutor',
  created_at: '2026-03-10T10:00:00Z',
}
const behavioralNote = {
  id: 1,
  subject: 2,
  subject_name: 'Physics',
  category: 'BEHAVIORAL',
  text: 'Distracted in the second half.',
  author: 10,
  author_name: 'Otto Other',
  created_at: '2026-03-09T10:00:00Z',
}

const maths = { id: 1, name: 'Maths' }
const physics = { id: 2, name: 'Physics' }

function renderPanel(props = {}) {
  return render(
    <ToastProvider>
      <StudentNotesPanel studentId={5} sharedSubjects={[maths]} {...props} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockListNotes.mockReset().mockResolvedValue({ count: 2, next: null, results: [academicNote, behavioralNote] })
  mockAddNote.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StudentNotesPanel', () => {
  it('lists each assessment with its type, subject, author and text', async () => {
    renderPanel()

    expect(await screen.findByText('Solid grasp of fractions.')).toBeInTheDocument()
    expect(screen.getByText('Distracted in the second half.')).toBeInTheDocument()
    expect(screen.getByText(/Tessa Tutor/)).toBeInTheDocument()
    expect(screen.getByText(/Otto Other/)).toBeInTheDocument()
    expect(screen.getByText('Physics')).toBeInTheDocument()
    expect(mockListNotes).toHaveBeenCalledWith(5, { category: '', page: 1 })
  })

  it('says so when there are no assessments yet', async () => {
    mockListNotes.mockResolvedValue({ count: 0, next: null, results: [] })
    renderPanel()

    expect(await screen.findByText('No assessments yet.')).toBeInTheDocument()
  })

  it('shows no add form to someone who does not teach the student, only the notes', async () => {
    renderPanel({ sharedSubjects: [] })

    expect(await screen.findByText('Solid grasp of fractions.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add assessment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Tutors add assessments from their class roster.')).toBeInTheDocument()
  })

  it('posts an academic assessment by default, clears the box, and shows it at the top', async () => {
    const created = { ...academicNote, id: 3, text: 'Great improvement.', created_at: '2026-03-11T10:00:00Z' }
    mockAddNote.mockResolvedValue(created)
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Great improvement.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }))

    await waitFor(() =>
      expect(mockAddNote).toHaveBeenCalledWith(5, { subject: 1, category: 'ACADEMIC', text: 'Great improvement.' }),
    )
    expect(await screen.findByText('Great improvement.')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('')
    const items = screen.getAllByRole('listitem')
    expect(within(items[0]).getByText('Great improvement.')).toBeInTheDocument()
  })

  it('posts a behavioral comment when that type is chosen', async () => {
    mockAddNote.mockResolvedValue({ ...behavioralNote, id: 4 })
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')

    const typeGroup = screen.getByRole('group', { name: 'Type' })
    fireEvent.click(within(typeGroup).getByRole('button', { name: 'Behavioral' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Calm and focused.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }))

    await waitFor(() =>
      expect(mockAddNote).toHaveBeenCalledWith(5, { subject: 1, category: 'BEHAVIORAL', text: 'Calm and focused.' }),
    )
  })

  it('does not let an empty or whitespace only assessment be submitted', async () => {
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')

    const submit = screen.getByRole('button', { name: 'Add assessment' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(submit).toBeDisabled()
  })

  it('offers a subject picker only when the tutor teaches the student in several, preselecting the one they came from', async () => {
    mockAddNote.mockResolvedValue({ ...academicNote, id: 5 })
    renderPanel({ sharedSubjects: [maths, physics], preferredSubjectId: 2 })
    await screen.findByText('Solid grasp of fractions.')

    const picker = screen.getByLabelText('Subject')
    expect(picker).toHaveValue('2')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Note' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }))
    await waitFor(() => expect(mockAddNote).toHaveBeenCalledWith(5, { subject: 2, category: 'ACADEMIC', text: 'Note' }))
  })

  it('has no subject picker when there is only one subject', async () => {
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')

    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
  })

  it('keeps what was typed and shows the server message when saving fails', async () => {
    mockAddNote.mockRejectedValue(new ApiError(400, { subject: ['Choose a subject you teach this student in.'] }))
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep me' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }))

    expect(await screen.findByText('Choose a subject you teach this student in.')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveValue('Keep me')
  })

  it('filters by type through the API', async () => {
    mockListNotes
      .mockResolvedValueOnce({ count: 2, next: null, results: [academicNote, behavioralNote] })
      .mockResolvedValueOnce({ count: 1, next: null, results: [behavioralNote] })
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')

    const filter = screen.getByRole('group', { name: 'Filter assessments' })
    fireEvent.click(within(filter).getByRole('button', { name: 'Behavioral' }))

    await waitFor(() => expect(mockListNotes).toHaveBeenLastCalledWith(5, { category: 'BEHAVIORAL', page: 1 }))
    await waitFor(() => expect(screen.queryByText('Solid grasp of fractions.')).not.toBeInTheDocument())
    expect(screen.getByText('Distracted in the second half.')).toBeInTheDocument()
  })

  it('loads older assessments a page at a time', async () => {
    mockListNotes
      .mockResolvedValueOnce({ count: 2, next: 'http://api/?page=2', results: [academicNote] })
      .mockResolvedValueOnce({ count: 2, next: null, results: [behavioralNote] })
    renderPanel()
    await screen.findByText('Solid grasp of fractions.')
    expect(screen.queryByText('Distracted in the second half.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show older assessments' }))

    expect(await screen.findByText('Distracted in the second half.')).toBeInTheDocument()
    expect(mockListNotes).toHaveBeenLastCalledWith(5, { category: '', page: 2 })
    expect(screen.queryByRole('button', { name: 'Show older assessments' })).not.toBeInTheDocument()
  })

  it('shows an error when the assessments cannot be loaded', async () => {
    mockListNotes.mockRejectedValue(new ApiError(500, null))
    renderPanel()

    expect(await screen.findByText('Could not load assessments.')).toBeInTheDocument()
  })
})
