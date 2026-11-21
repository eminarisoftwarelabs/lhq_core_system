import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toGridItems } from '../../lib/sessions'
import { makeSession } from '../../test-utils/sessionFixtures'
import { SessionWeekGrid } from './SessionWeekGrid'

const WEEK = '2026-11-16'

function renderGrid(sessions, props = {}) {
  const onOpen = vi.fn()
  render(
    <SessionWeekGrid
      weekStart={WEEK}
      items={toGridItems(sessions, WEEK)}
      bounds={{ start: 13 * 60, end: 19 * 60 }}
      free={null}
      showTutor
      todayIndex={2}
      nowMinutes={14 * 60}
      mobileDay={2}
      onOpen={onOpen}
      {...props}
    />,
  )
  return onOpen
}

describe('SessionWeekGrid', () => {
  it('draws seven day columns with their dates and marks today', () => {
    renderGrid([])
    for (let day = 0; day < 7; day += 1) expect(screen.getByTestId(`tt-day-${day}`)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Sunday Sun 22 Nov' })).toBeInTheDocument()
    expect(screen.getByTestId('tt-day-2')).toHaveClass('tt-grid__column--today')
    expect(screen.getByText('13:00')).toBeInTheDocument()
  })

  it('positions a session by its times and colours it by status', () => {
    renderGrid([makeSession({ date: '2026-11-18', start_time: '16:00', end_time: '17:30', display_status: 'UNLOGGED' })])
    const block = within(screen.getByTestId('tt-day-2')).getByRole('button').closest('.tt-session')
    expect(block).toHaveClass('tt-session--unlogged')
    expect(block.style.top).toBe('50%')
    expect(block.style.height).toBe('calc(25%)')
  })

  it('shows tutor names only when asked, and puts overlapping sessions side by side', () => {
    renderGrid(
      [
        makeSession({ id: 1, date: '2026-11-16', start_time: '14:00', end_time: '15:00' }),
        makeSession({ id: 2, date: '2026-11-16', start_time: '14:30', end_time: '15:30' }),
      ],
      { showTutor: false },
    )
    const blocks = within(screen.getByTestId('tt-day-0')).getAllByRole('button')
    expect(blocks[0]).not.toHaveAccessibleName(/Mr Banda/)
    expect(blocks[0].closest('.tt-session').style.width).toBe('calc(50% - 4px)')
    expect(blocks[1].closest('.tt-session').style.left).toBe('calc(50% + 2px)')
  })

  it('flags moved-here, online and pending sessions in the accessible name', () => {
    renderGrid([
      makeSession({ date: '2026-11-17', moved_from: 5, mode: 'ONLINE', pending_request: { id: 1 } }),
    ])
    expect(within(screen.getByTestId('tt-day-1')).getByRole('button')).toHaveAccessibleName(/change requested, moved here/)
  })

  it('shades free time', () => {
    renderGrid([], { free: [[{ start_time: '14:00', end_time: '16:00' }], [], [], [], [], [], []] })
    const free = within(screen.getByTestId('tt-day-0')).getByTestId('tt-free')
    expect(free).toHaveAttribute('title', 'Free 14:00–16:00')
  })

  it('opens a session on click', () => {
    const session = makeSession({ date: '2026-11-20' })
    const onOpen = renderGrid([session])
    fireEvent.click(within(screen.getByTestId('tt-day-4')).getByRole('button'))
    expect(onOpen).toHaveBeenCalledWith(session)
  })
})
