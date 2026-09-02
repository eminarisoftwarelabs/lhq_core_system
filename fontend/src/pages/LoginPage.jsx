import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/layout/Logo'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { useAuth } from '../auth/useAuth'
import { ApiError } from '../lib/apiClient'

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  if (isAuthenticated) {
    const from = location.state?.from?.pathname || '/'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      const from = location.state?.from?.pathname || '/'
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.data?.detail || 'Login failed.')
      } else {
        setError('Could not reach the server. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-page__form-panel">
        <ThemeToggle className="login-page__theme-toggle" />

        <div className="login-page__form-inner">
          <Logo />

          <h1>Welcome back</h1>
          <p className="login-page__subtitle">Sign in to LHQ Learning Hub</p>

          <form className="login-page__form" onSubmit={handleSubmit}>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>
      </div>

      <div className="login-page__brand-panel" aria-hidden="true">
        <div className="login-page__brand-content">
          <span className="login-page__brand-mark">LHQ</span>
          <p className="login-page__brand-tagline">
            Enquiries, students, and invoices, in one place.
          </p>
        </div>
      </div>
    </div>
  )
}
