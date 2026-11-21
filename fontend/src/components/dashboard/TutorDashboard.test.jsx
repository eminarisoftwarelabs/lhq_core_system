import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeSession, makeSessionDetail, TUTOR_USER } from '../../test-utils/sessionFixtures'
import { ToastProvider } from '../toast/ToastProvider'
import { TutorDashboard } from './TutorDashboard'

const mockList = vi.fn()
const mockGet = vi.fn()
const mockGetHours = vi.fn()
vi.mock('../../lib/api', () => ({
  sessionsApi: { list: (...a) => mockList(...a), get: (...a) => mockGet(...a) },
  sessionChangeRequestsApi: {},
  tutorsApi: { getHours: (...a) => mockGetHours(...a) },
}))
vi.mock('../../auth/useAuth', () => ({ useAuth: () => ({ user: TUTOR_USER, isStaffLevel: false }) }))

function renderDashboard() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <TutorDashboard />
      </MemoryRouter>
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 18, 0)) // Wed 18 Nov 18:00
  mockGetHours.mockResolvedValue({ hours: '6.00' })
  mockList.mockResolvedValue([
    // Yesterday, closes in an hour: urgent.
    makeSession({ id: 1, date: '2026-11-17', start_time: '18:00', end_time: '19:00', display_status: 'UNLOGGED', log_deadline: new Date(2026, 10, 18, 19, 0).toISOString() }),
    // Today, ended at 17:00.
    makeSession({ id: 2, date: '2026-11-18', display_status: 'UNLOGGED', log_deadline: new Date(2026, 10, 19, 17, 0).toISOString(), planned_topic_names: ['Forces'] }),
    makeSession({ id: 3, date: '2026-11-18', start_time: '19:00', end_time: '20:00', student: { id: 2, name: 'Grace Chirwa' } }),
  ])
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('TutorDashboard', () => {
  it('asks for yesterday and today, the only days that can still be unlogged', async () => {
    renderDashboard()
    await screen.findByText('Unlogged')
    expect(mockList).toHaveBeenCalledWith({ from: '2026-11-17', to: '2026-11-18' })
  })

  it('counts today, the unlogged and this month’s hours', async () => {
    renderDashboard()
    expect(await screen.findByRole('link', { name: /Sessions today/ })).toHaveTextContent('2')
    expect(screen.getByRole('link', { name: /Waiting to be logged/ })).toHaveTextContent('2')
    expect(screen.getByRole('link', { name: /Hours held this month/ })).toHaveTextContent('6 h')
  })

  it('lists unlogged sessions with a countdown, urgent when under three hours', async () => {
    renderDashboard()
    const list = within(await screen.findByRole('region', { name: 'Waiting to be logged' }))
    const rows = list.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('Tue 17 Nov')
    expect(within(rows[0]).getByText('1 h 0 min left')).toHaveClass('countdown--urgent')
    expect(rows[1]).toHaveTextContent('Today')
    expect(within(rows[1]).getByText('23 h 0 min left')).not.toHaveClass('countdown--urgent')
  })

  it('shows today with what is planned', async () => {
    renderDashboard()
    const today = within(await screen.findByRole('region', { name: 'Today' }))
    expect(today.getByText('Plan: Forces')).toBeInTheDocument()
    expect(today.getByText('No topics planned yet')).toBeInTheDocument()
  })

  it('opens the session panel to log', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ id: 2, display_status: 'UNLOGGED', can_log: true }))
    renderDashboard()
    // Both unlogged rows are Physics with Takondwa; log today's (the second).
    const buttons = await screen.findAllByRole('button', { name: 'Log IGCSE Physics with Takondwa Banda' })
    fireEvent.click(buttons[1])
    expect(await screen.findByRole('form', { name: 'Log this session' })).toBeInTheDocument()
    expect(mockGet).toHaveBeenCalledWith(2)
  })

  it('says when all is logged and nothing is on today', async () => {
    mockList.mockResolvedValue([])
    renderDashboard()
    expect(await screen.findByText('All caught up.')).toBeInTheDocument()
    expect(screen.getByText('No sessions today.')).toBeInTheDocument()
  })
})
