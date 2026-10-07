import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StudentAssessments } from './StudentAssessments'
import { ApiError } from '../../lib/apiClient'
import { ToastProvider } from '../toast/ToastProvider'

const mockList = vi.fn()
const mockCreate = vi.fn()

vi.mock('../../lib/api', () => ({
  assessmentsApi: {
    listForStudent: (...args) => mockList(...args),
    create: (...args) => mockCreate(...args),
  },
}))

const academic = {
  id: 1,
  student: 5,
  subject: 4,
  subject_name: 'Maths',
  author: 9,
  author_name: 'Grace Banda',
  category: 'ACADEMIC',
  comment: 'Strong on fractions.',
  created_at: '2026-10-05T09:00:00Z',
}
const behavioural = {
  ...academic,
  id: 2,
  subject: 6,
  subject_name: 'Physics',
  author_name: 'Peter Phiri',
  category: 'BEHAVIOURAL',
  comment: 'Talks over others.',
}
const maths = { id: 4, name: 'Maths' }

function renderIt(props = {}) {
  return render(
    <ToastProvider>
      <StudentAssessments studentId={5} studentName="Alice Wang" {...props} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([])
  mockCreate.mockReset()
})

describe('StudentAssessments', () => {
  it('lists each assessment with its author, subject, type and comment', async () => {
    mockList.mockResolvedValue([academic, behavioural])
    renderIt()

    const first = (await screen.findByText('Strong on fractions.')).closest('li')
    expect(within(first).getByText('Grace Banda')).toBeInTheDocument()
    expect(within(first).getByText('Maths')).toBeInTheDocument()
    expect(within(first).getByText('Academic')).toBeInTheDocument()
    expect(within(first).getByText('GB')).toBeInTheDocument()

    const second = screen.getByText('Talks over others.').closest('li')
    expect(within(second).getByText('Peter Phiri')).toBeInTheDocument()
    expect(within(second).getByText('Behavioural')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith(5)
  })

  it('shows an empty state, and no filter, when there is nothing yet', async () => {
    renderIt()

    expect(await screen.findByText('No assessments yet.')).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Filter assessments' })).not.toBeInTheDocument()
  })

  it('filters by type', async () => {
    mockList.mockResolvedValue([academic, behavioural])
    renderIt()
    await screen.findByText('Strong on fractions.')

    const filter = screen.getByRole('group', { name: 'Filter assessments' })
    fireEvent.click(within(filter).getByRole('button', { name: 'Behavioural' }))
    expect(screen.queryByText('Strong on fractions.')).not.toBeInTheDocument()
    expect(screen.getByText('Talks over others.')).toBeInTheDocument()

    fireEvent.click(within(filter).getByRole('button', { name: 'All' }))
    expect(screen.getByText('Strong on fractions.')).toBeInTheDocument()
  })

  it('says so when the chosen type has none', async () => {
    mockList.mockResolvedValue([academic])
    renderIt()
    await screen.findByText('Strong on fractions.')

    fireEvent.click(screen.getByRole('button', { name: 'Behavioural' }))
    expect(screen.getByText('No behavioural assessments yet.')).toBeInTheDocument()
  })

  it('reports a failed load', async () => {
    mockList.mockRejectedValue(new ApiError(500, {}))
    renderIt()

    expect(await screen.findByText('Could not load assessments.')).toBeInTheDocument()
  })

  it('is read-only without a subject to write under', async () => {
    renderIt()
    await screen.findByText('No assessments yet.')

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add assessment' })).not.toBeInTheDocument()
  })

  it('adds an academic assessment and puts it at the top of the list', async () => {
    mockList.mockResolvedValue([behavioural])
    mockCreate.mockResolvedValue({ ...academic, id: 7, comment: 'Much improved.' })
    renderIt({ composeSubject: maths })
    await screen.findByText('Talks over others.')

    const box = screen.getByLabelText('Comment on Alice Wang')
    const submit = screen.getByRole('button', { name: 'Add assessment' })
    expect(submit).toBeDisabled()

    fireEvent.change(box, { target: { value: 'Much improved.' } })
    fireEvent.click(submit)

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(5, { subject: 4, category: 'ACADEMIC', comment: 'Much improved.' }),
    )
    const rows = await screen.findAllByRole('listitem')
    expect(within(rows[0]).getByText('Much improved.')).toBeInTheDocument()
    expect(box).toHaveValue('')
  })

  it('adds a behavioural assessment when that type is picked', async () => {
    mockCreate.mockResolvedValue({ ...behavioural, id: 8 })
    renderIt({ composeSubject: maths })
    await screen.findByText('No assessments yet.')

    const picker = screen.getByRole('radiogroup', { name: 'Assessment type' })
    expect(within(picker).getByRole('radio', { name: 'Academic' })).toBeChecked()
    fireEvent.click(within(picker).getByRole('radio', { name: 'Behavioural' }))
    expect(within(picker).getByRole('radio', { name: 'Behavioural' })).toBeChecked()

    fireEvent.change(screen.getByLabelText('Comment on Alice Wang'), { target: { value: 'Talks over others.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }))

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith(5, { subject: 4, category: 'BEHAVIOURAL', comment: 'Talks over others.' }),
    )
  })

  it('will not submit a whitespace-only comment', async () => {
    renderIt({ composeSubject: maths })
    await screen.findByText('No assessments yet.')

    fireEvent.change(screen.getByLabelText('Comment on Alice Wang'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Add assessment' })).toBeDisabled()
  })

  it("shows the server's refusal and keeps what was typed", async () => {
    mockCreate.mockRejectedValue(
      new ApiError(403, { detail: 'You can only assess students enrolled in a subject you teach.' }),
    )
    renderIt({ composeSubject: maths })
    await screen.findByText('No assessments yet.')

    const box = screen.getByLabelText('Comment on Alice Wang')
    fireEvent.change(box, { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add assessment' }))

    expect(await screen.findByText('You can only assess students enrolled in a subject you teach.')).toBeInTheDocument()
    expect(box).toHaveValue('Draft')
  })
})
