import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserEditForm } from './UserEditForm'

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
