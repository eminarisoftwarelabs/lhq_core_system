import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { assignableRoles } from '../auth/permissions'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { TutorProfileFields } from '../components/TutorProfileFields'
import { usersApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'

const EMPLOYMENT_TYPES = [
  { value: '', label: '—' },
  { value: 'FULL_TIME', label: 'Full time' },
  { value: 'PART_TIME', label: 'Part time' },
  { value: 'CONTRACT', label: 'Contract' },
]

const emptyTutorProfile = { hourly_rate: '', is_available: true }

export function CreateUserPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const roleOptions = assignableRoles(user.role)

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: roleOptions[0] || '',
    phone: '',
    employee_id: '',
    employment_type: '',
    address: '',
    start_date: '',
  })
  const [alsoTeaches, setAlsoTeaches] = useState(false)
  const [tutorProfile, setTutorProfile] = useState(emptyTutorProfile)
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const isTutorRole = form.role === 'TUTOR'
  const showTutorFields = isTutorRole || alsoTeaches

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = {
      email: form.email,
      full_name: form.full_name,
      role: form.role,
      phone: form.phone,
      employee_id: form.employee_id || null,
      employment_type: form.employment_type,
      address: form.address,
      start_date: form.start_date || null,
    }
    if (showTutorFields) {
      payload.tutor_profile = {
        hourly_rate: tutorProfile.hourly_rate || '0.00',
        is_available: tutorProfile.is_available,
      }
    }

    try {
      const created = await usersApi.create(payload)
      navigate(`/users/${created.id}`, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        setErrors(err.data)
      } else {
        setErrors({ detail: 'Could not create the user. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (roleOptions.length === 0) {
    return (
      <div className="page">
        <p>You don&apos;t have permission to create any accounts.</p>
      </div>
    )
  }

  return (
    <div className="page">
      <h1>Create user</h1>
      <form className="form" onSubmit={handleSubmit}>
        <NonFieldErrors errors={errors} />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => updateField('email', e.target.value)}
          required
        />
        <FieldErrors errors={errors} field="email" />

        <label htmlFor="full_name">Full name</label>
        <input
          id="full_name"
          type="text"
          value={form.full_name}
          onChange={(e) => updateField('full_name', e.target.value)}
          required
        />
        <FieldErrors errors={errors} field="full_name" />

        <label htmlFor="role">Role</label>
        <select id="role" value={form.role} onChange={(e) => updateField('role', e.target.value)} required>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <FieldErrors errors={errors} field="role" />

        <label htmlFor="phone">Phone</label>
        <input id="phone" type="text" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
        <FieldErrors errors={errors} field="phone" />

        <label htmlFor="employee_id">Employee ID</label>
        <input
          id="employee_id"
          type="text"
          value={form.employee_id}
          onChange={(e) => updateField('employee_id', e.target.value)}
        />
        <FieldErrors errors={errors} field="employee_id" />

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

        <label htmlFor="address">Address</label>
        <input
          id="address"
          type="text"
          value={form.address}
          onChange={(e) => updateField('address', e.target.value)}
        />
        <FieldErrors errors={errors} field="address" />

        <label htmlFor="start_date">Start date</label>
        <input
          id="start_date"
          type="date"
          value={form.start_date}
          onChange={(e) => updateField('start_date', e.target.value)}
        />
        <FieldErrors errors={errors} field="start_date" />

        {!isTutorRole && (
          <label htmlFor="also_teaches" className="checkbox-label">
            <input
              id="also_teaches"
              type="checkbox"
              checked={alsoTeaches}
              onChange={(e) => setAlsoTeaches(e.target.checked)}
            />
            This person also teaches
          </label>
        )}

        {showTutorFields && (
          <TutorProfileFields value={tutorProfile} onChange={setTutorProfile} idPrefix="create_tutor" />
        )}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create user'}
        </button>
      </form>
    </div>
  )
}
