import { KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { PasswordField } from '../components/ui/PasswordField'
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
        <span className="auth-form__icon">
          <KeyRound size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h1>{forced ? 'Set a new password' : 'Change your password'}</h1>
        <p className="auth-form__subtitle">
          {forced
            ? 'You need to set a new password before continuing.'
            : 'Enter your current password, then choose a new one.'}
        </p>
        <NonFieldErrors errors={errors} />

        <PasswordField
          id="current_password"
          label="Current password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          required
        >
          <FieldErrors errors={errors} field="current_password" />
        </PasswordField>

        {/* minLength={8} on the new password is TEMPORARILY DISABLED FOR
            TESTING, matching backend's AUTH_PASSWORD_VALIDATORS being
            emptied out. Restore this before deploying anywhere real. */}
        <PasswordField
          id="new_password"
          label="New password"
          autoComplete="new-password"
          value={newPassword}
          onChange={setNewPassword}
          required
        >
          <FieldErrors errors={errors} field="new_password" />
        </PasswordField>

        <PasswordField
          id="confirm_password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          required
        />

        <button type="submit" className="auth-form__submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Change password'}
        </button>

        {/* Forced: the only other way out is to log out. Voluntary (from My
            Profile): just go back. */}
        {forced ? (
          <button type="button" className="auth-form__escape" onClick={handleLogout}>
            <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
            Log out
          </button>
        ) : (
          <Link className="auth-form__escape" to="/me">
            Cancel
          </Link>
        )}
      </form>
    </div>
  )
}
