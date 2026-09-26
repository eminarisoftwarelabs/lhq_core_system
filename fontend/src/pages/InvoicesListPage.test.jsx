import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function renderPage() {
  return render(
    <PageHeaderProvider>
      <MemoryRouter>
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
