import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ApiError } from '../lib/apiClient'
import { conflictError } from '../test-utils/sessionFixtures'
import { SessionChangeRequestsPage } from './SessionChangeRequestsPage'

const mockList = vi.fn()
const mockApprove = vi.fn()
const mockReject = vi.fn()
vi.mock('../lib/api', () => ({
  sessionChangeRequestsApi: {
    list: (...a) => mockList(...a),
    approve: (...a) => mockApprove(...a),
    reject: (...a) => mockReject(...a),
  },
}))

const base = {
  session: 101,
  status: 'PENDING',
  created_at: new Date().toISOString(),
  student: { id: 1, name: 'Takondwa Banda' },
  subject: { id: 3, display_name: 'IGCSE Physics' },
  tutor: { id: 4, name: 'Mr Banda' },
  current: { date: '2026-11-23', start_time: '16:00', end_time: '17:00', status: 'SCHEDULED' },
}
const requests = [
  { ...base, id: 1, kind: 'MOVE', new_date: '2026-11-24', new_start_time: '10:00', new_end_time: '11:00', reason: 'School exam' },
  { ...base, id: 2, kind: 'CANCEL', new_date: null, new_start_time: null, new_end_time: null, reason: 'Family event' },
]

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter>
          <SessionChangeRequestsPage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockList.mockResolvedValue(requests)
})

afterEach(() => vi.clearAllMocks())

describe('SessionChangeRequestsPage', () => {
  it('lists pending requests with the current and requested time', async () => {
    renderPage()
    const move = await screen.findByRole('article', { name: 'Mr Banda: move IGCSE Physics' })
    expect(within(move).getByText('Mon 23 Nov, 16:00–17:00')).toBeInTheDocument()
    expect(within(move).getByText('Tue 24 Nov, 10:00–11:00')).toBeInTheDocument()
    expect(within(move).getByText(/School exam/)).toBeInTheDocument()
    const cancel = screen.getByRole('article', { name: 'Mr Banda: cancel IGCSE Physics' })
    expect(within(cancel).getByText('Cancelled')).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith({ status: 'PENDING' })
  })

  it('approves and removes the request from the queue', async () => {
    mockApprove.mockResolvedValue({ ...requests[0], status: 'APPROVED' })
    renderPage()
    const move = await screen.findByRole('article', { name: /move/ })
    fireEvent.click(within(move).getByRole('button', { name: 'Approve' }))
    expect(within(move).getByRole('button', { name: 'Approving…' })).toBeDisabled()
    await waitFor(() => expect(screen.queryByRole('article', { name: /move/ })).not.toBeInTheDocument())
    expect(mockApprove).toHaveBeenCalledWith(1, false)
  })

  it('flags a clash at approval, and Book anyway approves it', async () => {
    mockApprove.mockRejectedValueOnce(conflictError(ApiError)).mockResolvedValueOnce({ ...requests[0], status: 'APPROVED' })
    renderPage()
    const move = await screen.findByRole('article', { name: /move/ })
    fireEvent.click(within(move).getByRole('button', { name: 'Approve' }))
    const notice = await within(move).findByRole('alert')
    expect(notice).toHaveTextContent('Mr Banda already teaches IGCSE Physics')
    fireEvent.click(within(notice).getByRole('button', { name: 'Book anyway' }))
    await waitFor(() => expect(mockApprove).toHaveBeenLastCalledWith(1, true))
  })

  it('rejects with a reason', async () => {
    mockReject.mockResolvedValue({ ...requests[1], status: 'REJECTED' })
    renderPage()
    const cancel = await screen.findByRole('article', { name: /cancel/ })
    fireEvent.click(within(cancel).getByRole('button', { name: 'Reject' }))
    const submit = within(cancel).getByRole('button', { name: 'Reject request' })
    expect(submit).toBeDisabled()
    fireEvent.change(within(cancel).getByLabelText(/Reason/), { target: { value: 'Exams week' } })
    fireEvent.click(submit)
    await waitFor(() => expect(mockReject).toHaveBeenCalledWith(2, 'Exams week'))
  })

  it('says when there is nothing to review', async () => {
    mockList.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Nothing waiting for review.')).toBeInTheDocument()
  })
})
