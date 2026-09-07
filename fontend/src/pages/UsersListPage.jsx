import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { roleLabel } from '../auth/permissions'
import { useAuth } from '../auth/useAuth'
import { usersApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

const PAGE_SIZE = 20

export function UsersListPage() {
  const { user: actor } = useAuth()
  usePageTitle('Users')
  const [page, setPage] = useState(1)
  const [reloadToken, setReloadToken] = useState(0)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState(null)
  const [pendingId, setPendingId] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (cancelled) return
      setLoading(true)
      setError(null)
      try {
        const res = await usersApi.list(page)
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Could not load users.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [page, reloadToken])

  async function handleToggleActive(user) {
    const deactivating = user.is_active
    if (deactivating && !window.confirm(`Deactivate ${user.full_name || user.email}?`)) {
      return
    }

    setActionError(null)
    setPendingId(user.id)
    try {
      await usersApi.update(user.id, { is_active: !user.is_active })
      setReloadToken((t) => t + 1)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not update this user. Try again.',
      )
    } finally {
      setPendingId(null)
    }
  }

  async function handleDelete(user) {
    const name = user.full_name || user.email
    if (!window.confirm(`Permanently delete ${name}? This cannot be undone.`)) {
      return
    }

    setActionError(null)
    setPendingId(user.id)
    try {
      await usersApi.delete(user.id)
      setReloadToken((t) => t + 1)
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Could not delete this user. Try again.',
      )
    } finally {
      setPendingId(null)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  return (
    <div className="page">
      <div className="page-toolbar">
        <Link className="button" to="/users/new">
          Create user
        </Link>
      </div>

      {loading && <p>Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {!loading && !error && data && data.results.length === 0 && <p>No users found.</p>}

      {!loading && !error && data && data.results.length > 0 && (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link to={`/users/${u.id}`}>{u.full_name || '(no name)'}</Link>
                  </td>
                  <td>{u.email}</td>
                  <td>{roleLabel(u.role)}</td>
                  <td>{u.is_active ? 'Active' : 'Deactivated'}</td>
                  <td>
                    <Link to={`/users/${u.id}`}>Edit</Link>{' '}
                    <button type="button" disabled={pendingId === u.id} onClick={() => handleToggleActive(u)}>
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>{' '}
                    {u.id !== actor.id && (
                      <button
                        type="button"
                        className="button-danger"
                        disabled={pendingId === u.id}
                        onClick={() => handleDelete(u)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button type="button" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button type="button" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
