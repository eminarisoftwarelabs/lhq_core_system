import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConflictNotice } from './ConflictNotice'

const conflict = (canOverride) => ({
  message: 'x',
  canOverride,
  warnings: [
    { code: 'CLASH', message: 'Mr Banda already teaches IGCSE Physics (Ann) on Monday 16:00 to 17:00.' },
    { code: 'OUTSIDE_WORKING_HOURS', message: "Monday 19:00 to 20:00 is outside Mr Banda's working hours." },
  ],
})

describe('ConflictNotice', () => {
  it('lists every warning and offers Cancel and Book anyway to staff', () => {
    const onCancel = vi.fn()
    const onOverride = vi.fn()
    render(<ConflictNotice conflict={conflict(true)} onCancel={onCancel} onOverride={onOverride} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Check this booking')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Book anyway' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onOverride).toHaveBeenCalled()
  })

  it('offers no override when it is not allowed', () => {
    render(<ConflictNotice conflict={conflict(false)} onCancel={vi.fn()} onOverride={vi.fn()} />)
    expect(screen.getByText('Pick another time.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Book anyway' })).not.toBeInTheDocument()
  })

  it('disables both buttons while busy', () => {
    render(<ConflictNotice conflict={conflict(true)} busy onCancel={vi.fn()} onOverride={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Booking…' })).toBeDisabled()
  })
})
