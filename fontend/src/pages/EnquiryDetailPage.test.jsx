import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnquiryDetailPage } from './EnquiryDetailPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'

const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockChangeStage = vi.fn()
const mockGenerateInvoice = vi.fn()
const mockListSubjects = vi.fn()
const mockListInvoices = vi.fn()
const mockRecordPayment = vi.fn()

vi.mock('../lib/api', () => ({
  enquiriesApi: {
    get: (...args) => mockGet(...args),
    update: (...args) => mockUpdate(...args),
    changeStage: (...args) => mockChangeStage(...args),
    generateInvoice: (...args) => mockGenerateInvoice(...args),
  },
  academicsApi: {
    listSubjects: (...args) => mockListSubjects(...args),
  },
  billingApi: {
    listInvoices: (...args) => mockListInvoices(...args),
    recordPayment: (...args) => mockRecordPayment(...args),
  },
}))

const baseEnquiry = {
  id: 5,
  parent: { id: 1, full_name: 'Jane Doe', phone: '0999', email: '' },
  student_name: 'Jimmy Doe',
  student_year_group: 7,
  student_school: 'Kamuzu Academy',
  student_phone: '',
  student_email: '',
  student_grade: '7',
  stage: 'INITIAL_CALL',
  interested_subjects: [{ id: 1, name: 'Maths', is_active: true }],
  duration_weeks: 12,
  learning_mode: 'IN_PERSON',
  desired_start_date: '2026-02-01',
  meeting_datetime: null,
  enrollment: null,
  notes: '',
  stage_history: [
    { id: 1, from_stage: null, to_stage: 'INITIAL_CALL', changed_by_name: 'Admin', changed_at: '2026-01-01T00:00:00Z', note: '' },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  created_by: 1,
  created_by_name: 'Admin',
}

// Stands in for the real InvoiceDetailPage, which has its own API mocks not
// set up in this file - only proves EnquiryDetailPage navigated to the right
// URL after generating an invoice.
function InvoicePagePlaceholder() {
  const { id } = useParams()
  return <div>Invoice page for invoice #{id}</div>
}

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={['/enquiries/5']}>
          <Routes>
            <Route path="/enquiries/:id" element={<EnquiryDetailPage />} />
            <Route path="/invoices/:id" element={<InvoicePagePlaceholder />} />
          </Routes>
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockUpdate.mockReset()
  mockChangeStage.mockReset()
  mockGenerateInvoice.mockReset()
  mockListSubjects.mockReset()
  mockListInvoices.mockReset()
  mockRecordPayment.mockReset()

  mockGet.mockResolvedValue(baseEnquiry)
  mockListSubjects.mockResolvedValue({ results: [{ id: 1, name: 'Maths', is_active: true }] })
  mockListInvoices.mockResolvedValue({ results: [] })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EnquiryDetailPage', () => {
  it('renders the enquiry stage and parent info', async () => {
    renderPage()

    await screen.findByText(/Parent: Jane Doe/)
    expect(screen.getByText('Initial call', { selector: '.stage-badge' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })

  it('shows a "Generate invoice" button when there is no invoice yet, not enrolled', async () => {
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
  })

  it('generating an invoice navigates straight to the generated invoice', async () => {
    mockGenerateInvoice.mockResolvedValueOnce({
      id: 9,
      enquiry: 5,
      total: '300.00',
      balance_due: '300.00',
      status: 'SENT',
      due_date: '2026-02-15',
    })
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }))

    await waitFor(() => expect(mockGenerateInvoice).toHaveBeenCalledWith(5))
    expect(await screen.findByText('Invoice generated')).toBeInTheDocument()
    expect(await screen.findByText('Invoice page for invoice #9')).toBeInTheDocument()
  })

  it('shows an error if generating the invoice fails, and keeps the button visible', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockGenerateInvoice.mockRejectedValueOnce(
      new ApiError(400, { duration_weeks: ['Required on the enquiry before an invoice can be generated.'] }),
    )
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }))

    await waitFor(() => expect(mockGenerateInvoice).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
  })

  it('shows the collected details as a read-only summary until Edit is clicked', async () => {
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(screen.queryByLabelText('Year / class')).not.toBeInTheDocument()
    expect(screen.getByText('Kamuzu Academy')).toBeInTheDocument()
    expect(screen.getByText('Maths')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Year / class')).toHaveValue('7')
    expect(screen.getByLabelText('School')).toHaveValue('Kamuzu Academy')
  })

  it('Cancel from the edit form returns to the summary without saving', async () => {
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'Somewhere else' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(mockUpdate).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('School')).not.toBeInTheDocument()
    expect(screen.getByText('Kamuzu Academy')).toBeInTheDocument()
  })

  it('saves the year group, school and student contact fields, then returns to the summary', async () => {
    mockUpdate.mockResolvedValueOnce({ ...baseEnquiry, student_year_group: 10, student_school: 'St. Andrews' })
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(screen.getByLabelText('Year / class'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('School'), { target: { value: 'St. Andrews' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(
        5,
        expect.objectContaining({ student_year_group: 10, student_school: 'St. Andrews' }),
      ),
    )
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(screen.queryByLabelText('School')).not.toBeInTheDocument()
    expect(screen.getByText('St. Andrews')).toBeInTheDocument()
  })

  it('shows an enrolled banner once enrolled', async () => {
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'ENROLLED', enrollment: 3 })
    renderPage()

    await screen.findByText(/Parent: Jane Doe/)
    expect(screen.getByText(/Enrolled\./)).toBeInTheDocument()
  })
})

describe('EnquiryDetailPage next action panel', () => {
  it('leads with "Schedule a meeting" at Initial call, offering a meeting-time form and a skip-ahead invoice option', async () => {
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(screen.getByText('Schedule a meeting')).toBeInTheDocument()
    expect(screen.getByLabelText('Meeting date & time')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schedule meeting' })).toBeInTheDocument()
    expect(screen.getByText(/Already have everything you need/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
  })

  it('scheduling a meeting saves the time and advances the stage to Meeting set in one action', async () => {
    mockUpdate.mockResolvedValueOnce({ ...baseEnquiry, meeting_datetime: '2026-03-02T14:00:00Z' })
    mockChangeStage.mockResolvedValueOnce({
      ...baseEnquiry,
      stage: 'MEETING_SET',
      meeting_datetime: '2026-03-02T14:00:00Z',
    })
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    fireEvent.click(screen.getByLabelText('Meeting date & time'))
    fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '14:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Schedule meeting' }))

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(5, expect.objectContaining({ meeting_datetime: expect.any(String) })),
    )
    await waitFor(() => expect(mockChangeStage).toHaveBeenCalledWith(5, 'MEETING_SET', ''))
    expect(await screen.findByText('Meeting scheduled')).toBeInTheDocument()
    expect(screen.getByText('Meeting set', { selector: '.stage-badge' })).toBeInTheDocument()
  })

  it('at Meeting set, leads with "Generate the invoice" as the primary action, without the skip-ahead framing', async () => {
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'MEETING_SET', meeting_datetime: '2026-03-02T14:00:00Z' })
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(screen.getByText('Generate the invoice')).toBeInTheDocument()
    expect(screen.queryByText(/Already have everything you need/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save meeting time' })).toBeInTheDocument()
  })

  it('at Invoiced, leads with "Awaiting payment", a Record payment form, and links to the invoice', async () => {
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'INVOICED' })
    mockListInvoices.mockResolvedValue({
      results: [{ id: 9, enquiry: 5, total: '300.00', balance_due: '300.00', status: 'SENT', due_date: '2026-02-15' }],
    })
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(screen.getByText('Awaiting payment')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate invoice' })).not.toBeInTheDocument()
    // The balance is shown right where the amount is typed, not just
    // somewhere else on the page - visible before/while filling the form.
    expect(screen.getByText('MK 300.00', { selector: '.next-action__balance strong' })).toBeInTheDocument()
    expect(screen.getByLabelText('Payment amount')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument()

    // "View invoice" sits next to "Record payment" (same <form>), not
    // stacked below it in a separate block.
    const recordPaymentButton = screen.getByRole('button', { name: 'Record payment' })
    const viewInvoiceLink = screen.getAllByRole('link', { name: 'View invoice' })[0]
    expect(recordPaymentButton.closest('form')).toBe(viewInvoiceLink.closest('form'))

    // Appears twice - the next-action panel's primary CTA and the invoice
    // history table row both link to the same invoice, which is expected.
    const paymentLinks = screen.getAllByRole('link', { name: 'View invoice' })
    expect(paymentLinks.length).toBeGreaterThanOrEqual(1)
    for (const link of paymentLinks) {
      expect(link).toHaveAttribute('href', '/invoices/9')
    }
  })

  it('recording a payment from the next-action card reloads the enquiry (enroll_student may have fired)', async () => {
    mockGet
      .mockResolvedValueOnce({ ...baseEnquiry, stage: 'INVOICED' })
      .mockResolvedValue({ ...baseEnquiry, stage: 'ENROLLED', enrollment: 7 })
    mockListInvoices
      .mockResolvedValueOnce({
        results: [{ id: 9, enquiry: 5, total: '300.00', balance_due: '300.00', status: 'SENT', due_date: '2026-02-15' }],
      })
      .mockResolvedValue({
        results: [{ id: 9, enquiry: 5, total: '300.00', balance_due: '0.00', status: 'PAID', due_date: '2026-02-15' }],
      })
    mockRecordPayment.mockResolvedValueOnce({
      id: 9,
      enquiry: 5,
      total: '300.00',
      balance_due: '0.00',
      status: 'PAID',
      due_date: '2026-02-15',
    })
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    fireEvent.change(screen.getByLabelText('Payment amount'), { target: { value: '300.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record payment' }))

    await waitFor(() => expect(mockRecordPayment).toHaveBeenCalledWith(9, '300.00'))
    // A full reload, not just a local invoice patch - proven by the page
    // picking up the enquiry's new ENROLLED stage from the second mockGet.
    expect(await screen.findByText(/Enrolled\./)).toBeInTheDocument()
  })

  it('at Invoiced with no actual invoice on record, offers a Generate invoice recovery button instead of a dead end', async () => {
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'INVOICED' })
    // mockListInvoices already defaults to { results: [] } in beforeEach -
    // this is the data-inconsistent state a manual stage override can leave.
    renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(screen.getByText('Awaiting payment', { selector: '.next-action__headline' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'View invoice' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
  })

  it('does not render the next action panel once enrolled', async () => {
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'ENROLLED', enrollment: 3 })
    const { container } = renderPage()
    await screen.findByText(/Parent: Jane Doe/)

    expect(container.querySelector('.next-action')).not.toBeInTheDocument()
  })
})
