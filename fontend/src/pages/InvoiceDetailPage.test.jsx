import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockGetInvoice = vi.fn()
const mockRecordPayment = vi.fn()

vi.mock('../lib/api', () => ({
  billingApi: {
    getInvoice: (...args) => mockGetInvoice(...args),
    recordPayment: (...args) => mockRecordPayment(...args),
  },
}))

const outstandingInvoice = {
  id: 9,
  enquiry: 5,
  enquiry_student_name: 'Jimmy Doe',
  enrollment: null,
  total: '300.00',
  balance_due: '300.00',
  status: 'SENT',
  is_overdue: false,
  due_date: '2026-02-15',
  payments: [],
  created_at: '2026-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter initialEntries={['/invoices/9']}>
        <Routes>
          <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
        </Routes>
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockGetInvoice.mockReset()
  mockRecordPayment.mockReset()
  mockGetInvoice.mockResolvedValue(outstandingInvoice)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('InvoiceDetailPage', () => {
  it('renders invoice totals and shows the payment form when a balance is due', async () => {
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText((_, el) => el.tagName === 'P' && el.textContent === 'Total: $300.00')).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el.tagName === 'P' && el.textContent === 'Balance due: $300.00'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Payment amount')).toBeInTheDocument()
  })

  it('recording a payment updates the displayed invoice from the response', async () => {
    mockRecordPayment.mockResolvedValueOnce({
      ...outstandingInvoice,
      status: 'PARTIALLY_PAID',
      balance_due: '200.00',
      payments: [{ id: 1, amount: '100.00', recorded_by_name: 'Admin', paid_at: '2026-01-05T00:00:00Z' }],
    })
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '100.00'))
    expect(await screen.findByText(/Partially paid/)).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
  })

  it('shows a paid-in-full message instead of the form once balance_due is zero', async () => {
    mockGetInvoice.mockResolvedValue({ ...outstandingInvoice, balance_due: '0.00', status: 'PAID' })
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText('Paid in full.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Payment amount')).not.toBeInTheDocument()
  })

  it('shows an error message if recording payment fails', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockRecordPayment.mockRejectedValueOnce(
      new ApiError(400, { detail: ['This enquiry is missing a desired start date.'] }),
    )
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '50.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    expect(await screen.findByText('This enquiry is missing a desired start date.')).toBeInTheDocument()
  })

  it('shows an overdue flag when is_overdue is true', async () => {
    mockGetInvoice.mockResolvedValue({ ...outstandingInvoice, is_overdue: true })
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText('Overdue')).toBeInTheDocument()
  })
})
