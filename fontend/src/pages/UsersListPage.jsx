import { UserCog, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { hasStaffScopeOver, roleLabel } from '../auth/permissions'
import { useAuth } from '../auth/useAuth'
import { usersApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { initials } from '../lib/initials'
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
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <UserCog size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Users</h2>
            {!loading && !error && data && <span className="onboarding-section__count">{data.count}</span>}
          </div>

          <Link className="button" to="/users/new">
            <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
            Create user
          </Link>
        </div>

        {loading && <p className="recent-enrollments__status">Loading…</p>}
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

        {!loading && !error && data && data.results.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <UserCog size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>No users found.</p>
          </div>
        )}

        {!loading && !error && data && data.results.length > 0 && (
          <ul className="roster-list directory-card__list">
            {data.results.map((u) => {
              const isSelf = u.id === actor.id
              const name = u.full_name || u.email
              // Same rule as editableFields(): nobody deactivates or deletes
              // themselves, and an Admin can only act on Tutors.
              const canManage = !isSelf && hasStaffScopeOver(actor.role, u.role)
              return (
                <li key={u.id} className={`roster-row user-row${u.is_active ? '' : ' user-row--inactive'}`}>
                  <div className="roster-row__who">
                    <span className="avatar-badge avatar-badge--sm" aria-hidden="true">
                      {initials(name)}
                    </span>
                    <div className="directory-row__identity">
                      {/* Stretched link (see .roster-row__link in index.css): the
                          anchor's text stays just the name, but its ::after covers
                          the whole row. The action buttons sit above it on their
                          own layer so they stay clickable. */}
                      <Link to={isSelf ? '/me' : `/users/${u.id}`} className="roster-row__link">
                        {u.full_name || '(no name)'}
                      </Link>
                      <span className="directory-row__subtext">{u.email}</span>
                    </div>
                  </div>

                  <div className="user-row__side">
                    <span className="directory-row__badges">
                      {isSelf && <span className="stage-badge user-badge--self">You</span>}
                      <span className="stage-badge role-badge">{roleLabel(u.role)}</span>
                      <span
                        className={`stage-badge user-status-badge user-status-badge--${u.is_active ? 'active' : 'inactive'}`}
                      >
                        {u.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </span>

                    {canManage && (
                      <span className="user-row__actions">
                        <button
                          type="button"
                          className="button button--secondary button--compact"
                          disabled={pendingId === u.id}
                          onClick={() => handleToggleActive(u)}
                        >
                          {u.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                        <button
                          type="button"
                          className="button button--danger button--compact"
                          disabled={pendingId === u.id}
                          onClick={() => handleDelete(u)}
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && !error && totalPages > 1 && (
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
      </section>
    </div>
  )
}
