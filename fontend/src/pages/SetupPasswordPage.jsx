import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'

export function SetupPasswordPage() {
  const [searchParams] = useSearchParams()
  const uid = searchParams.get('uid') || ''
  const token = searchParams.get('token') || ''
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  const missingLinkParams = !uid || !token

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors([])

    if (newPassword !== confirmPassword) {
      setErrors(['Passwords do not match.'])
      return
    }

    setSubmitting(true)
    try {
      await authApi.setupPassword(uid, token, newPassword)
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.data) {
        const messages = Object.values(err.data).flat()
        setErrors(messages.length ? messages : ['Could not set your password.'])
      } else {
        setErrors(['Could not reach the server. Try again.'])
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Password set</h1>
          <p>Your password has been set. You can now log in.</p>
          <Link to="/login">Go to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Set your password</h1>
        {missingLinkParams && (
          <p className="form-error" role="alert">
            This link is missing its <code>uid</code>/<code>token</code> parameters. Ask
            whoever set up your account for a valid setup link — there&apos;s no way to
            request one from this page yet.
          </p>
        )}
        {errors.length > 0 && (
          <ul className="form-error" role="alert">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        <label htmlFor="new_password">New password</label>
        <input
          id="new_password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
        <label htmlFor="confirm_password">Confirm password</label>
        <input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting || missingLinkParams}>
          {submitting ? 'Setting password…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}
