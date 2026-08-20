import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { authApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'

export function ChangePasswordPage() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const forced = Boolean(user?.must_change_password)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)

    if (newPassword !== confirmPassword) {
      setErrors({ new_password: ['New password and confirmation do not match.'] })
      return
    }

    setSubmitting(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      setUser((u) => ({ ...u, must_change_password: false }))
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        setErrors(err.data)
      } else {
        setErrors({ detail: 'Could not change your password. Try again.' })
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>{forced ? 'Set a new password' : 'Change your password'}</h1>
        {forced && <p className="form-note">You need to set a new password before continuing.</p>}
        <NonFieldErrors errors={errors} />

        <label htmlFor="current_password">Current password</label>
        <input
          id="current_password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
        <FieldErrors errors={errors} field="current_password" />

        <label htmlFor="new_password">New password</label>
        <input
          id="new_password"
          type="password"
          autoComplete="new-password"
          // minLength={8} - TEMPORARILY DISABLED FOR TESTING, matching
          // backend's AUTH_PASSWORD_VALIDATORS being emptied out. Restore
          // this before deploying anywhere real.
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <FieldErrors errors={errors} field="new_password" />

        <label htmlFor="confirm_password">Confirm new password</label>
        <input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Change password'}
        </button>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </form>
    </div>
  )
}
