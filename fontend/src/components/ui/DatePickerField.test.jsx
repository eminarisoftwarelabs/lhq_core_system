import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatePickerField } from './DatePickerField'

function Wrapper({ initialValue = '' }) {
  const [value, setValue] = useState(initialValue)
  return (
    <>
      <label htmlFor="desired_start_date">Desired start date</label>
      <DatePickerField id="desired_start_date" value={value} onChange={setValue} />
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

describe('DatePickerField', () => {
  it('shows a placeholder when there is no value', () => {
    render(<Wrapper />)
    expect(screen.getByText('Select date')).toBeInTheDocument()
  })

  it('shows the formatted date when a value is set', () => {
    render(<Wrapper initialValue="2026-09-15" />)
    expect(screen.getByLabelText('Desired start date')).toHaveTextContent('Sep 15, 2026')
  })

  it('opens a calendar popover on click, closed by default', () => {
    render(<Wrapper />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Desired start date'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('picking a day sets the value as a YYYY-MM-DD string and closes the popover', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByLabelText('Desired start date'))

    const today = document.querySelector('.rdp-today .rdp-day_button')
    expect(today).toBeTruthy()
    fireEvent.click(today)

    expect(screen.getByTestId('value')).toHaveTextContent('2026-09-15')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the popover on Escape without changing the value', () => {
    render(<Wrapper />)
    fireEvent.click(screen.getByLabelText('Desired start date'))
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
    fireEvent.click(screen.getByLabelText('Desired start date'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.mouseDown(screen.getByText('Elsewhere'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
