import { ClipboardCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChangeRequestReview } from '../components/tutors/ChangeRequestReview'
import { changeRequestsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { formatStageAge } from '../lib/stageAge'
import { usePageTitle } from '../lib/usePageTitle'

const KIND_LABELS = { SUBJECTS: 'Subjects', WORKING_HOURS: 'Working hours' }

function ageLabel(createdAt) {
  const age = formatStageAge(new Date(createdAt))
  return age === 'Just now' ? age : `${age} ago`
}

// Staff review queue: every pending request from tutors this user has
// authority over (the server does the filtering), newest first.
export function ChangeRequestsPage() {
  usePageTitle('Change requests')
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    changeRequestsApi
      .list({ status: 'PENDING' })
      .then((res) => {
        if (!cancelled) setRequests(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load change requests.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleReviewed(updated) {
    setRequests((current) => current.filter((r) => r.id !== updated.id))
  }

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Pending change requests</h2>
            {requests && <span className="onboarding-section__count">{requests.length}</span>}
          </div>
        </div>

        {!requests && !error && <p className="recent-enrollments__status">Loading…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {requests && requests.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <ClipboardCheck size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>Nothing waiting for review.</p>
          </div>
        )}

        {requests?.map((request) => (
          <article key={request.id} className="change-card" aria-label={`${request.tutor_name}: ${KIND_LABELS[request.kind]}`}>
            <header className="change-card__header">
              <Link to={`/users/${request.tutor_user}`} className="change-card__tutor">
                {request.tutor_name}
              </Link>
              <span className="stage-badge">{KIND_LABELS[request.kind]}</span>
              <span className="change-card__age">{ageLabel(request.created_at)}</span>
            </header>
            <ChangeRequestReview request={request} onReviewed={handleReviewed} />
          </article>
        ))}
      </section>
    </div>
  )
}
