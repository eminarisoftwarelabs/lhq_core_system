import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnquiryDetailPage } from './EnquiryDetailPage'

const mockGet = vi.fn()
const mockUpdate = vi.fn()
const mockChangeStage = vi.fn()
const mockGenerateInvoice = vi.fn()
const mockListSubjects = vi.fn()
const mockListInvoices = vi.fn()

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
  },
}))

const baseEnquiry = {
  id: 5,
  parent: { id: 1, full_name: 'Jane Doe', phone: '0999', email: '' },
  student_name: 'Jimmy Doe',
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

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/enquiries/5']}>
      <Routes>
        <Route path="/enquiries/:id" element={<EnquiryDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockGet.mockReset()
  mockUpdate.mockReset()
  mockChangeStage.mockReset()
  mockGenerateInvoice.mockReset()
  mockListSubjects.mockReset()
  mockListInvoices.mockReset()

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

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText('Initial call')).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })

  it('the stage dropdown never offers the current stage or ENROLLED', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')

    const select = screen.getByLabelText('Move to stage')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)

    expect(options).not.toContain('Initial call')
    expect(options).not.toContain('Enrolled')
    expect(options).toEqual(['Meeting set', 'Invoiced'])
  })

  it('changing stage calls the API and updates the displayed stage', async () => {
    mockChangeStage.mockResolvedValueOnce({ ...baseEnquiry, stage: 'MEETING_SET' })
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.change(screen.getByLabelText('Move to stage'), { target: { value: 'MEETING_SET' } })
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Booked Tuesday' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update stage' }))

    await waitFor(() => expect(mockChangeStage).toHaveBeenCalledWith(5, 'MEETING_SET', 'Booked Tuesday'))
    expect(await screen.findByText('Meeting set')).toBeInTheDocument()
  })

  it('shows a "Generate invoice" button when there is no invoice yet, not enrolled', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')

    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
  })

  it('generating an invoice shows it in the invoicing table and hides the button', async () => {
    mockGenerateInvoice.mockResolvedValueOnce({
      id: 9,
      enquiry: 5,
      total: '300.00',
      balance_due: '300.00',
      status: 'SENT',
      due_date: '2026-02-15',
    })
    // generate-invoice also moves the enquiry to INVOICED server-side, so
    // the page does a full reload afterwards - the reload's invoice fetch
    // must reflect the newly generated invoice.
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'INVOICED' })
    mockListInvoices.mockResolvedValueOnce({ results: [] }).mockResolvedValue({
      results: [
        { id: 9, enquiry: 5, total: '300.00', balance_due: '300.00', status: 'SENT', due_date: '2026-02-15' },
      ],
    })
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }))

    await waitFor(() => expect(mockGenerateInvoice).toHaveBeenCalledWith(5))
    expect((await screen.findAllByText(/\$300\.00/)).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Generate invoice' })).not.toBeInTheDocument()
  })

  it('shows an error if generating the invoice fails, and keeps the button visible', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockGenerateInvoice.mockRejectedValueOnce(
      new ApiError(400, { duration_weeks: ['Required on the enquiry before an invoice can be generated.'] }),
    )
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.click(screen.getByRole('button', { name: 'Generate invoice' }))

    await waitFor(() => expect(mockGenerateInvoice).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate invoice' })).toBeInTheDocument()
  })

  it('shows an enrolled banner instead of a stage-change form once enrolled', async () => {
    mockGet.mockResolvedValue({ ...baseEnquiry, stage: 'ENROLLED', enrollment: 3 })
    renderPage()

    await screen.findByText('Jimmy Doe')
    expect(screen.getByText(/no longer changes manually/i)).toBeInTheDocument()
    expect(screen.getByText(/Enrolled\./)).toBeInTheDocument()
  })
})
