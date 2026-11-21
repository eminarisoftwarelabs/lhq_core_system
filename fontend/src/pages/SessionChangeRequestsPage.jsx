import { ArrowRight, Check, ClipboardCheck, X } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConflictNotice } from '../components/timetable/ConflictNotice'
import { useToast } from '../components/toast/useToast'
import { sessionChangeRequestsApi } from '../lib/api'
import { bookingConflict, errorText, formatShortDay } from '../lib/sessions'
import { formatStageAge } from '../lib/stageAge'
import { usePageTitle } from '../lib/usePageTitle'

function ageLabel(createdAt) {
  const age = formatStageAge(new Date(createdAt))
  return age === 'Just now' ? age : `${age} ago`
}

function TimeCompare({ request }) {
  const current = `${formatShortDay(request.current.date)}, ${request.current.start_time}–${request.current.end_time}`
  const requested =
    request.kind === 'MOVE'
      ? `${formatShortDay(request.new_date)}, ${request.new_start_time}–${request.new_end_time}`
      : 'Cancelled'
  return (
    <div className="time-compare">
      <div className="time-compare__side">
        <span className="time-compare__label">Now</span>
        <span>{current}</span>
      </div>
      <ArrowRight className="time-compare__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
      <div className="time-compare__side">
        <span className="time-compare__label">Requested</span>
        <span>{requested}</span>
      </div>
    </div>
  )
}

function RequestReview({ request, onReviewed }) {
  const id = useId()
  const { showToast } = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [conflict, setConflict] = useState(null)

  async function approve(allowClash = false) {
    setBusy(true)
    setError(null)
    try {
      const updated = await sessionChangeRequestsApi.approve(request.id, allowClash)
      showToast('Request approved')
      onReviewed(updated)
    } catch (err) {
      const found = bookingConflict(err)
      if (found) setConflict(found)
      else setError(errorText(err, 'Could not approve this request.'))
      setBusy(false)
    }
  }

  async function reject(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const updated = await sessionChangeRequestsApi.reject(request.id, reason)
      showToast('Request not approved')
      onReviewed(updated)
    } catch (err) {
      setError(errorText(err, 'Could not reject this request.'))
      setBusy(false)
    }
  }

  return (
    <div className="change-review">
      <TimeCompare request={request} />
      <p className="change-review__note">
        <span className="change-review__note-label">Reason from {request.tutor.name}:</span> {request.reason}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <ConflictNotice conflict={conflict} busy={busy} onCancel={() => setConflict(null)} onOverride={() => approve(true)} />
      )}
      {!conflict &&
        (rejecting ? (
          <form className="change-review__reject" onSubmit={reject}>
            <div className="field field--full">
              <label htmlFor={`${id}-reason`}>Reason (the tutor sees this)</label>
              <textarea id={`${id}-reason`} rows={2} value={reason} required onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="change-review__actions">
              <button type="button" className="button button--secondary button--compact" onClick={() => setRejecting(false)} disabled={busy}>
                Back
              </button>
              <button type="submit" className="button button--danger button--compact" disabled={busy || !reason.trim()}>
                {busy ? 'Rejecting…' : 'Reject request'}
              </button>
            </div>
          </form>
        ) : (
          <div className="change-review__actions">
            <button type="button" className="button button--secondary button--compact" disabled={busy} onClick={() => setRejecting(true)}>
              <X size={14} strokeWidth={2} aria-hidden="true" />
              Reject
            </button>
            <button type="button" className="button button--compact" disabled={busy} onClick={() => approve(false)}>
              <Check size={14} strokeWidth={2.25} aria-hidden="true" />
              {busy ? 'Approving…' : 'Approve'}
            </button>
          </div>
        ))}
    </div>
  )
}

/** Staff queue of tutors' pending session move and cancel requests. */
export function SessionChangeRequestsPage() {
  usePageTitle('Session requests')
  const [requests, setRequests] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    sessionChangeRequestsApi
      .list({ status: 'PENDING' })
      .then((res) => {
        if (!cancelled) setRequests(res)
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Could not load the requests.'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Session move and cancel requests</h2>
            {requests && <span className="onboarding-section__count">{requests.length}</span>}
          </div>
          <Link to="/timetable" className="button button--secondary button--compact">
            Back to timetable
          </Link>
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
          <article
            key={request.id}
            className="change-card"
            aria-label={`${request.tutor.name}: ${request.kind === 'MOVE' ? 'move' : 'cancel'} ${request.subject.display_name}`}
          >
            <header className="change-card__header">
              <span className="change-card__tutor">{request.tutor.name}</span>
              <span className="stage-badge">{request.kind === 'MOVE' ? 'Move' : 'Cancel'}</span>
              <span className="form-note">
                {request.subject.display_name} · {request.student.name}
              </span>
              <span className="change-card__age">{ageLabel(request.created_at)}</span>
            </header>
            <RequestReview
              request={request}
              onReviewed={(updated) => setRequests((current) => current.filter((r) => r.id !== updated.id))}
            />
          </article>
        ))}
      </section>
    </div>
  )
}
