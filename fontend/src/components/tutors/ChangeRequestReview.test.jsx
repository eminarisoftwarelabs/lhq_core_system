import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import { ToastProvider } from '../toast/ToastProvider'
import { ChangeRequestReview } from './ChangeRequestReview'

const mockApprove = vi.fn()
const mockReject = vi.fn()
vi.mock('../../lib/api', () => ({
  changeRequestsApi: {
    approve: (...args) => mockApprove(...args),
    reject: (...args) => mockReject(...args),
  },
}))

const request = {
  id: 7,
  kind: 'SUBJECTS',
  tutor_name: 'Tam Tutor',
  note: 'I can cover Physics now',
  current: [{ id: 1, name: 'Mathematics', level: 3, level_name: 'IGCSE' }],
  proposed: [{ id: 2, name: 'Physics', level: 3, level_name: 'IGCSE' }],
  status: 'PENDING',
}

function renderReview(onReviewed = vi.fn()) {
  render(
    <ToastProvider>
      <ChangeRequestReview request={request} onReviewed={onReviewed} />
    </ToastProvider>,
  )
  return onReviewed
}

beforeEach(() => {
  mockApprove.mockReset()
  mockReject.mockReset()
})

describe('ChangeRequestReview', () => {
  it('shows the diff and the tutor note', () => {
    renderReview()
    expect(screen.getByText('IGCSE Physics')).toBeInTheDocument()
    expect(screen.getByText(/I can cover Physics now/)).toBeInTheDocument()
  })

  it('approves', async () => {
    mockApprove.mockResolvedValue({ ...request, status: 'APPROVED' })
    const onReviewed = renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(onReviewed).toHaveBeenCalledWith(expect.objectContaining({ status: 'APPROVED' })))
    expect(mockApprove).toHaveBeenCalledWith(7)
  })

  it('needs a reason before rejecting, then sends it', async () => {
    mockReject.mockResolvedValue({ ...request, status: 'REJECTED' })
    const onReviewed = renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    const submit = screen.getByRole('button', { name: 'Reject change' })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Physics is full' } })
    fireEvent.click(submit)

    await waitFor(() => expect(onReviewed).toHaveBeenCalled())
    expect(mockReject).toHaveBeenCalledWith(7, 'Physics is full')
  })

  it('shows the server explanation when approval is refused', async () => {
    mockApprove.mockRejectedValue(new ApiError(400, { subjects: ['Unknown or inactive subject id: 2.'] }))
    const onReviewed = renderReview()

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown or inactive subject id: 2.')
    expect(onReviewed).not.toHaveBeenCalled()
  })
})
