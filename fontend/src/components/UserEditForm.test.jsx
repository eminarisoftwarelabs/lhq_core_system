import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from './toast/ToastProvider'
import { UserEditForm } from './UserEditForm'

const mockUpdate = vi.fn()
vi.mock('../lib/api', () => ({
  usersApi: { update: (...args) => mockUpdate(...args) },
}))

// Saving confirms via a toast, like every other edit form in the app, so
// the form needs the provider the app root supplies.
function render(ui) {
  return rtlRender(<ToastProvider>{ui}</ToastProvider>)
}

const tutor = { id: 2, email: 't@lhq.test', full_name: 'Tam Tutor', role: 'TUTOR', is_active: true, teaches: true, tutor_profile: { hourly_rate: '40.00', is_available: true } }
const owner = { id: 1, email: 'o@lhq.test', full_name: 'Ola Owner', role: 'OWNER', is_active: true, teaches: false, tutor_profile: null }
const admin = { id: 3, email: 'a@lhq.test', full_name: 'Adi Admin', role: 'ADMIN', is_active: true, teaches: false, tutor_profile: null }

describe('UserEditForm permission gating', () => {
  it('a self-edit never shows role or is_active, even for an Owner editing themselves', () => {
    render(<UserEditForm actor={owner} target={owner} />)

    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Active')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('an Owner editing a Tutor sees role and is_active, filtered to what Owner can assign', () => {
    render(<UserEditForm actor={owner} target={tutor} />)

    const roleSelect = screen.getByLabelText('Role')
    expect(roleSelect).toBeInTheDocument()
    const optionValues = [...roleSelect.querySelectorAll('option')].map((o) => o.value)
    expect(optionValues).toEqual(['TUTOR', 'ADMIN'])
    expect(screen.getByLabelText('Active')).toBeInTheDocument()
  })

  it('an Admin editing an Owner (out of scope, not self) gets a read-only view', () => {
    render(<UserEditForm actor={admin} target={owner} />)

    expect(screen.getByText(/can view this account but can.t edit it/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('an Admin editing a Tutor gets the full staff field set', () => {
    render(<UserEditForm actor={admin} target={tutor} />)

    const roleSelect = screen.getByLabelText('Role')
    const optionValues = [...roleSelect.querySelectorAll('option')].map((o) => o.value)
    expect(optionValues).toEqual(['TUTOR'])
    expect(screen.getByLabelText('Active')).toBeInTheDocument()
  })

  describe('start date field', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-15T00:00:00'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('uses the themed date picker, not a native date input', () => {
      render(<UserEditForm actor={admin} target={tutor} />)

      const field = screen.getByLabelText('Start date')
      expect(field.tagName).toBe('BUTTON')
      expect(screen.getByText('Select date')).toBeInTheDocument()
    })

    it('picking a day sets the start date', () => {
      render(<UserEditForm actor={admin} target={tutor} />)

      fireEvent.click(screen.getByLabelText('Start date'))
      fireEvent.click(document.querySelector('.rdp-today .rdp-day_button'))

      expect(screen.getByLabelText('Start date')).toHaveTextContent('Sep 15, 2026')
    })
  })
})

describe('UserEditForm layout', () => {
  it('a self-edit shows only the Personal details section', () => {
    render(<UserEditForm actor={tutor} target={tutor} />)

    expect(screen.getByRole('group', { name: 'Personal details' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Employment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Access' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Teaching' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeDisabled()
  })

  it('a staff edit groups fields into Personal details, Employment, Access, and Teaching', () => {
    render(<UserEditForm actor={owner} target={tutor} />)

    for (const name of ['Personal details', 'Employment', 'Access', 'Teaching']) {
      expect(screen.getByRole('group', { name })).toBeInTheDocument()
    }
    expect(screen.getByLabelText('Hourly rate')).toHaveValue(40)
  })

  it('labels role options with human-readable names', () => {
    render(<UserEditForm actor={owner} target={tutor} />)

    expect(screen.getByRole('option', { name: 'Tutor' })).toHaveValue('TUTOR')
    expect(screen.getByRole('option', { name: 'Admin' })).toHaveValue('ADMIN')
  })

  it('saving PATCHes the editable fields, confirms with a toast, and hands back the result', async () => {
    const onSaved = vi.fn()
    mockUpdate.mockReset().mockResolvedValue({ ...tutor, full_name: 'Tam T.' })
    render(<UserEditForm actor={tutor} target={tutor} onSaved={onSaved} />)

    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Tam T.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith(2, { full_name: 'Tam T.', phone: '', address: '' }),
    )
    expect(await screen.findByText('Changes saved')).toBeInTheDocument()
    expect(onSaved).toHaveBeenCalledWith({ ...tutor, full_name: 'Tam T.' })
  })

  it('shows field errors from the server and no toast', async () => {
    const { ApiError } = await import('../lib/apiClient')
    mockUpdate.mockReset().mockRejectedValue(new ApiError(400, { full_name: ['This field may not be blank.'] }))
    render(<UserEditForm actor={tutor} target={tutor} />)

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('This field may not be blank.')).toBeInTheDocument()
    expect(screen.queryByText('Changes saved')).not.toBeInTheDocument()
  })
})
