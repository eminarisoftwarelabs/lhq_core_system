import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { UserEditForm } from '../components/UserEditForm'
import { usersApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

export function UserDetailPage() {
  const { id } = useParams()
  const { user: actor } = useAuth()
  const [target, setTarget] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(target?.full_name || target?.email)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (cancelled) return
      setLoading(true)
      setError(null)
      try {
        const res = await usersApi.get(id)
        if (!cancelled) setTarget(res)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (String(actor.id) === String(id)) {
    return <Navigate to="/me" replace />
  }

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">User not found.</div>
  if (error) return <div className="page">Could not load this user.</div>

  return (
    <div className="page">
      <UserEditForm actor={actor} target={target} onSaved={setTarget} />
    </div>
  )
}
