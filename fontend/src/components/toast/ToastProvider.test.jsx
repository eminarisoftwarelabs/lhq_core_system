import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './ToastProvider'
import { useToast } from './useToast'

function Trigger({ message = 'New enquiry created', options }) {
  const { showToast } = useToast()
  return (
    <button type="button" onClick={() => showToast(message, options)}>
      Trigger toast
    </button>
  )
}

function renderWithProvider(ui) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('useToast', () => {
  it('throws when used outside a ToastProvider', () => {
    const Bare = () => {
      useToast()
      return null
    }
    // React logs a console.error for the thrown-during-render case - not
    // asserted on, just quieted so the test output stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow('useToast must be used within a ToastProvider')
    spy.mockRestore()
  })
})

describe('ToastProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing until a toast is triggered', () => {
    renderWithProvider(<Trigger />)
    expect(screen.queryByText('New enquiry created')).not.toBeInTheDocument()
  })

  it('shows the message after showToast is called', () => {
    renderWithProvider(<Trigger />)
    fireEvent.click(screen.getByRole('button', { name: 'Trigger toast' }))
    expect(screen.getByText('New enquiry created')).toBeInTheDocument()
  })

  it('auto-dismisses after the default duration', () => {
    renderWithProvider(<Trigger />)
    fireEvent.click(screen.getByRole('button', { name: 'Trigger toast' }))
    expect(screen.getByText('New enquiry created')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(screen.queryByText('New enquiry created')).not.toBeInTheDocument()
  })

  it('respects a custom duration', () => {
    renderWithProvider(<Trigger options={{ duration: 1000 }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Trigger toast' }))

    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(screen.getByText('New enquiry created')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByText('New enquiry created')).not.toBeInTheDocument()
  })

  it('dismisses immediately when the dismiss button is clicked', () => {
    renderWithProvider(<Trigger />)
    fireEvent.click(screen.getByRole('button', { name: 'Trigger toast' }))
    expect(screen.getByText('New enquiry created')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))
    expect(screen.queryByText('New enquiry created')).not.toBeInTheDocument()
  })

  it('stacks multiple toasts independently', () => {
    renderWithProvider(<Trigger message="First" />)
    fireEvent.click(screen.getByRole('button', { name: 'Trigger toast' }))
    fireEvent.click(screen.getByRole('button', { name: 'Trigger toast' }))

    expect(screen.getAllByText('First')).toHaveLength(2)
  })
})
