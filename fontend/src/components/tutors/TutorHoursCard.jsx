import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { useEffect, useState } from 'react'
import { tutorsApi } from '../../lib/api'
import { addMonths, errorText, formatMonth, formatMwk, monthKey } from '../../lib/sessions'

/**
 * A tutor's held sessions and hours for a month, and the estimated amount
 * at their hourly rate (an estimate: per-subject rates are not built).
 * Staff see it on the tutor's page; a tutor on their own profile.
 */
export function TutorHoursCard({ tutorId, title = 'Hours' }) {
  const [month, setMonth] = useState(() => monthKey(new Date()))
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    tutorsApi
      .getHours(tutorId, month)
      .then((res) => {
        if (!cancelled) {
          setData(res)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Could not load hours.'))
      })
    return () => {
      cancelled = true
    }
  }, [tutorId, month])

  const current = data?.month === month ? data : null
  const isThisMonth = month === monthKey(new Date())

  return (
    <section className="detail-section" aria-label={title}>
      <div className="detail-section__header">
        <span className="icon-badge">
          <Clock size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        {title}
        <span className="month-nav detail-section__action">
          <button type="button" className="icon-button" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}>
            <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <span>{formatMonth(month)}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next month"
            disabled={isThisMonth}
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!current && !error && <p className="form-note">Loading…</p>}
      {current && (
        <>
          <div className="tutor-hours">
            <div className="tutor-hours__stat">
              <span className="tutor-hours__value">{current.sessions_held}</span>
              <span className="tutor-hours__label">Sessions held</span>
            </div>
            <div className="tutor-hours__stat">
              <span className="tutor-hours__value">{Number(current.hours).toLocaleString('en-GB')} h</span>
              <span className="tutor-hours__label">Hours held</span>
            </div>
            <div className="tutor-hours__stat">
              <span className="tutor-hours__value">{formatMwk(current.estimated_amount) ?? '—'}</span>
              <span className="tutor-hours__label">
                {current.estimated_amount === null ? 'No hourly rate set' : 'Estimated amount'}
              </span>
            </div>
          </div>
          <p className="form-note">
            Estimate only: held hours at the tutor&apos;s hourly rate{current.hourly_rate ? ` (${formatMwk(current.hourly_rate)})` : ''}.
            Not held and missed sessions are not paid.
          </p>
        </>
      )}
    </section>
  )
}
