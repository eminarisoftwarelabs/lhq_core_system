import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import { makeStudentSubject } from '../../test-utils/sessionFixtures'
import { ToastProvider } from '../toast/ToastProvider'
import { StudentSubjectCard } from './StudentSubjectCard'

const mockConfirmEnd = vi.fn()
const mockAddSessions = vi.fn()
vi.mock('../../lib/api', () => ({
  studentSubjectsApi: {
    confirmEnd: (...a) => mockConfirmEnd(...a),
    addSessions: (...a) => mockAddSessions(...a),
  },
}))

function renderCard(ss, props = {}) {
  const onChanged = vi.fn()
  render(
    <ToastProvider>
      <MemoryRouter>
        <StudentSubjectCard ss={ss} onChanged={onChanged} {...props} />
      </MemoryRouter>
    </ToastProvider>,
  )
  return onChanged
}

const due = (reason = 'SESSIONS_USED') =>
  makeStudentSubject({
    progress: { ...makeStudentSubject().progress, held: 24, remaining: 0, needs_end_confirmation: true, end_reason: reason, expected_end_date: '2026-11-19' },
  })

afterEach(() => vi.clearAllMocks())

describe('StudentSubjectCard', () => {
  it('summarises tutor, schedule, mode, progress and expected end', () => {
    renderCard(makeStudentSubject(), { showStudent: true })
    const card = screen.getByRole('article', { name: 'Takondwa Banda: IGCSE Physics' })
    expect(within(card).getByText('Monday 16:00–17:00')).toBeInTheDocument()
    expect(within(card).getByText('In person')).toBeInTheDocument()
    expect(within(card).getByText('10 of 24 sessions, 1 of 2 topics')).toBeInTheDocument()
    expect(within(card).getByText(/Expected end/)).toHaveTextContent('Mon 15 Feb 2027')
    expect(within(card).getByText('Active')).toBeInTheDocument()
  })

  it('shows the end prompt only to staff, and only when due', () => {
    renderCard(due())
    expect(screen.queryByRole('region', { name: /Confirm the end/ })).not.toBeInTheDocument()
  })

  it('confirms the last session date', async () => {
    const updated = { ...due(), confirmed_end_date: '2026-11-19' }
    mockConfirmEnd.mockResolvedValue(updated)
    const onChanged = renderCard(due(), { canManage: true })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm last session' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated))
    expect(mockConfirmEnd).toHaveBeenCalledWith(7, '2026-11-19')
  })

  it('shows a refusal from the server', async () => {
    mockConfirmEnd.mockRejectedValue(new ApiError(400, { last_date: ['A session was held on Thu 26 Nov, after that date.'] }))
    renderCard(due('TOPICS_COVERED'), { canManage: true })
    expect(screen.getByText('All of the student’s topics have been covered.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm last session' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('after that date')
  })

  it('links staff to the sessions on the timetable', () => {
    renderCard(makeStudentSubject(), { canManage: true })
    expect(screen.getByRole('link', { name: 'View sessions' })).toHaveAttribute('href', '/timetable?student=1&subject=3')
  })

  it('marks an ended one and shows its confirmed last session', () => {
    renderCard(makeStudentSubject({ status: 'ENDED', confirmed_end_date: '2026-11-30', progress: { ...makeStudentSubject().progress, expected_end_date: '2026-11-30' } }))
    expect(screen.getByText('Ended')).toBeInTheDocument()
    expect(screen.getByText(/Last session/)).toHaveTextContent('Mon 30 Nov 2026')
  })
})
