import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordPaymentForm } from './RecordPaymentForm'

const mockRecordPayment = vi.fn()

vi.mock('../lib/api', () => ({
  billingApi: {
    recordPayment: (...args) => mockRecordPayment(...args),
  },
}))

const invoice = { id: 9, total: '300.00', balance_due: '300.00' }

beforeEach(() => {
  mockRecordPayment.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('RecordPaymentForm', () => {
  it('shows a paid-in-full message instead of the form once balance_due is zero', () => {
    render(<RecordPaymentForm invoice={{ ...invoice, balance_due: '0.00' }} onRecorded={vi.fn()} />)

    expect(screen.getByText('Paid in full.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Payment amount')).not.toBeInTheDocument()
  })

  it('recording a payment calls onRecorded with the updated invoice', async () => {
    const onRecorded = vi.fn()
    mockRecordPayment.mockResolvedValueOnce({ ...invoice, balance_due: '200.00' })
    render(<RecordPaymentForm invoice={invoice} onRecorded={onRecorded} />)

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '100.00'))
    expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({ balance_due: '200.00' }))
  })

  it('clears the input after a successful submit', async () => {
    mockRecordPayment.mockResolvedValueOnce({ ...invoice, balance_due: '200.00' })
    render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalled())
    expect(screen.getByLabelText('Payment amount')).toHaveValue('')
  })

  it('renders a field-level error returned by the backend', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockRecordPayment.mockRejectedValueOnce(new ApiError(400, { amount: ['Amount cannot exceed the balance due.'] }))
    render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('Amount cannot exceed the balance due.')).toBeInTheDocument()
  })

  it('renders a non-field error returned by the backend', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockRecordPayment.mockRejectedValueOnce(
      new ApiError(400, { detail: ['This enquiry is missing a desired start date.'] }),
    )
    render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('This enquiry is missing a desired start date.')).toBeInTheDocument()
  })

  describe('client-side amount validation', () => {
    it('rejects an empty amount without calling the API', async () => {
      render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      expect(await screen.findByText('Enter a payment amount.')).toBeInTheDocument()
      expect(mockRecordPayment).not.toHaveBeenCalled()
    })

    it('rejects a zero or negative amount without calling the API', async () => {
      render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '-5' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      expect(await screen.findByText('Amount must be greater than 0.')).toBeInTheDocument()
      expect(mockRecordPayment).not.toHaveBeenCalled()
    })

    it('rejects an amount greater than the balance due without calling the API', async () => {
      render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '300.01' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      expect(await screen.findByText('Amount cannot exceed the balance due.')).toBeInTheDocument()
      expect(mockRecordPayment).not.toHaveBeenCalled()
    })

    it('accepts an amount exactly equal to the balance due', async () => {
      mockRecordPayment.mockResolvedValueOnce({ ...invoice, balance_due: '0.00' })
      render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '300.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '300.00'))
    })

    it('clears a previous validation error once a valid amount is submitted', async () => {
      mockRecordPayment.mockResolvedValueOnce({ ...invoice, balance_due: '200.00' })
      render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))
      expect(await screen.findByText('Enter a payment amount.')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '100.00'))
      expect(screen.queryByText('Enter a payment amount.')).not.toBeInTheDocument()
    })

    it('accepts a comma-formatted amount, matching how the balance itself is displayed', async () => {
      const bigInvoice = { id: 9, total: '250000.00', balance_due: '250000.00' }
      mockRecordPayment.mockResolvedValueOnce({ ...bigInvoice, balance_due: '0.00' })
      render(<RecordPaymentForm invoice={bigInvoice} onRecorded={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '250,000' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '250000'))
    })

    it('accepts a space-grouped amount too', async () => {
      const bigInvoice = { id: 9, total: '250000.00', balance_due: '250000.00' }
      mockRecordPayment.mockResolvedValueOnce({ ...bigInvoice, balance_due: '0.00' })
      render(<RecordPaymentForm invoice={bigInvoice} onRecorded={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '250 000' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '250000'))
    })

    it('rejects non-numeric input with a clear message', async () => {
      render(<RecordPaymentForm invoice={invoice} onRecorded={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: 'abc' } })
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

      expect(await screen.findByText('Enter a valid number - digits only (commas are fine).')).toBeInTheDocument()
      expect(mockRecordPayment).not.toHaveBeenCalled()
    })
  })
})
