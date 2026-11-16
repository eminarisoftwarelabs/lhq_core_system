import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageHeaderProvider } from '../components/layout/PageHeaderProvider'
import { ToastProvider } from '../components/toast/ToastProvider'
import { ChangeRequestsPage } from './ChangeRequestsPage'

const mockList = vi.fn()
const mockApprove = vi.fn()
const mockReject = vi.fn()
vi.mock('../lib/api', () => ({
  changeRequestsApi: {
    list: (...a) => mockList(...a),
    approve: (...a) => mockApprove(...a),
    reject: (...a) => mockReject(...a),
  },
}))

const created = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
const requests = [
  {
    id: 1,
    tutor: 5,
    tutor_user: 12,
    tutor_name: 'Tam Tutor',
    kind: 'SUBJECTS',
    status: 'PENDING',
    created_at: created,
    note: '',
    current: [{ id: 1, name: 'Mathematics', level: 3, level_name: 'IGCSE' }],
    proposed: [
      { id: 1, name: 'Mathematics', level: 3, level_name: 'IGCSE' },
      { id: 2, name: 'Physics', level: 3, level_name: 'IGCSE' },
    ],
  },
  {
    id: 2,
    tutor: 6,
    tutor_user: 13,
    tutor_name: 'Olu Other',
    kind: 'WORKING_HOURS',
    status: 'PENDING',
    created_at: created,
    note: 'Saturdays work better',
    current: [{ weekday: 0, start_time: '08:00', end_time: '12:00' }],
    proposed: [{ weekday: 5, start_time: '09:00', end_time: '12:00' }],
  },
]

function renderPage() {
  return render(
    <ToastProvider>
      <PageHeaderProvider>
        <MemoryRouter>
          <ChangeRequestsPage />
        </MemoryRouter>
      </PageHeaderProvider>
    </ToastProvider>,
  )
}

beforeEach(() => {
  mockList.mockReset().mockResolvedValue(requests)
  mockApprove.mockReset()
  mockReject.mockReset()
})

describe('ChangeRequestsPage', () => {
  it('lists pending requests with tutor, kind, age, note and highlighted differences', async () => {
    renderPage()

    const subjects = await screen.findByRole('article', { name: 'Tam Tutor: Subjects' })
    expect(within(subjects).getByRole('link', { name: 'Tam Tutor' })).toHaveAttribute('href', '/users/12')
    expect(within(subjects).getByText('3h ago')).toBeInTheDocument()
    expect(within(subjects).getAllByText('IGCSE Physics')[0].closest('li')).toHaveClass('change-diff__item--added')

    const hours = screen.getByRole('article', { name: 'Olu Other: Working hours' })
    expect(within(hours).getByText('Monday 08:00 to 12:00').closest('li')).toHaveClass('change-diff__item--removed')
    expect(within(hours).getByText(/Saturdays work better/)).toBeInTheDocument()
    expect(mockList).toHaveBeenCalledWith({ status: 'PENDING' })
  })

  it('removes a request from the list once approved', async () => {
    mockApprove.mockResolvedValue({ ...requests[0], status: 'APPROVED' })
    renderPage()

    const card = await screen.findByRole('article', { name: 'Tam Tutor: Subjects' })
    fireEvent.click(within(card).getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Tam Tutor: Subjects' })).not.toBeInTheDocument())
    expect(screen.getByRole('article', { name: 'Olu Other: Working hours' })).toBeInTheDocument()
  })

  it('says when nothing is waiting', async () => {
    mockList.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('Nothing waiting for review.')).toBeInTheDocument()
  })

  it('shows an error when loading fails', async () => {
    mockList.mockRejectedValue(new Error('down'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load change requests.')
  })
})
