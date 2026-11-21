import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TutorHoursCard } from './TutorHoursCard'

const mockGetHours = vi.fn()
vi.mock('../../lib/api', () => ({ tutorsApi: { getHours: (...a) => mockGetHours(...a) } }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
  mockGetHours.mockImplementation((id, month) =>
    Promise.resolve({
      month,
      sessions_held: month === '2026-11' ? 4 : 2,
      minutes: 360,
      hours: month === '2026-11' ? '6.00' : '3.00',
      hourly_rate: '6000.00',
      estimated_amount: month === '2026-11' ? '36000.00' : '18000.00',
      is_estimate: true,
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('TutorHoursCard', () => {
  it('shows this month’s held sessions, hours and the estimate', async () => {
    render(<TutorHoursCard tutorId={4} />)
    expect(await screen.findByText('MWK 36,000')).toBeInTheDocument()
    expect(screen.getByText('6 h')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    expect(screen.getByText(/Estimate only/)).toHaveTextContent('(MWK 6,000)')
    expect(mockGetHours).toHaveBeenCalledWith(4, '2026-11')
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled()
  })

  it('steps back a month', async () => {
    render(<TutorHoursCard tutorId={4} />)
    await screen.findByText('MWK 36,000')
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    expect(await screen.findByText('MWK 18,000')).toBeInTheDocument()
    expect(screen.getByText('October 2026')).toBeInTheDocument()
    await waitFor(() => expect(mockGetHours).toHaveBeenLastCalledWith(4, '2026-10'))
  })

  it('says when no hourly rate is set', async () => {
    mockGetHours.mockResolvedValue({ month: '2026-11', sessions_held: 1, hours: '1.00', hourly_rate: null, estimated_amount: null })
    render(<TutorHoursCard tutorId={4} />)
    expect(await screen.findByText('No hourly rate set')).toBeInTheDocument()
  })
})
