import { AlertTriangle, CalendarClock, Clock, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FieldErrors, NonFieldErrors } from '../FieldErrors'
import { formatDuration, fromMinutes, timeOptions, WEEKDAYS } from '../../lib/timetableGrid'

const TIME_OPTIONS = timeOptions()

/**
 * Add or edit one subject's weekly session. `mode` is 'add' (pick any
 * unscheduled subject), 'edit' (the subject is fixed, and it can be
 * removed from the timetable), or 'plan' (a Tutor: the session's time is
 * read-only, only its lesson plan - passed as `children` - is editable).
 * In 'edit' mode `children` (the lesson plan) renders under the time
 * fields. `findClashes(subjectId, day, start, end)`
 * returns the other sessions this one would double-book the tutor with,
 * shown live as a warning - it doesn't block saving.
 */
export function SessionDialog({
  mode,
  subject,
  choices = [],
  initial,
  findClashes,
  onSave,
  onRemove,
  onClose,
  summary,
  children,
}) {
  const titleId = useId()
  const firstFieldRef = useRef(null)
  const [subjectId, setSubjectId] = useState(subject?.id ?? choices[0]?.id ?? '')
  const [day, setDay] = useState(initial.day)
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const [errors, setErrors] = useState(null)
  const [busy, setBusy] = useState(null)

  // Latest onClose in a ref, so the Escape listener below is attached once
  // instead of re-subscribing (and the focus effect re-running) every time
  // the parent re-renders with a fresh callback.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    // Focus the first control on open, and hand focus back to whatever
    // opened the dialog (a session block, a Schedule button) on close.
    const opener = document.activeElement
    firstFieldRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  const endOptions = TIME_OPTIONS.filter((m) => m > start)
  const selectedName = subject?.name ?? choices.find((c) => c.id === Number(subjectId))?.name
  const clashes = subjectId ? findClashes(Number(subjectId), day, start, end) : []
  const nothingToAdd = mode === 'add' && choices.length === 0

  function handleStartChange(value) {
    const next = Number(value)
    // Keep the session's length when the start moves, as long as it still
    // fits in the day; otherwise fall back to the nearest valid end.
    const duration = end - start
    setStart(next)
    setEnd(TIME_OPTIONS.includes(next + duration) ? next + duration : TIME_OPTIONS.find((m) => m > next))
  }

  async function run(kind, action) {
    setErrors(null)
    setBusy(kind)
    try {
      await action()
    } catch (err) {
      setErrors(err?.data && typeof err.data === 'object' ? err.data : { detail: err?.message || 'Something went wrong.' })
      setBusy(null)
    }
  }

  return (
    <div className="tt-dialog__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tt-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="tt-dialog__header">
          <span className="icon-badge">
            <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h2 id={titleId}>{mode === 'add' ? 'Schedule a subject' : subject.name}</h2>
          <button type="button" className="icon-button tt-dialog__close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {mode === 'plan' ? (
          <div className="tt-dialog__body">
            {summary && <p className="tt-dialog__summary">{summary}</p>}
            {children}
            <div className="form-actions">
              <button type="button" onClick={onClose} ref={firstFieldRef}>
                Done
              </button>
            </div>
          </div>
        ) : nothingToAdd ? (
          <div className="tt-dialog__body">
            <p className="form-note">Every subject is already on the timetable.</p>
            <div className="form-actions">
              <button type="button" className="button button--secondary" onClick={onClose}>
                Close
              </button>
              <Link className="button" to="/subjects/new">
                Add a subject
              </Link>
            </div>
          </div>
        ) : (
          <form
            className="tt-dialog__body"
            onSubmit={(event) => {
              event.preventDefault()
              run('save', () => onSave(Number(subjectId), day, start, end))
            }}
          >
            <NonFieldErrors errors={errors} />

            {mode === 'add' && (
              <div className="field">
                <label htmlFor={`${titleId}-subject`}>Subject</label>
                <select
                  id={`${titleId}-subject`}
                  ref={firstFieldRef}
                  value={subjectId}
                  onChange={(e) => setSubjectId(e.target.value)}
                >
                  {choices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.tutor_name ? ` · ${c.tutor_name}` : ''}
                      {c.is_active === false ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <fieldset className="tt-dialog__days">
              <legend>Day</legend>
              <div className="tt-day-picker">
                {WEEKDAYS.map((option) => (
                  <label
                    key={option.day}
                    className={`tt-day-picker__option${option.day === day ? ' tt-day-picker__option--selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name={`${titleId}-day`}
                      value={option.day}
                      checked={option.day === day}
                      onChange={() => setDay(option.day)}
                      ref={mode === 'edit' && option.day === day ? firstFieldRef : undefined}
                    />
                    <span aria-hidden="true">{option.short}</span>
                    <span className="visually-hidden">{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="tt-dialog__times">
              <div className="field">
                <label htmlFor={`${titleId}-start`}>Starts</label>
                <select id={`${titleId}-start`} value={start} onChange={(e) => handleStartChange(e.target.value)}>
                  {TIME_OPTIONS.slice(0, -1).map((m) => (
                    <option key={m} value={m}>
                      {fromMinutes(m)}
                    </option>
                  ))}
                </select>
              </div>
              <span className="tt-dialog__to" aria-hidden="true">
                –
              </span>
              <div className="field">
                <label htmlFor={`${titleId}-end`}>Ends</label>
                <select id={`${titleId}-end`} value={end} onChange={(e) => setEnd(Number(e.target.value))}>
                  {endOptions.map((m) => (
                    <option key={m} value={m}>
                      {fromMinutes(m)}
                    </option>
                  ))}
                </select>
              </div>
              <span className="tt-dialog__duration">
                <Clock size={13} strokeWidth={1.75} aria-hidden="true" />
                {formatDuration(end - start)}
              </span>
            </div>
            <NonFieldErrors errors={errors?.timetable_slot} />
            <FieldErrors errors={errors?.timetable_slot} field="day_of_week" />
            <FieldErrors errors={errors?.timetable_slot} field="start_time" />
            <FieldErrors errors={errors?.timetable_slot} field="end_time" />

            {clashes.length > 0 && (
              <p className="tt-dialog__clash" role="status">
                <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" />
                {clashes[0].subject.tutor_name} is already teaching{' '}
                {clashes.map((c) => c.subject.name).join(', ')} at this time.
              </p>
            )}

            {mode === 'edit' && children}

            <div className="form-actions">
              {mode === 'edit' && (
                <button
                  type="button"
                  className="button button--danger form-actions__leading"
                  disabled={busy !== null}
                  onClick={() => run('remove', () => onRemove(subject))}
                >
                  {busy === 'remove' ? 'Removing…' : 'Remove from timetable'}
                </button>
              )}
              <button type="button" className="button button--secondary" onClick={onClose} disabled={busy !== null}>
                Cancel
              </button>
              <button type="submit" disabled={busy !== null || !subjectId}>
                {busy === 'save' ? 'Saving…' : mode === 'edit' ? 'Save changes' : `Add ${selectedName ?? 'session'}`}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
