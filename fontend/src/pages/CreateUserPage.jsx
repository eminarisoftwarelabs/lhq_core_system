import { Briefcase, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { assignableRoles } from '../auth/permissions'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { TutorProfileFields } from '../components/TutorProfileFields'
import { useToast } from '../components/toast/useToast'
import { DatePickerField } from '../components/ui/DatePickerField'
import { usersApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

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
  const { showToast } = useToast()
  const roleOptions = assignableRoles(user.role)
  usePageTitle('Create user')

  const [form, setForm] = useState({
    email: '',
    full_name: '',
    role: roleOptions[0] || '',
    password: '',
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
      password: form.password,
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
      await usersApi.create(payload)
      showToast('New user created')
      navigate('/users', { replace: true })
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
      <div className="form-card">
        <form className="form" onSubmit={handleSubmit}>
          <NonFieldErrors errors={errors} />

          <fieldset>
            <legend>
              <span className="icon-badge">
                <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Account
            </legend>
            <div className="form-row">
              <div className="field field--full field--required">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  required
                />
                <FieldErrors errors={errors} field="email" />
              </div>

              <div className="field field--full field--required">
                <label htmlFor="full_name">Full name</label>
                <input
                  id="full_name"
                  type="text"
                  value={form.full_name}
                  onChange={(e) => updateField('full_name', e.target.value)}
                  required
                />
                <FieldErrors errors={errors} field="full_name" />
              </div>

              <div className="field field--required">
                <label htmlFor="role">Role</label>
                <select id="role" value={form.role} onChange={(e) => updateField('role', e.target.value)} required>
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <FieldErrors errors={errors} field="role" />
              </div>

              <div className="field field--required">
                <label htmlFor="password">Starting password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  // minLength={8} - TEMPORARILY DISABLED FOR TESTING, matching
                  // backend's AUTH_PASSWORD_VALIDATORS being emptied out. Restore
                  // this before deploying anywhere real.
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  required
                />
                <FieldErrors errors={errors} field="password" />
              </div>
            </div>
            <p className="form-note">
              No email is sent yet, so share this password with them directly. They&apos;ll be
              required to change it the first time they log in.
            </p>
          </fieldset>

          <fieldset>
            <legend>
              <span className="icon-badge">
                <Briefcase size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Employment
            </legend>
            <div className="form-row">
              <div className="field">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="text"
                  value={form.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                />
                <FieldErrors errors={errors} field="phone" />
              </div>

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

              <div className="field">
                <label htmlFor="start_date">Start date</label>
                <DatePickerField
                  id="start_date"
                  value={form.start_date}
                  onChange={(value) => updateField('start_date', value)}
                />
                <FieldErrors errors={errors} field="start_date" />
              </div>

              <div className="field field--full">
                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  type="text"
                  value={form.address}
                  onChange={(e) => updateField('address', e.target.value)}
                />
                <FieldErrors errors={errors} field="address" />
              </div>
            </div>

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
          </fieldset>

          <div className="form-actions">
            <Link className="button button--secondary" to="/users">
              Cancel
            </Link>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
