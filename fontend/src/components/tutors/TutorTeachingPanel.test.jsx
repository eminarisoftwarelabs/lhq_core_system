import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/apiClient'
import { SETUP_WARNING } from '../../lib/tutorTeaching'
import { ToastProvider } from '../toast/ToastProvider'
import { TutorTeachingPanel } from './TutorTeachingPanel'

const api = {
  listAllSubjects: vi.fn(),
  getSubjects: vi.fn(),
  getWorkingHours: vi.fn(),
  setSubjects: vi.fn(),
  setWorkingHours: vi.fn(),
  listMine: vi.fn(),
  list: vi.fn(),
  submit: vi.fn(),
  cancel: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
}
vi.mock('../../lib/api', () => ({
  academicsApi: { listAllSubjects: (...a) => api.listAllSubjects(...a) },
  tutorsApi: {
    getSubjects: (...a) => api.getSubjects(...a),
    getWorkingHours: (...a) => api.getWorkingHours(...a),
    setSubjects: (...a) => api.setSubjects(...a),
    setWorkingHours: (...a) => api.setWorkingHours(...a),
  },
  changeRequestsApi: {
    listMine: (...a) => api.listMine(...a),
    list: (...a) => api.list(...a),
    submit: (...a) => api.submit(...a),
    cancel: (...a) => api.cancel(...a),
    approve: (...a) => api.approve(...a),
    reject: (...a) => api.reject(...a),
  },
}))

const maths = { id: 1, name: 'Mathematics', level: 3, level_name: 'IGCSE' }
const physics = { id: 2, name: 'Physics', level: 3, level_name: 'IGCSE' }
const monday = { weekday: 0, start_time: '08:00', end_time: '12:00' }

function renderPanel(mode) {
  return render(
    <ToastProvider>
      <TutorTeachingPanel tutorId={5} mode={mode} />
    </ToastProvider>,
  )
}

function section(title) {
  return screen.getAllByText(title).find((el) => el.closest('.detail-section__header')).closest('.detail-section')
}

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  api.listAllSubjects.mockResolvedValue([maths, physics])
  api.getSubjects.mockResolvedValue([maths])
  api.getWorkingHours.mockResolvedValue([monday])
  api.listMine.mockResolvedValue([])
  api.list.mockResolvedValue([])
})

describe('TutorTeachingPanel, staff (direct)', () => {
  it('shows the live subjects and hours, and no warning when both are set', async () => {
    renderPanel('direct')

    expect(await screen.findByText('Mathematics')).toBeInTheDocument()
    expect(screen.getByText('Monday 08:00 to 12:00')).toBeInTheDocument()
    expect(screen.queryByText(SETUP_WARNING)).not.toBeInTheDocument()
    expect(api.list).toHaveBeenCalledWith({ status: 'PENDING', tutor: 5 })
  })

  it('warns when the tutor has no working hours', async () => {
    api.getWorkingHours.mockResolvedValue([])
    renderPanel('direct')
    expect(await screen.findByText(SETUP_WARNING)).toBeInTheDocument()
  })

  it('saves subjects straight away', async () => {
    api.setSubjects.mockResolvedValue([maths, physics])
    renderPanel('direct')
    await screen.findByText('Mathematics')

    fireEvent.click(within(section('Subjects taught')).getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByLabelText('IGCSE Physics'))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.setSubjects).toHaveBeenCalledWith(5, [1, 2]))
    expect(api.submit).not.toHaveBeenCalled()
    expect(await screen.findByText('Physics')).toBeInTheDocument()
  })

  it('shows the overlap message from the server and keeps the form open', async () => {
    api.setWorkingHours.mockRejectedValue(
      new ApiError(400, { working_hours: ['Monday 11:00 to 13:00 overlaps Monday 08:00 to 12:00.'] }),
    )
    renderPanel('direct')
    await screen.findByText('Monday 08:00 to 12:00')

    fireEvent.click(within(section('Working hours')).getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add hours' }))
    fireEvent.change(screen.getByLabelText('Day for block 2'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Start time for block 2'), { target: { value: '11:00' } })
    fireEvent.change(screen.getByLabelText('End time for block 2'), { target: { value: '13:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Monday 11:00 to 13:00 overlaps Monday 08:00 to 12:00.')).toBeInTheDocument()
    expect(api.setWorkingHours).toHaveBeenCalledWith(5, [monday, { weekday: 0, start_time: '11:00', end_time: '13:00' }])
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('disables Save until something changes', async () => {
    renderPanel('direct')
    await screen.findByText('Mathematics')
    fireEvent.click(within(section('Subjects taught')).getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('shows a pending request with Approve and Reject, and reloads after approving', async () => {
    const pending = {
      id: 9,
      kind: 'SUBJECTS',
      status: 'PENDING',
      tutor_name: 'Tam Tutor',
      current: [maths],
      proposed: [physics],
      note: '',
    }
    api.list.mockResolvedValueOnce([pending]).mockResolvedValue([])
    api.approve.mockResolvedValue({ ...pending, status: 'APPROVED' })
    renderPanel('direct')

    expect(await screen.findByText('Tam Tutor asked to change this')).toBeInTheDocument()
    api.getSubjects.mockResolvedValue([physics])
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    await waitFor(() => expect(screen.queryByText('Tam Tutor asked to change this')).not.toBeInTheDocument())
    expect(api.approve).toHaveBeenCalledWith(9)
  })
})

describe('TutorTeachingPanel, tutor (request)', () => {
  it('sends a change request instead of saving, with the note', async () => {
    const created = { id: 3, kind: 'SUBJECTS', status: 'PENDING', proposed: [maths, physics] }
    api.submit.mockResolvedValue(created)
    api.listMine.mockResolvedValueOnce([]).mockResolvedValue([created])
    renderPanel('request')
    await screen.findByText('Mathematics')

    fireEvent.click(within(section('Subjects taught')).getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByLabelText('IGCSE Physics'))
    fireEvent.change(screen.getByLabelText('Note for the admin (optional)'), { target: { value: 'Covering Physics' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }))

    await waitFor(() => expect(api.submit).toHaveBeenCalledWith('SUBJECTS', [1, 2], 'Covering Physics'))
    expect(api.setSubjects).not.toHaveBeenCalled()
    expect(await screen.findByText('Pending approval')).toBeInTheDocument()
    // Live values are unchanged until approval.
    const summary = within(section('Subjects taught')).getAllByText(/Mathematics|Physics/)
    expect(summary.map((el) => el.textContent)).toContain('Mathematics')
  })

  it('locks the form while sending, so a double click sends one request (Feature 1 review fix)', async () => {
    let finish
    api.submit.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    api.listMine.mockResolvedValue([])
    renderPanel('request')
    await screen.findByText('Mathematics')

    fireEvent.click(within(section('Subjects taught')).getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByLabelText('IGCSE Physics'))
    const send = screen.getByRole('button', { name: 'Send for approval' })
    // Two submits in the same tick, before React re-renders the button.
    fireEvent.submit(send.closest('form'))
    fireEvent.submit(send.closest('form'))

    expect(api.submit).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText('IGCSE Physics')).toBeDisabled()
    expect(screen.getByLabelText('Note for the admin (optional)')).toBeDisabled()

    finish({ id: 3, kind: 'SUBJECTS', status: 'PENDING', proposed: [maths, physics] })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument())
  })

  it('shows the pending proposal and cancels it', async () => {
    const pending = { id: 4, kind: 'WORKING_HOURS', status: 'PENDING', proposed: [{ weekday: 5, start_time: '09:00', end_time: '12:00' }] }
    api.listMine.mockResolvedValueOnce([pending]).mockResolvedValue([{ ...pending, status: 'CANCELLED' }])
    api.cancel.mockResolvedValue({ ...pending, status: 'CANCELLED' })
    renderPanel('request')

    expect(await screen.findByText('Pending approval')).toBeInTheDocument()
    expect(screen.getByText('Saturday 09:00 to 12:00')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))

    await waitFor(() => expect(screen.queryByText('Pending approval')).not.toBeInTheDocument())
    expect(api.cancel).toHaveBeenCalledWith(4)
  })

  it('starts an edit from the pending proposal, not the live value', async () => {
    api.listMine.mockResolvedValue([{ id: 4, kind: 'SUBJECTS', status: 'PENDING', proposed: [physics] }])
    renderPanel('request')
    await screen.findByText('Pending approval')

    fireEvent.click(within(section('Subjects taught')).getByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('IGCSE Physics')).toBeChecked()
    expect(screen.getByLabelText('IGCSE Mathematics')).not.toBeChecked()
  })

  it('shows the reason when the last request was rejected', async () => {
    api.listMine.mockResolvedValue([
      { id: 6, kind: 'SUBJECTS', status: 'REJECTED', reject_reason: 'Physics is fully staffed.', proposed: [physics] },
    ])
    renderPanel('request')

    expect(await screen.findByText('Your last change was not approved')).toBeInTheDocument()
    expect(screen.getByText('Physics is fully staffed.')).toBeInTheDocument()
  })
})

describe('TutorTeachingPanel, read only', () => {
  it('offers no Edit buttons and fetches no requests', async () => {
    renderPanel('readonly')
    await screen.findByText('Mathematics')
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(api.list).not.toHaveBeenCalled()
    expect(api.listMine).not.toHaveBeenCalled()
  })

  it('says so when loading fails', async () => {
    api.getSubjects.mockRejectedValue(new Error('down'))
    renderPanel('readonly')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load subjects and working hours.')
  })
})
