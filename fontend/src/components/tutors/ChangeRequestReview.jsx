import { Check, X } from 'lucide-react'
import { useId, useState } from 'react'
import { changeRequestsApi } from '../../lib/api'
import { ApiError } from '../../lib/apiClient'
import { useToast } from '../toast/useToast'
import { ChangeRequestDiff } from './ChangeRequestDiff'

function errorText(err, fallback) {
  if (err instanceof ApiError && err.data) {
    const first = err.data.detail ?? err.data.reason ?? err.data.subjects ?? err.data.working_hours
    if (first) return [].concat(first).join(' ')
  }
  return fallback
}

/**
 * A pending change request as staff see it: current vs proposed, the
 * tutor's note, and Approve / Reject (with a reason). Calls
 * onReviewed(updatedRequest) once the server has accepted the decision.
 */
export function ChangeRequestReview({ request, onReviewed }) {
  const idBase = useId()
  const { showToast } = useToast()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function decide(action) {
    setBusy(true)
    setError(null)
    try {
      const updated =
        action === 'approve' ? await changeRequestsApi.approve(request.id) : await changeRequestsApi.reject(request.id, reason)
      showToast(action === 'approve' ? 'Change approved' : 'Change rejected')
      onReviewed(updated)
    } catch (err) {
      setError(errorText(err, action === 'approve' ? 'Could not approve this change.' : 'Could not reject this change.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="change-review">
      <ChangeRequestDiff kind={request.kind} current={request.current} proposed={request.proposed} />

      {request.note && (
        <p className="change-review__note">
          <span className="change-review__note-label">Note from {request.tutor_name}:</span> {request.note}
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {rejecting ? (
        <form
          className="change-review__reject"
          onSubmit={(e) => {
            e.preventDefault()
            decide('reject')
          }}
        >
          <div className="field field--full">
            <label htmlFor={`${idBase}-reason`}>Reason (the tutor sees this)</label>
            <textarea
              id={`${idBase}-reason`}
              rows={2}
              value={reason}
              required
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="change-review__actions">
            <button type="button" className="button button--secondary button--compact" onClick={() => setRejecting(false)}>
              Back
            </button>
            <button type="submit" className="button button--danger button--compact" disabled={busy || !reason.trim()}>
              {busy ? 'Rejecting…' : 'Reject change'}
            </button>
          </div>
        </form>
      ) : (
        <div className="change-review__actions">
          <button
            type="button"
            className="button button--secondary button--compact"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            <X size={14} strokeWidth={2} aria-hidden="true" />
            Reject
          </button>
          <button type="button" className="button button--compact" disabled={busy} onClick={() => decide('approve')}>
            <Check size={14} strokeWidth={2.25} aria-hidden="true" />
            {busy ? 'Approving…' : 'Approve'}
          </button>
        </div>
      )}
    </div>
  )
}
