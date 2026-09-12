import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoiceDetailPage } from './InvoiceDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockGetInvoice = vi.fn()
const mockRecordPayment = vi.fn()
const mockDownloadInvoicePdf = vi.fn()

vi.mock('../lib/api', () => ({
  billingApi: {
    getInvoice: (...args) => mockGetInvoice(...args),
    recordPayment: (...args) => mockRecordPayment(...args),
  },
}))

// The real PDF build is covered by invoicePdf.test.js against the actual
// jsPDF/autotable APIs - this page only needs to prove it hands the current
// invoice to that module when the button is clicked.
vi.mock('../lib/invoicePdf', () => ({
  downloadInvoicePdf: (...args) => mockDownloadInvoicePdf(...args),
}))

const outstandingInvoice = {
  id: 9,
  enquiry: 5,
  enquiry_student_name: 'Jimmy Doe',
  enrollment: null,
  total: '300.00',
  amount_paid: '0.00',
  balance_due: '300.00',
  status: 'SENT',
  is_overdue: false,
  due_date: '2026-02-15',
  line_items: [
    { id: 1, description: 'Tuition — 1 subject, 5 sessions/week × 12 week(s) @ 25000/session', amount: '1500000.00' },
    { id: 2, description: 'Duration discount (20%)', amount: '-1200000.00' },
  ],
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
  mockDownloadInvoicePdf.mockReset()
  mockGetInvoice.mockResolvedValue(outstandingInvoice)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('InvoiceDetailPage', () => {
  it('renders the line items, discount, and total', async () => {
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText(/Tuition — 1 subject/)).toBeInTheDocument()
    expect(screen.getByText('MK 1,500,000.00')).toBeInTheDocument()
    expect(screen.getByText('Duration discount (20%)')).toBeInTheDocument()
    expect(screen.getByText('-MK 1,200,000.00')).toBeInTheDocument()
    expect(screen.getByText('MK 300.00', { selector: 'td' })).toBeInTheDocument()
    expect(screen.getByLabelText('Payment amount')).toBeInTheDocument()
  })

  it('falls back to a plain total when an invoice has no line items', async () => {
    mockGetInvoice.mockResolvedValue({ ...outstandingInvoice, line_items: [] })
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText('Total: MK 300.00')).toBeInTheDocument()
    expect(screen.queryByText(/Tuition/)).not.toBeInTheDocument()
  })

  it('calls window.print when Print is clicked', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()

    await screen.findByText('Jimmy Doe')
    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })

  it('downloads the invoice as a PDF when Download PDF is clicked', async () => {
    renderPage()

    await screen.findByText('Jimmy Doe')
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))

    expect(mockDownloadInvoicePdf).toHaveBeenCalledTimes(1)
    expect(mockDownloadInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }))
  })

  // RecordPaymentForm's own amount validation (empty/negative/over-balance/
  // comma-formatted input) and error rendering are covered in
  // RecordPaymentForm.test.jsx against the component directly - these stick
  // to proving this page wires it up correctly (state updates, banners).
  it('recording a payment updates the displayed invoice from the response', async () => {
    mockRecordPayment.mockResolvedValueOnce({
      ...outstandingInvoice,
      status: 'PARTIALLY_PAID',
      amount_paid: '100.00',
      balance_due: '200.00',
      payments: [{ id: 1, amount: '100.00', recorded_by_name: 'Admin', paid_at: '2026-01-05T00:00:00Z' }],
    })
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '100.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '100.00'))
    expect(await screen.findByText('Partially paid')).toBeInTheDocument()
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

  it('puts "Record a payment" before "Payments" - recording is the next action, history is reference', async () => {
    mockGetInvoice.mockResolvedValue({
      ...outstandingInvoice,
      payments: [{ id: 1, amount: '50.00', recorded_by_name: 'Admin', paid_at: '2026-01-05T00:00:00Z' }],
    })
    renderPage()

    await screen.findByText('Jimmy Doe')
    const headers = [...document.querySelectorAll('.detail-section__header')].map((el) => el.textContent.trim())
    expect(headers.indexOf('Record a payment')).toBeLessThan(headers.indexOf('Payments'))
  })

  it('shows an overdue banner when is_overdue is true', async () => {
    mockGetInvoice.mockResolvedValue({ ...outstandingInvoice, is_overdue: true })
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText(/Overdue/)).toBeInTheDocument()
  })

  it('shows an enrolled banner and student link once enrolled', async () => {
    mockGetInvoice.mockResolvedValue({ ...outstandingInvoice, enrollment: 3 })
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByRole('link', { name: 'Find the student' })).toBeInTheDocument()
  })
})
