import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DateTimePickerField } from './DateTimePickerField'

function Wrapper({ initialValue = '' }) {
  const [value, setValue] = useState(initialValue)
  return (
    <>
      <label htmlFor="meeting_datetime">Meeting date &amp; time</label>
      <DateTimePickerField id="meeting_datetime" value={value} onChange={setValue} />
      <p data-testid="value">{value}</p>
    </>
  )
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-15T00:00:00'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DateTimePickerField', () => {
  it('shows a placeholder when there is no value', () => {
    render(<Wrapper />)
    expect(screen.getByText('Select date & time')).toBeInTheDocument()
  })

  it('shows the formatted date and time when a value is set', () => {
    render(<Wrapper initialValue="2026-09-15T14:30" />)
    expect(screen.getByLabelText('Meeting date & time')).toHaveTextContent('Sep 15, 2:30 PM')
  })

  it('opens a calendar popover on click, closed by default', () => {
    render(<Wrapper />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Meeting date & time'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('picking a day defaults the time to 9:00 AM and keeps the popover open for the time field', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByLabelText('Meeting date & time'))

    fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))

    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-15T09:00')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('picking a day after a time is already set keeps that time', () => {
    render(<Wrapper initialValue="2026-09-10T16:45" />)
    fireEvent.click(screen.getByLabelText('Meeting date & time'))

    fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))

    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-15T16:45')
  })

  it('changing the time field keeps the already-selected date', () => {
    render(<Wrapper initialValue="2026-09-20T09:00" />)
    fireEvent.click(screen.getByLabelText('Meeting date & time'))

    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '13:15' } })

    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-20T13:15')
  })

  it('changing the time field before any date is picked defaults to today', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByLabelText('Meeting date & time'))

    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '13:15' } })

    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-15T13:15')
  })

  it('the Done button closes the popover without changing the value', () => {
    render(<Wrapper initialValue="2026-09-20T09:00" />)
    fireEvent.click(screen.getByLabelText('Meeting date & time'))

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-20T09:00')
  })

  it('closes the popover on Escape without changing the value', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByLabelText('Meeting date & time'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('')
  })

  it('closes the popover when clicking outside', () => {
    render(
      <div>
        <Wrapper />
        <button type="button">Elsewhere</button>
      </div>,
    )
    fireEvent.click(screen.getByLabelText('Meeting date & time'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
