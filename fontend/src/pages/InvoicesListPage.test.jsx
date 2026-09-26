import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InvoicesListPage } from './InvoicesListPage'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'

const mockListInvoices = vi.fn()
vi.mock('../lib/api', () => ({
  billingApi: { listInvoices: (...args) => mockListInvoices(...args) },
}))

const overdueInvoice = {
  id: 9,
  enquiry_student_name: 'Jimmy Doe',
  total: '1500.00',
  balance_due: '300.00',
  status: 'PARTIALLY_PAID',
  is_overdue: true,
  due_date: '2026-02-15',
}
const paidInvoice = {
  id: 10,
  enquiry_student_name: 'Ada Banda',
  total: '800.00',
  balance_due: '0.00',
  status: 'PAID',
  is_overdue: false,
  due_date: '2026-03-01',
}

function page(results, extra = {}) {
  return { count: results.length, next: null, previous: null, results, ...extra }
}

function renderPage(path = '/invoices') {
  return render(
    <PageHeaderProvider>
      <MemoryRouter initialEntries={[path]}>
        <InvoicesListPage />
      </MemoryRouter>
    </PageHeaderProvider>,
  )
}

beforeEach(() => {
  mockListInvoices.mockReset().mockResolvedValue(page([overdueInvoice]))
})

describe('InvoicesListPage', () => {
  it('loads outstanding invoices by default', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')

    expect(mockListInvoices).toHaveBeenCalledWith({ balance_due__gt: 0, page: 1 })
    expect(screen.getByRole('button', { name: 'Outstanding' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching to All drops the balance filter', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')
    mockListInvoices.mockResolvedValue(page([overdueInvoice, paidInvoice]))

    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() => expect(mockListInvoices).toHaveBeenLastCalledWith({ page: 1 }))
    expect(await screen.findByText('Ada Banda')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders each invoice as a linked row with number, due date, status, and balance', async () => {
    mockListInvoices.mockResolvedValue(page([overdueInvoice, paidInvoice]))
    renderPage()
    await screen.findByText('Jimmy Doe')

    const [overdueRow, paidRow] = screen.getAllByRole('listitem')
    expect(within(overdueRow).getByRole('link')).toHaveAttribute('href', '/invoices/9')
    expect(within(overdueRow).getByText('Invoice #9 · Due Feb 15, 2026')).toBeInTheDocument()
    expect(within(overdueRow).getByText('Overdue')).toHaveClass('invoice-status-badge--overdue')
    expect(within(overdueRow).getByText('Partially paid')).toHaveClass('invoice-status-badge--partially_paid')
    expect(within(overdueRow).getByText('MK 300.00 due of MK 1,500.00')).toBeInTheDocument()

    expect(within(paidRow).queryByText('Overdue')).not.toBeInTheDocument()
    expect(within(paidRow).getByText('Paid in full · MK 800.00')).toBeInTheDocument()
  })

  it('shows the invoice count in the card header', async () => {
    mockListInvoices.mockResolvedValue(page([overdueInvoice], { count: 42 }))
    renderPage()
    await screen.findByText('Jimmy Doe')

    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('shows an outstanding-specific empty state', async () => {
    mockListInvoices.mockResolvedValue(page([]))
    renderPage()

    expect(await screen.findByText(/No outstanding invoices/)).toBeInTheDocument()
  })

  it('pages through results with Previous/Next', async () => {
    mockListInvoices.mockResolvedValue(page([overdueInvoice], { count: 45, next: 'n' }))
    renderPage()
    await screen.findByText('Page 1 of 3')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    await waitFor(() => expect(mockListInvoices).toHaveBeenLastCalledWith({ balance_due__gt: 0, page: 2 }))
  })

  it('surfaces a load error', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockListInvoices.mockRejectedValue(new ApiError(500, { detail: 'Server exploded.' }))
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Server exploded.')
  })
})

describe('InvoicesListPage issue-date filter', () => {
  // Fake only Date: the page has no timers, and faking setTimeout would
  // stall findBy* polling.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 8, 26, 15, 45))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const iso = (y, m, d) => new Date(y, m - 1, d).toISOString()

  it('defaults to All time with no date params', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')

    expect(screen.getByLabelText('Issued')).toHaveValue('all')
    expect(mockListInvoices).toHaveBeenCalledWith({ balance_due__gt: 0, page: 1 })
    expect(screen.queryByText(/Clear dates/)).not.toBeInTheDocument()
  })

  it('This month sends local-midnight bounds and summarises the window', async () => {
    renderPage()
    await screen.findByText('Jimmy Doe')

    fireEvent.change(screen.getByLabelText('Issued'), { target: { value: 'this_month' } })

    await waitFor(() =>
      expect(mockListInvoices).toHaveBeenLastCalledWith({
        balance_due__gt: 0,
        page: 1,
        issued_from: iso(2026, 9, 1),
        issued_to: iso(2026, 10, 1),
      }),
    )
    expect(screen.getByText('Sep 1, 2026 – Sep 30, 2026')).toBeInTheDocument()
  })

  it('combines with the All status toggle', async () => {
    renderPage('/invoices?period=last_month')
    await screen.findByText('Jimmy Doe')

    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    await waitFor(() =>
      expect(mockListInvoices).toHaveBeenLastCalledWith({
        page: 1,
        issued_from: iso(2026, 8, 1),
        issued_to: iso(2026, 9, 1),
      }),
    )
  })

  it('reads the period from the URL, so a filtered view survives a refresh', async () => {
    renderPage('/invoices?status=all&period=last_30_days')
    await screen.findByText('Jimmy Doe')

    expect(screen.getByLabelText('Issued')).toHaveValue('last_30_days')
    expect(mockListInvoices).toHaveBeenCalledWith({
      page: 1,
      issued_from: iso(2026, 8, 28),
      issued_to: iso(2026, 9, 27),
    })
  })

  it('ignores an unknown period in the URL instead of sending it on', async () => {
    renderPage('/invoices?period=fortnight')
    await screen.findByText('Jimmy Doe')

    expect(screen.getByLabelText('Issued')).toHaveValue('all')
    expect(mockListInvoices).toHaveBeenCalledWith({ balance_due__gt: 0, page: 1 })
  })

  it('custom range: picking dates filters inclusively of the end date', async () => {
    renderPage('/invoices?period=custom&from=2026-09-10')
    await screen.findByText('Jimmy Doe')
    expect(mockListInvoices).toHaveBeenLastCalledWith({ balance_due__gt: 0, page: 1, issued_from: iso(2026, 9, 10) })

    fireEvent.click(screen.getByLabelText('Issued to'))
    fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))

    await waitFor(() =>
      expect(mockListInvoices).toHaveBeenLastCalledWith({
        balance_due__gt: 0,
        page: 1,
        issued_from: iso(2026, 9, 10),
        issued_to: iso(2026, 9, 27),
      }),
    )
    expect(screen.getByText('Sep 10, 2026 – Sep 26, 2026')).toBeInTheDocument()
  })

  it('custom range with the end before the start shows an error and skips the request', async () => {
    renderPage('/invoices?period=custom&from=2026-09-20&to=2026-09-10')

    expect(await screen.findByRole('alert')).toHaveTextContent('The end date is before the start date.')
    expect(mockListInvoices).not.toHaveBeenCalled()
    expect(screen.queryByText('Jimmy Doe')).not.toBeInTheDocument()
  })

  it('Clear dates goes back to All time and drops the custom dates', async () => {
    renderPage('/invoices?period=custom&from=2026-09-10&to=2026-09-20')
    await screen.findByText('Jimmy Doe')

    fireEvent.click(screen.getByRole('button', { name: 'Clear dates' }))

    await waitFor(() => expect(mockListInvoices).toHaveBeenLastCalledWith({ balance_due__gt: 0, page: 1 }))
    expect(screen.getByLabelText('Issued')).toHaveValue('all')
    expect(screen.queryByLabelText('Issued from')).not.toBeInTheDocument()
  })

  it('changing the period resets to page 1', async () => {
    mockListInvoices.mockResolvedValue(page([overdueInvoice], { count: 45, next: 'n' }))
    renderPage()
    await screen.findByText('Page 1 of 3')
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Page 2 of 3')

    fireEvent.change(screen.getByLabelText('Issued'), { target: { value: 'this_month' } })

    await waitFor(() => expect(mockListInvoices).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })))
  })

  it('empty result in a period says so', async () => {
    mockListInvoices.mockResolvedValue(page([]))
    renderPage('/invoices?period=last_month')

    expect(await screen.findByText('No outstanding invoices issued in this period.')).toBeInTheDocument()
  })
})
