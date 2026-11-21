import { BookOpen, CalendarClock, CalendarX2, CheckCircle2, History, MoveRight, NotebookPen, XCircle } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { sessionChangeRequestsApi, sessionsApi } from '../../lib/api'
import { ApiError } from '../../lib/apiClient'
import {
  bookingConflict,
  CHANGE_STATUS_LABELS,
  errorText,
  formatDate,
  formatShortDay,
  isOwnSession,
  isUpcoming,
  MODE_LABELS,
  needsAdminNote,
  statusLabel,
} from '../../lib/sessions'
import { useToast } from '../toast/useToast'
import { DatePickerField } from '../ui/DatePickerField'
import { Dialog } from '../ui/Dialog'
import { ConflictNotice } from './ConflictNotice'
import { StatusPill } from './StatusPill'
import { TopicChecklist } from './TopicChecklist'

const ACTION_LABELS = { LOG: 'Logged', CORRECT: 'Corrected', MOVE: 'Moved', CANCEL: 'Cancelled' }

function when(session) {
  return `${formatShortDay(session.date)} ${session.start_time}–${session.end_time}`
}

// -- Log (Held / Not held) ----------------------------------------------------

function LogSection({ session, onDone }) {
  const id = useId()
  const { user, isStaffLevel } = useAuth()
  const { showToast } = useToast()
  const logged = session.status === 'HELD' || session.status === 'NOT_HELD'
  const [held, setHeld] = useState(logged ? session.status === 'HELD' : null)
  const [reason, setReason] = useState(session.not_held_reason || '')
  // Pre-ticked from the plan when logging; from what was ticked when correcting.
  const [topicIds, setTopicIds] = useState(logged ? session.topics_covered : session.planned_topics)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  // A logged session's correction form stays folded until asked for.
  const [open, setOpen] = useState(!logged)
  const noteNeeded = needsAdminNote(session, user, isStaffLevel)

  if (!open) {
    return (
      <section className="session-section" aria-label="Correct the log">
        <div className="session-section__actions">
          <button type="button" className="button button--secondary button--compact" onClick={() => setOpen(true)}>
            <NotebookPen size={14} strokeWidth={2} aria-hidden="true" /> Correct the log
          </button>
        </div>
      </section>
    )
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const updated = await sessionsApi.log(session.id, {
        held,
        reason: held ? '' : reason,
        topic_ids: held ? topicIds : [],
        admin_note: noteNeeded ? note : '',
      })
      showToast(held ? 'Logged as held' : 'Logged as not held')
      onDone(updated)
    } catch (err) {
      setError(errorText(err, 'Could not log this session.'))
      setBusy(false)
    }
  }

  return (
    <form className="session-section" onSubmit={submit} aria-label={logged ? 'Correct the log' : 'Log this session'}>
      <h3>
        <NotebookPen size={16} strokeWidth={1.75} aria-hidden="true" />
        {logged ? 'Correct the log' : 'Log this session'}
      </h3>
      <div className="period-toggle" role="group" aria-label="Did the session happen?">
        <button
          type="button"
          className={`period-toggle__option${held === true ? ' period-toggle__option--active' : ''}`}
          aria-pressed={held === true}
          onClick={() => setHeld(true)}
          disabled={busy}
        >
          <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" /> Held
        </button>
        <button
          type="button"
          className={`period-toggle__option${held === false ? ' period-toggle__option--active' : ''}`}
          aria-pressed={held === false}
          onClick={() => setHeld(false)}
          disabled={busy}
        >
          <XCircle size={14} strokeWidth={2} aria-hidden="true" /> Not held
        </button>
      </div>

      {held === true && (
        <div className="field">
          <span className="topic-picker__toolbar">Topics covered (optional)</span>
          <TopicChecklist topics={session.topics} selected={topicIds} onChange={setTopicIds} disabled={busy} label="Topics covered" />
        </div>
      )}
      {held === false && (
        <div className="field field--required">
          <label htmlFor={`${id}-reason`}>Why did it not happen?</label>
          <textarea id={`${id}-reason`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
        </div>
      )}
      {held !== null && noteNeeded && (
        <div className="field field--required">
          <label htmlFor={`${id}-note`}>Admin note (recorded in the history)</label>
          <textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {held !== null && (
        <div className="session-section__actions">
          <button
            type="submit"
            disabled={busy || (held === false && !reason.trim()) || (noteNeeded && !note.trim())}
          >
            {busy ? 'Saving…' : held ? 'Save as held' : 'Save as not held'}
          </button>
        </div>
      )}
    </form>
  )
}

// -- Plan topics -----------------------------------------------------------------

function PlanSection({ session, onDone }) {
  const { showToast } = useToast()
  const [topicIds, setTopicIds] = useState(session.planned_topics)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const changed =
    topicIds.length !== session.planned_topics.length || topicIds.some((t) => !session.planned_topics.includes(t))

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const updated = await sessionsApi.plan(session.id, topicIds)
      showToast('Plan saved')
      onDone(updated)
    } catch (err) {
      setError(errorText(err, 'Could not save the plan.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="session-section" aria-label="Plan">
      <h3>
        <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
        Plan: topics to cover
      </h3>
      <TopicChecklist topics={session.topics} selected={topicIds} onChange={setTopicIds} disabled={busy} label="Planned topics" />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {changed && (
        <div className="session-section__actions">
          <button type="button" className="button--compact" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      )}
    </section>
  )
}

// -- Move / cancel (staff directly, tutor by request) ------------------------------

function NewTimeFields({ idBase, value, onChange, disabled }) {
  return (
    <div className="session-times">
      <div className="field">
        <label htmlFor={`${idBase}-date`}>New date</label>
        <DatePickerField id={`${idBase}-date`} value={value.date} onChange={(date) => onChange({ ...value, date })} />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-start`}>Start</label>
        <input
          id={`${idBase}-start`}
          type="time"
          step="300"
          required
          value={value.start}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idBase}-end`}>End</label>
        <input
          id={`${idBase}-end`}
          type="time"
          step="300"
          required
          value={value.end}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
        />
      </div>
    </div>
  )
}

/**
 * kind 'MOVE' or 'CANCEL'. As staff it changes the session straight away
 * (with clash warnings and Book anyway); as the tutor it sends a request.
 */
function ChangeForm({ session, kind, asStaff, onDone, onBack }) {
  const idBase = useId()
  const { showToast } = useToast()
  const [time, setTime] = useState({ date: session.date, start: session.start_time, end: session.end_time })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [conflict, setConflict] = useState(null)
  const move = kind === 'MOVE'

  async function send(allowClash = false) {
    setBusy(true)
    setError(null)
    try {
      const payload = { new_date: time.date, new_start_time: time.start, new_end_time: time.end, reason }
      let updated
      if (asStaff) {
        updated = move ? await sessionsApi.move(session.id, payload, allowClash) : await sessionsApi.cancel(session.id, reason)
        showToast(move ? 'Session moved' : 'Session cancelled')
      } else {
        updated = await sessionsApi.requestChange(session.id, move ? { kind, ...payload } : { kind, reason })
        showToast('Request sent for approval')
      }
      setConflict(null)
      onDone(updated)
    } catch (err) {
      const found = bookingConflict(err)
      if (found) setConflict(found)
      else setError(errorText(err, 'Could not save this change.'))
      setBusy(false)
    }
  }

  const title = asStaff ? (move ? 'Move this session' : 'Cancel this session') : move ? 'Ask to move' : 'Ask to cancel'
  return (
    <form
      className="session-section"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault()
        send(false)
      }}
    >
      <h3>
        {move ? <MoveRight size={16} strokeWidth={1.75} aria-hidden="true" /> : <CalendarX2 size={16} strokeWidth={1.75} aria-hidden="true" />}
        {title}
      </h3>
      {!asStaff && <p className="form-note">Nothing changes until admin approves.</p>}
      {move && <NewTimeFields idBase={idBase} value={time} onChange={setTime} disabled={busy} />}
      <div className="field field--required">
        <label htmlFor={`${idBase}-reason`}>Reason</label>
        <textarea id={`${idBase}-reason`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {conflict && (
        <ConflictNotice conflict={conflict} busy={busy} onCancel={() => setConflict(null)} onOverride={() => send(true)} />
      )}
      {!conflict && (
        <div className="session-section__actions">
          <button type="button" className="button button--secondary" onClick={onBack} disabled={busy}>
            Back
          </button>
          <button type="submit" className={move ? undefined : 'button button--danger'} disabled={busy || !reason.trim() || (move && !time.date)}>
            {busy ? 'Saving…' : asStaff ? (move ? 'Move session' : 'Cancel session') : 'Send request'}
          </button>
        </div>
      )}
    </form>
  )
}

// -- Requests and history ----------------------------------------------------------

function RequestNote({ session, canWithdraw, onWithdrawn }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const pending = session.pending_request
  const latest = session.latest_request

  if (pending) {
    const what =
      pending.kind === 'MOVE'
        ? `move to ${formatShortDay(pending.new_date)} ${pending.new_start_time}–${pending.new_end_time}`
        : 'cancel'
    return (
      <div className="session-note session-note--pending">
        <p>
          <strong>Waiting for approval:</strong> {what}. {pending.reason}
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {canWithdraw && (
          <button
            type="button"
            className="button button--secondary button--compact"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await sessionChangeRequestsApi.withdraw(pending.id)
                onWithdrawn()
              } catch (err) {
                setError(errorText(err, 'Could not withdraw the request.'))
                setBusy(false)
              }
            }}
          >
            {busy ? 'Withdrawing…' : 'Withdraw request'}
          </button>
        )}
      </div>
    )
  }
  if (latest?.status === 'REJECTED') {
    return (
      <p className="session-note session-note--rejected">
        <strong>Your request to {latest.kind === 'MOVE' ? 'move' : 'cancel'} this session was not approved.</strong>{' '}
        Reason: {latest.reject_reason}
      </p>
    )
  }
  return null
}

function HistorySection({ session }) {
  const entries = [
    ...session.events.map((e) => ({
      key: `e${e.id}`,
      at: e.created_at,
      text: `${ACTION_LABELS[e.action] ?? e.action}: ${statusLabel(e.from_status)} to ${statusLabel(e.to_status)}${e.actor_name ? ` by ${e.actor_name}` : ''}`,
      note: e.note,
    })),
    ...session.change_requests.map((r) => ({
      key: `r${r.id}`,
      at: r.created_at,
      text: `${r.requested_by_name ?? 'Tutor'} asked to ${r.kind === 'MOVE' ? 'move' : 'cancel'} (${CHANGE_STATUS_LABELS[r.status]})`,
      note: r.reject_reason ? `Reason given: ${r.reject_reason}` : r.reason,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  if (entries.length === 0) return null
  return (
    <section className="session-section" aria-label="History">
      <h3>
        <History size={16} strokeWidth={1.75} aria-hidden="true" />
        History
      </h3>
      <ol className="history-list">
        {entries.map((entry) => (
          <li key={entry.key} className="history-list__item">
            <span>{entry.text}</span>
            <span className="history-list__when">
              {new Date(entry.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {entry.note && <span className="history-list__note">{entry.note}</span>}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Everything about one session: details, log it, plan its topics, move or
 * cancel it (staff) or ask to (its tutor), and its history. Calls
 * onChanged() after anything is saved so the timetable behind refreshes.
 */
export function SessionPanel({ sessionId, onClose, onChanged }) {
  const { user, isStaffLevel } = useAuth()
  const [currentId, setCurrentId] = useState(sessionId)
  const [session, setSession] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null) // 'MOVE' | 'CANCEL' | null
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    sessionsApi
      .get(currentId)
      .then((res) => {
        if (!cancelled) setSession(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? 'This session no longer exists.' : 'Could not load this session.')
      })
    return () => {
      cancelled = true
    }
  }, [currentId, reloadKey])

  function handleDone(updated) {
    setMode(null)
    if (updated.id !== currentId) setCurrentId(updated.id)
    setSession(updated)
    onChanged?.()
  }

  if (!session) {
    return (
      <Dialog title="Session" icon={CalendarClock} onClose={onClose}>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="form-note">Loading…</p>
        )}
      </Dialog>
    )
  }

  const own = isOwnSession(session, user)
  const scheduled = session.status === 'SCHEDULED'
  // Planning is for what's ahead; a past session is logged, not planned.
  const canPlan = scheduled && isUpcoming(session) && (isStaffLevel || own)
  const tutorCanAsk = !isStaffLevel && own && scheduled && isUpcoming(session) && !session.pending_request

  return (
    <Dialog
      title={session.subject.display_name}
      subtitle={`${session.student.name} · ${when(session)}`}
      icon={CalendarClock}
      onClose={onClose}
    >
      <dl className="session-facts">
        <dt>Status</dt>
        <dd>
          <StatusPill status={session.display_status} />
        </dd>
        <dt>Date</dt>
        <dd>
          {formatDate(session.date)}, {session.start_time}–{session.end_time}
        </dd>
        <dt>Tutor</dt>
        <dd>{session.tutor.name}</dd>
        <dt>Mode</dt>
        <dd>{MODE_LABELS[session.mode] ?? session.mode}</dd>
        {session.moved_from_detail && (
          <>
            <dt>Moved from</dt>
            <dd>{when(session.moved_from_detail)}</dd>
          </>
        )}
        {session.moved_to && (
          <>
            <dt>Moved to</dt>
            <dd>
              <button type="button" className="button--ghost button--compact" onClick={() => setCurrentId(session.moved_to.id)}>
                {when(session.moved_to)}
              </button>
            </dd>
          </>
        )}
        {session.logged_by_name && (
          <>
            <dt>Logged by</dt>
            <dd>{session.logged_by_name}</dd>
          </>
        )}
        {session.not_held_reason && (
          <>
            <dt>Reason</dt>
            <dd>{session.not_held_reason}</dd>
          </>
        )}
        {session.admin_note && (
          <>
            <dt>Admin note</dt>
            <dd>{session.admin_note}</dd>
          </>
        )}
      </dl>

      {session.display_status === 'MISSED' && !isStaffLevel && (
        <p className="session-note session-note--rejected">
          The logging window closed 24 hours after the session. Ask admin to log it.
        </p>
      )}

      <RequestNote session={session} canWithdraw={own && !isStaffLevel} onWithdrawn={() => setReloadKey((k) => k + 1)} />

      {mode ? (
        <ChangeForm session={session} kind={mode} asStaff={isStaffLevel} onDone={handleDone} onBack={() => setMode(null)} />
      ) : (
        <>
          {session.can_log && <LogSection key={`log-${session.id}-${session.status}`} session={session} onDone={handleDone} />}
          {canPlan && <PlanSection key={`plan-${session.id}`} session={session} onDone={handleDone} />}
          {isStaffLevel && scheduled && (
            <section className="session-section" aria-label="Change">
              <div className="session-section__actions">
                <button type="button" className="button button--secondary button--compact" onClick={() => setMode('MOVE')}>
                  <MoveRight size={14} strokeWidth={2} aria-hidden="true" /> Move
                </button>
                <button type="button" className="button button--secondary button--compact" onClick={() => setMode('CANCEL')}>
                  <CalendarX2 size={14} strokeWidth={2} aria-hidden="true" /> Cancel session
                </button>
              </div>
            </section>
          )}
          {tutorCanAsk && (
            <section className="session-section" aria-label="Change">
              <div className="session-section__actions">
                <button type="button" className="button button--secondary button--compact" onClick={() => setMode('MOVE')}>
                  <MoveRight size={14} strokeWidth={2} aria-hidden="true" /> Ask to move
                </button>
                <button type="button" className="button button--secondary button--compact" onClick={() => setMode('CANCEL')}>
                  <CalendarX2 size={14} strokeWidth={2} aria-hidden="true" /> Ask to cancel
                </button>
              </div>
            </section>
          )}
        </>
      )}

      <HistorySection session={session} />
    </Dialog>
  )
}
