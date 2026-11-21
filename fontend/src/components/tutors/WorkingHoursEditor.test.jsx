import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { fromRows, toRows } from '../../lib/tutorTeaching'
import { WorkingHoursEditor } from './WorkingHoursEditor'

const rows = toRows([
  { weekday: 0, start_time: '08:00', end_time: '12:00' },
  { weekday: 0, start_time: '14:00', end_time: '17:00' },
])

describe('WorkingHoursEditor', () => {
  it('shows a row per block with day, start and end', () => {
    render(<WorkingHoursEditor rows={rows} onChange={() => {}} />)

    expect(screen.getByLabelText('Day for block 1')).toHaveValue('0')
    expect(screen.getByLabelText('Start time for block 2')).toHaveValue('14:00')
    expect(screen.getByLabelText('End time for block 2')).toHaveValue('17:00')
  })

  it('offers every day of the week, weekends included', () => {
    render(<WorkingHoursEditor rows={rows} onChange={() => {}} />)
    const options = [...screen.getByLabelText('Day for block 1').options].map((o) => o.textContent)
    expect(options).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
  })

  it('changes a day and a time', () => {
    const onChange = vi.fn()
    render(<WorkingHoursEditor rows={rows} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Day for block 2'), { target: { value: '6' } })
    expect(fromRows(onChange.mock.calls[0][0])[1]).toEqual({ weekday: 6, start_time: '14:00', end_time: '17:00' })

    fireEvent.change(screen.getByLabelText('End time for block 1'), { target: { value: '11:30' } })
    expect(fromRows(onChange.mock.calls[1][0])[0].end_time).toBe('11:30')
  })

  it('adds and removes rows', () => {
    const onChange = vi.fn()
    render(<WorkingHoursEditor rows={rows} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add hours' }))
    expect(onChange.mock.calls[0][0]).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Remove block 1' }))
    expect(fromRows(onChange.mock.calls[1][0])).toEqual([{ weekday: 0, start_time: '14:00', end_time: '17:00' }])
  })

  it('says so when there are no hours', () => {
    render(<WorkingHoursEditor rows={[]} onChange={() => {}} />)
    expect(screen.getByText('No working hours yet.')).toBeInTheDocument()
  })

  it('can edit weekly slots instead, with its own labels and new-row factory', () => {
    const onChange = vi.fn()
    const makeRow = vi.fn(() => ({ key: 'new', weekday: 3, start_time: '16:00', end_time: '17:30' }))
    render(
      <WorkingHoursEditor
        rows={[]}
        onChange={onChange}
        itemLabel="weekly time"
        addLabel="Add a weekly time"
        emptyText="Add at least one weekly time."
        makeRow={makeRow}
      />,
    )
    expect(screen.getByText('Add at least one weekly time.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add a weekly time' }))
    expect(makeRow).toHaveBeenCalledWith([])
    expect(onChange).toHaveBeenCalledWith([{ key: 'new', weekday: 3, start_time: '16:00', end_time: '17:30' }])
  })
})
