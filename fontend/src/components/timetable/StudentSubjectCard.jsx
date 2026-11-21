import { CalendarCheck, CalendarClock, Flag, Laptop, UserCog, Users } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { studentSubjectsApi } from '../../lib/api'
import { toDateOnlyString } from '../../lib/dateWindow'
import {
  errorText,
  formatDate,
  MODE_LABELS,
  progressPercent,
  progressText,
  scheduleLabel,
  STUDENT_SUBJECT_STATUS_LABELS,
} from '../../lib/sessions'
import { useToast } from '../toast/useToast'
import { DatePickerField } from '../ui/DatePickerField'

const END_REASON = {
  SESSIONS_USED: 'All planned sessions have been held.',
  TOPICS_COVERED: 'All of the student’s topics have been covered.',
}

/**
 * When a student subject has used its sessions or covered every topic,
 * admin confirms the last session date (which frees the tutor's time after
 * it) or adds more sessions.
 */
function EndPrompt({ ss, onChanged }) {
  const id = useId()
  const { showToast } = useToast()
  const [lastDate, setLastDate] = useState(ss.progress.expected_end_date ?? toDateOnlyString(new Date()))
  const [count, setCount] = useState(4)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function run(kind, action) {
    setBusy(kind)
    setError(null)
    try {
      const updated = await action()
      showToast(kind === 'end' ? 'Last session confirmed' : 'Sessions added')
      onChanged(updated)
    } catch (err) {
      setError(errorText(err, 'Could not save that.'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="ss-card__prompt" role="region" aria-label="Confirm the end or add sessions">
      <strong>
        <Flag size={14} strokeWidth={2} aria-hidden="true" /> {END_REASON[ss.progress.end_reason] ?? 'Time to decide.'}
      </strong>
      <span>Confirm the last session date, or add more sessions.</span>
      <div className="ss-card__prompt-row">
        <div className="field">
          <label htmlFor={`${id}-last`}>Last session</label>
          <DatePickerField id={`${id}-last`} value={lastDate} onChange={setLastDate} />
        </div>
        <button
          type="button"
          className="button--compact"
          disabled={busy !== null || !lastDate}
          onClick={() => run('end', () => studentSubjectsApi.confirmEnd(ss.id, lastDate))}
        >
          {busy === 'end' ? 'Confirming…' : 'Confirm last session'}
        </button>
      </div>
      <div className="ss-card__prompt-row">
        <div className="field">
          <label htmlFor={`${id}-count`}>Sessions to add</label>
          <input
            id={`${id}-count`}
            type="number"
            min="1"
            max="200"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="button button--secondary button--compact"
          disabled={busy !== null || !(count >= 1)}
          onClick={() => run('add', () => studentSubjectsApi.addSessions(ss.id, count))}
        >
          {busy === 'add' ? 'Adding…' : 'Add sessions'}
        </button>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * One student subject: tutor, weekly schedule, progress ("18 of 24
 * sessions, 9 of 12 topics"), expected end date, and - for staff, when due
 * - the end-confirmation prompt. `showStudent` for lists across students.
 */
export function StudentSubjectCard({ ss, onChanged, showStudent = false, canManage = false }) {
  const { progress } = ss
  const ended = ss.status !== 'ACTIVE'
  const title = showStudent ? `${ss.student.name}: ${ss.subject.display_name}` : ss.subject.display_name

  return (
    <article className="ss-card" aria-label={title}>
      <div className="ss-card__head">
        <h3 className="ss-card__title">{title}</h3>
        <span className={`stage-badge enrollment-status-badge enrollment-status-badge--${ended ? 'inactive' : 'active'}`}>
          {STUDENT_SUBJECT_STATUS_LABELS[ss.status]}
        </span>
      </div>
      <div className="ss-card__meta">
        <span>
          <UserCog size={14} strokeWidth={1.75} aria-hidden="true" />
          {ss.tutor.name}
        </span>
        <span>
          <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
          {scheduleLabel(ss.slots)}
        </span>
        <span>
          {ss.mode === 'ONLINE' ? (
            <Laptop size={14} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Users size={14} strokeWidth={1.75} aria-hidden="true" />
          )}
          {MODE_LABELS[ss.mode]}
        </span>
      </div>

      <div className="ss-progress">
        <div className="ss-progress__text">
          <span>{progressText(progress)}</span>
          <span>
            <CalendarCheck size={14} strokeWidth={1.75} aria-hidden="true" />{' '}
            {ss.confirmed_end_date ? 'Last session' : 'Expected end'}:{' '}
            {formatDate(progress.expected_end_date, 'Not known yet')}
          </span>
        </div>
        <div
          className="ss-progress__bar"
          role="progressbar"
          aria-label="Sessions held"
          aria-valuemin={0}
          aria-valuemax={progress.planned}
          aria-valuenow={progress.held}
        >
          <div className="ss-progress__fill" style={{ width: `${progressPercent(progress)}%` }} />
        </div>
        {(progress.not_held > 0 || progress.unlogged > 0) && (
          <span className="form-note">
            {progress.not_held > 0 && `${progress.not_held} not held`}
            {progress.not_held > 0 && progress.unlogged > 0 && ' · '}
            {progress.unlogged > 0 && `${progress.unlogged} waiting to be logged`}
          </span>
        )}
      </div>

      {canManage && progress.needs_end_confirmation && <EndPrompt ss={ss} onChanged={onChanged} />}

      {canManage && (
        <div className="session-section__actions">
          <Link className="button button--secondary button--compact" to={`/timetable?student=${ss.student.id}&subject=${ss.subject.id}`}>
            View sessions
          </Link>
        </div>
      )}
    </article>
  )
}
