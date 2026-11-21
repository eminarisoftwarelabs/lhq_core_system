import { AlertTriangle } from 'lucide-react'

/**
 * A booking conflict from the API (sessions.bookingConflict): each
 * clash or working-hours warning in plain words, with Cancel and - for
 * staff - Book anyway, which resends the same request with allow_clash.
 */
export function ConflictNotice({ conflict, busy = false, onCancel, onOverride }) {
  return (
    <div className="conflict-notice" role="alert">
      <p className="conflict-notice__title">
        <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
        {conflict.canOverride ? 'Check this booking' : 'This time is not free'}
      </p>
      <ul>
        {conflict.warnings.map((warning) => (
          <li key={warning.message}>{warning.message}</li>
        ))}
      </ul>
      {!conflict.canOverride && <p className="form-note">Pick another time.</p>}
      <div className="conflict-notice__actions">
        <button type="button" className="button button--secondary button--compact" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        {conflict.canOverride && (
          <button type="button" className="button button--danger button--compact" onClick={onOverride} disabled={busy}>
            {busy ? 'Booking…' : 'Book anyway'}
          </button>
        )}
      </div>
    </div>
  )
}
