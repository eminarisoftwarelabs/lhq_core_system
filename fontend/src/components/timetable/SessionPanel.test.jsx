import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import { ADMIN_USER, conflictError, makeSessionDetail, TUTOR_USER } from '../../test-utils/sessionFixtures'
import { ToastProvider } from '../toast/ToastProvider'
import { SessionPanel } from './SessionPanel'

const mockGet = vi.fn()
const mockLog = vi.fn()
const mockPlan = vi.fn()
const mockMove = vi.fn()
const mockCancel = vi.fn()
const mockRequest = vi.fn()
const mockWithdraw = vi.fn()

vi.mock('../../lib/api', () => ({
  sessionsApi: {
    get: (...a) => mockGet(...a),
    log: (...a) => mockLog(...a),
    plan: (...a) => mockPlan(...a),
    move: (...a) => mockMove(...a),
    cancel: (...a) => mockCancel(...a),
    requestChange: (...a) => mockRequest(...a),
  },
  sessionChangeRequestsApi: { withdraw: (...a) => mockWithdraw(...a) },
}))

const mockUseAuth = vi.fn()
vi.mock('../../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }))

function renderPanel(props = {}) {
  const onChanged = vi.fn()
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <SessionPanel sessionId={101} onClose={onClose} onChanged={onChanged} {...props} />
    </ToastProvider>,
  )
  return { onChanged, onClose }
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: TUTOR_USER, isStaffLevel: false })
  // Wednesday 18 Nov 2026, noon (local). Only Date is faked.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('SessionPanel: logging', () => {
  it('lets the tutor log an unlogged session as held, with the planned topics pre-ticked', async () => {
    const session = makeSessionDetail({ display_status: 'UNLOGGED', can_log: true, planned_topics: [12] })
    mockGet.mockResolvedValue(session)
    mockLog.mockResolvedValue({ ...session, status: 'HELD', display_status: 'HELD', can_log: false, topics_covered: [12] })
    const { onChanged } = renderPanel()

    const form = await screen.findByRole('form', { name: 'Log this session' })
    fireEvent.click(within(form).getByRole('button', { name: /Held/ }))
    const topics = within(form).getByRole('list', { name: 'Topics covered' })
    expect(within(topics).getByRole('checkbox', { name: /Energy/ })).toBeChecked()
    expect(within(topics).getByRole('checkbox', { name: /Forces/ })).not.toBeChecked()
    expect(within(topics).getByRole('checkbox', { name: '1.1 Forces (done)' })).toBeInTheDocument()
    expect(within(form).queryByLabelText(/Admin note/)).not.toBeInTheDocument()

    fireEvent.click(within(form).getByRole('button', { name: 'Save as held' }))
    expect(within(form).getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(mockLog).toHaveBeenCalledWith(101, { held: true, reason: '', topic_ids: [12], admin_note: '' })
    expect(await screen.findByText('Held', { selector: '.status-pill' })).toBeInTheDocument()
  })

  it('needs a reason for not held', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ display_status: 'UNLOGGED', can_log: true }))
    renderPanel()

    const form = await screen.findByRole('form', { name: 'Log this session' })
    fireEvent.click(within(form).getByRole('button', { name: /Not held/ }))
    const save = within(form).getByRole('button', { name: 'Save as not held' })
    expect(save).toBeDisabled()
    fireEvent.change(within(form).getByLabelText('Why did it not happen?'), { target: { value: 'Student ill' } })
    expect(save).toBeEnabled()
  })

  it('shows the server refusal in plain words', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ display_status: 'UNLOGGED', can_log: true }))
    mockLog.mockRejectedValue(
      new ApiError(400, { detail: ['The logging window closed 24 hours after the session. Ask admin to log it.'] }),
    )
    renderPanel()
    const form = await screen.findByRole('form', { name: 'Log this session' })
    fireEvent.click(within(form).getByRole('button', { name: /Held/ }))
    fireEvent.click(within(form).getByRole('button', { name: 'Save as held' }))
    expect(await within(form).findByRole('alert')).toHaveTextContent('Ask admin to log it.')
  })

  it('tells a tutor a missed session is closed, with no log buttons', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ display_status: 'MISSED', can_log: false }))
    renderPanel()
    expect(await screen.findByText(/The logging window closed 24 hours after the session/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Log this session' })).not.toBeInTheDocument()
  })

  it('asks staff for an admin note when logging someone else’s session', async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN_USER, isStaffLevel: true })
    mockGet.mockResolvedValue(makeSessionDetail({ display_status: 'MISSED', can_log: true }))
    mockLog.mockResolvedValue(makeSessionDetail({ status: 'HELD', display_status: 'HELD', can_log: true }))
    renderPanel()

    const form = await screen.findByRole('form', { name: 'Log this session' })
    fireEvent.click(within(form).getByRole('button', { name: /Held/ }))
    const save = within(form).getByRole('button', { name: 'Save as held' })
    expect(save).toBeDisabled()
    fireEvent.change(within(form).getByLabelText(/Admin note/), { target: { value: 'Confirmed with parent' } })
    fireEvent.click(save)
    await waitFor(() =>
      expect(mockLog).toHaveBeenCalledWith(101, expect.objectContaining({ admin_note: 'Confirmed with parent' })),
    )
    // Once logged, the correction form is folded behind a button.
    const correct = await screen.findByRole('button', { name: /Correct the log/ })
    expect(screen.queryByRole('form', { name: 'Correct the log' })).not.toBeInTheDocument()
    fireEvent.click(correct)
    expect(screen.getByRole('form', { name: 'Correct the log' })).toBeInTheDocument()
  })

  it('offers no planning on a session that has already happened', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ date: '2026-11-16', display_status: 'UNLOGGED', can_log: true }))
    renderPanel()
    await screen.findByRole('form', { name: 'Log this session' })
    expect(screen.queryByRole('region', { name: 'Plan' })).not.toBeInTheDocument()
  })
})

describe('SessionPanel: planning', () => {
  it('saves planned topics for an upcoming session', async () => {
    const session = makeSessionDetail({ date: '2026-11-23' })
    mockGet.mockResolvedValue(session)
    mockPlan.mockResolvedValue({ ...session, planned_topics: [11] })
    renderPanel()

    const plan = await screen.findByRole('region', { name: 'Plan' })
    fireEvent.click(within(plan).getByRole('checkbox', { name: /Forces/ }))
    fireEvent.click(within(plan).getByRole('button', { name: 'Save plan' }))
    await waitFor(() => expect(mockPlan).toHaveBeenCalledWith(101, [11]))
  })
})

describe('SessionPanel: changes', () => {
  it('lets a tutor ask to move an upcoming session, and shows it as waiting', async () => {
    const session = makeSessionDetail({ date: '2026-11-23' })
    mockGet.mockResolvedValue(session)
    mockRequest.mockResolvedValue({
      ...session,
      pending_request: { id: 5, kind: 'MOVE', new_date: '2026-11-24', new_start_time: '10:00', new_end_time: '11:00', reason: 'Exam' },
    })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: /Ask to move/ }))
    const form = screen.getByRole('form', { name: 'Ask to move' })
    expect(within(form).getByText('Nothing changes until admin approves.')).toBeInTheDocument()
    fireEvent.change(within(form).getByLabelText('Start'), { target: { value: '10:00' } })
    fireEvent.change(within(form).getByLabelText('End'), { target: { value: '11:00' } })
    fireEvent.change(within(form).getByLabelText('Reason'), { target: { value: 'Exam' } })
    fireEvent.click(within(form).getByRole('button', { name: 'Send request' }))

    expect((await screen.findByText(/Waiting for approval/)).closest('.session-note')).toHaveTextContent('move to Tue 24 Nov 10:00–11:00')
    expect(mockRequest).toHaveBeenCalledWith(101, {
      kind: 'MOVE',
      new_date: '2026-11-23',
      new_start_time: '10:00',
      new_end_time: '11:00',
      reason: 'Exam',
    })
    expect(screen.queryByRole('button', { name: /Ask to move/ })).not.toBeInTheDocument()
  })

  it('shows a tutor a clash in plain words, with no Book anyway', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ date: '2026-11-23' }))
    mockRequest.mockRejectedValue(conflictError(ApiError, false))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: /Ask to move/ }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('Mr Banda already teaches IGCSE Physics')
    expect(within(notice).queryByRole('button', { name: 'Book anyway' })).not.toBeInTheDocument()
  })

  it('lets staff move with Book anyway after a clash warning', async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN_USER, isStaffLevel: true })
    const session = makeSessionDetail({ date: '2026-11-23' })
    const moved = makeSessionDetail({
      id: 202,
      date: '2026-11-24',
      moved_from: 101,
      moved_from_detail: { id: 101, date: '2026-11-23', start_time: '16:00', end_time: '17:00' },
    })
    // The panel follows the move to the new session's id.
    mockGet.mockImplementation((id) => Promise.resolve(id === 202 ? moved : session))
    mockMove.mockRejectedValueOnce(conflictError(ApiError)).mockResolvedValueOnce(moved)
    const { onChanged } = renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: /Move/ }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Room' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move session' }))
    const notice = await screen.findByRole('alert')
    fireEvent.click(within(notice).getByRole('button', { name: 'Book anyway' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(mockMove).toHaveBeenLastCalledWith(101, expect.objectContaining({ reason: 'Room' }), true)
    expect(await screen.findByText('Moved from')).toBeInTheDocument()
  })

  it('Cancel on a clash warning goes back without saving', async () => {
    mockUseAuth.mockReturnValue({ user: ADMIN_USER, isStaffLevel: true })
    mockGet.mockResolvedValue(makeSessionDetail({ date: '2026-11-23' }))
    mockMove.mockRejectedValue(conflictError(ApiError))
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: /Move/ }))
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Room' } })
    fireEvent.click(screen.getByRole('button', { name: 'Move session' }))
    fireEvent.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(mockMove).toHaveBeenCalledTimes(1)
  })

  it('shows a tutor why a request was not approved', async () => {
    mockGet.mockResolvedValue(
      makeSessionDetail({ date: '2026-11-23', latest_request: { id: 3, kind: 'CANCEL', status: 'REJECTED', reject_reason: 'Exams week' } }),
    )
    renderPanel()
    expect((await screen.findByText(/was not approved/)).closest('.session-note')).toHaveTextContent('Reason: Exams week')
  })

  it('lets a tutor withdraw a pending request', async () => {
    const pending = { id: 5, kind: 'CANCEL', reason: 'Ill' }
    mockGet.mockResolvedValueOnce(makeSessionDetail({ date: '2026-11-23', pending_request: pending }))
    mockGet.mockResolvedValueOnce(makeSessionDetail({ date: '2026-11-23' }))
    mockWithdraw.mockResolvedValue({})
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw request' }))
    await waitFor(() => expect(mockWithdraw).toHaveBeenCalledWith(5))
    expect(await screen.findByRole('button', { name: /Ask to cancel/ })).toBeInTheDocument()
  })

  it('offers a tutor no change actions on a session that has started', async () => {
    mockGet.mockResolvedValue(makeSessionDetail({ date: '2026-11-16' }))
    renderPanel()
    await screen.findByText('IGCSE Physics')
    expect(screen.queryByRole('button', { name: /Ask to move/ })).not.toBeInTheDocument()
  })
})

describe('SessionPanel: details and history', () => {
  it('lists history from log events and requests, oldest first', async () => {
    mockGet.mockResolvedValue(
      makeSessionDetail({
        status: 'NOT_HELD',
        display_status: 'NOT_HELD',
        not_held_reason: 'No show',
        events: [{ id: 1, action: 'LOG', actor_name: 'Mr Banda', from_status: 'SCHEDULED', to_status: 'NOT_HELD', note: 'No show', created_at: '2026-11-16T17:30:00+02:00' }],
        change_requests: [{ id: 2, kind: 'CANCEL', status: 'CANCELLED', requested_by_name: 'Mr Banda', reason: 'Ill', reject_reason: '', created_at: '2026-11-15T09:00:00+02:00' }],
      }),
    )
    renderPanel()
    const history = await screen.findByRole('region', { name: 'History' })
    const items = within(history).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Mr Banda asked to cancel (Withdrawn)')
    expect(items[1]).toHaveTextContent('Logged: Scheduled to Not held by Mr Banda')
    expect(screen.getByText('No show', { selector: 'dd' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    mockGet.mockResolvedValue(makeSessionDetail())
    const { onClose } = renderPanel()
    await screen.findByText('IGCSE Physics')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('says so when the session cannot be found', async () => {
    mockGet.mockRejectedValue(new ApiError(404, {}))
    renderPanel()
    expect(await screen.findByRole('alert')).toHaveTextContent('This session no longer exists.')
  })
})
