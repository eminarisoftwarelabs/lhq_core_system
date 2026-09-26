import { Briefcase, GraduationCap, Lock, ShieldCheck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { editableFields, roleLabel, roleOptionsForEdit } from '../auth/permissions'
import { usersApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { FieldErrors, NonFieldErrors } from './FieldErrors'
import { useToast } from './toast/useToast'
import { TutorProfileFields } from './TutorProfileFields'
import { DatePickerField } from './ui/DatePickerField'

const EMPLOYMENT_TYPES = [
  { value: '', label: '—' },
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
]

function fieldsToState(target) {
  return {
    full_name: target.full_name || '',
    phone: target.phone || '',
    employee_id: target.employee_id || '',
    employment_type: target.employment_type || '',
    address: target.address || '',
    start_date: target.start_date || '',
    role: target.role,
    is_active: target.is_active,
  }
}

export function UserEditForm({ actor, target, onSaved }) {
  const editable = editableFields(actor, target)
  const canEditAnything = editable.length > 0

  const { showToast } = useToast()
  const [form, setForm] = useState(fieldsToState(target))
  const [alsoTeaches, setAlsoTeaches] = useState(target.teaches)
  const [tutorProfile, setTutorProfile] = useState({
    hourly_rate: target.tutor_profile?.hourly_rate ?? '',
    is_available: target.tutor_profile?.is_available ?? true,
  })
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  function isEditable(field) {
    return editable.includes(field)
  }

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = {}
    for (const field of editable) {
      if (field === 'tutor_profile') continue
      if (field === 'employee_id') {
        payload.employee_id = form.employee_id || null
      } else if (field === 'start_date') {
        payload.start_date = form.start_date || null
      } else {
        payload[field] = form[field]
      }
    }
    if (isEditable('tutor_profile') && alsoTeaches) {
      payload.tutor_profile = {
        hourly_rate: tutorProfile.hourly_rate || '0.00',
        is_available: tutorProfile.is_available,
      }
    }

    try {
      const updated = await usersApi.update(target.id, payload)
      showToast('Changes saved')
      onSaved?.(updated)
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        setErrors(err.data)
      } else {
        setErrors({ detail: 'Could not save changes. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const roleOptions = isEditable('role') ? roleOptionsForEdit(actor.role, target.role) : []
  const showEmployment = ['employee_id', 'employment_type', 'start_date'].some(isEditable)
  const showAccess = isEditable('role') || isEditable('is_active')

  return (
    <form className="form" onSubmit={handleSubmit}>
      <NonFieldErrors errors={errors} />
      {!canEditAnything && (
        <p className="form-note form-note--icon">
          <Lock size={14} strokeWidth={1.75} aria-hidden="true" />
          You can view this account but can&apos;t edit it.
        </p>
      )}

      <fieldset>
        <legend>
          <span className="icon-badge">
            <UserRound size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          Personal details
        </legend>
        <div className="form-row form-row--2col">
          <div className="field field--full">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={target.email} disabled readOnly />
          </div>

          <div className="field">
            <label htmlFor="full_name">Full name</label>
            <input
              id="full_name"
              type="text"
              value={form.full_name}
              onChange={(e) => updateField('full_name', e.target.value)}
              disabled={!isEditable('full_name')}
            />
            <FieldErrors errors={errors} field="full_name" />
          </div>

          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="text"
              value={form.phone}
              onChange={(e) => updateField('phone', e.target.value)}
              disabled={!isEditable('phone')}
            />
            <FieldErrors errors={errors} field="phone" />
          </div>

          <div className="field field--full">
            <label htmlFor="address">Address</label>
            <input
              id="address"
              type="text"
              value={form.address}
              onChange={(e) => updateField('address', e.target.value)}
              disabled={!isEditable('address')}
            />
            <FieldErrors errors={errors} field="address" />
          </div>
        </div>
      </fieldset>

      {showEmployment && (
        <fieldset>
          <legend>
            <span className="icon-badge">
              <Briefcase size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Employment
          </legend>
          <div className="form-row">
            {isEditable('employee_id') && (
              <div className="field">
                <label htmlFor="employee_id">Employee ID</label>
                <input
                  id="employee_id"
                  type="text"
                  value={form.employee_id}
                  onChange={(e) => updateField('employee_id', e.target.value)}
                />
                <FieldErrors errors={errors} field="employee_id" />
              </div>
            )}

            {isEditable('employment_type') && (
              <div className="field">
                <label htmlFor="employment_type">Employment type</label>
                <select
                  id="employment_type"
                  value={form.employment_type}
                  onChange={(e) => updateField('employment_type', e.target.value)}
                >
                  {EMPLOYMENT_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <FieldErrors errors={errors} field="employment_type" />
              </div>
            )}

            {isEditable('start_date') && (
              <div className="field">
                <label htmlFor="start_date">Start date</label>
                <DatePickerField
                  id="start_date"
                  value={form.start_date}
                  onChange={(value) => updateField('start_date', value)}
                />
                <FieldErrors errors={errors} field="start_date" />
              </div>
            )}
          </div>
        </fieldset>
      )}

      {showAccess && (
        <fieldset>
          <legend>
            <span className="icon-badge">
              <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Access
          </legend>
          {isEditable('role') && (
            <div className="form-row form-row--2col">
              <div className="field">
                <label htmlFor="role">Role</label>
                <select id="role" value={form.role} onChange={(e) => updateField('role', e.target.value)}>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
                <FieldErrors errors={errors} field="role" />
              </div>
            </div>
          )}

          {isEditable('is_active') && (
            <label htmlFor="is_active" className="checkbox-label">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => updateField('is_active', e.target.checked)}
              />
              Active
            </label>
          )}
        </fieldset>
      )}

      {isEditable('tutor_profile') && (
        <fieldset>
          <legend>
            <span className="icon-badge">
              <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Teaching
          </legend>
          <label htmlFor="also_teaches" className="checkbox-label">
            <input
              id="also_teaches"
              type="checkbox"
              checked={alsoTeaches}
              onChange={(e) => setAlsoTeaches(e.target.checked)}
            />
            Teaches
          </label>
          {alsoTeaches && (
            <TutorProfileFields value={tutorProfile} onChange={setTutorProfile} idPrefix="edit_tutor" />
          )}
        </fieldset>
      )}

      {canEditAnything && (
        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </form>
  )
}
