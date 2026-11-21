import { CalendarClock, ChevronDown, History } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sessionsApi } from '../../lib/api'
import { addDays, dateWindows, formatDate, isUpcoming } from '../../lib/sessions'
import { toDateOnlyString } from '../../lib/dateWindow'
import { StatusPill } from '../timetable/StatusPill'

const UPCOMING_SHOWN = 5

function SessionRow({ session }) {
  return (
    <li>
      <Link className="session-row session-row--link" to={`/timetable?session=${session.id}`}>
        <span className="session-row__time">
          {formatDate(session.date)}
          <br />
          {session.start_time}–{session.end_time}
        </span>
        <span className="session-row__body">
          <span className="session-row__title">{session.subject.display_name}</span>
          <span className="session-row__sub">{session.tutor.name}</span>
        </span>
        <span className="session-row__end">
          <StatusPill status={session.display_status} />
        </span>
      </Link>
    </li>
  )
}

const byStart = (a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`)

/** The next few sessions across all of a student's subjects. */
export function UpcomingSessions({ studentId }) {
  const [sessions, setSessions] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const now = new Date()
    sessionsApi
      .list({ student: studentId, from: toDateOnlyString(now), to: addDays(now, 61) })
      .then((rows) => {
        if (cancelled) return
        const next = rows
          .filter((s) => s.display_status === 'SCHEDULED' && isUpcoming(s, now))
          .sort(byStart)
          .slice(0, UPCOMING_SHOWN)
        setSessions(next)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [studentId])

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Upcoming sessions
      </div>
      {failed && (
        <p className="form-error" role="alert">
          Could not load upcoming sessions.
        </p>
      )}
      {!failed && !sessions && <p className="form-note">Loading…</p>}
      {sessions && sessions.length === 0 && <p className="form-note">No upcoming sessions.</p>}
      {sessions && sessions.length > 0 && <ul className="session-list">{sessions.map((s) => <SessionRow key={s.id} session={s} />)}</ul>}
    </div>
  )
}

/**
 * Past sessions with their status, newest first. Collapsed by default and
 * only fetched when opened: it reads back to the earliest subject start, in
 * windows of 62 days (the most the API serves at once).
 */
export function SessionHistory({ studentId, studentSubjects }) {
  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open || sessions || failed) return undefined
    let cancelled = false
    const now = new Date()
    const starts = studentSubjects.map((ss) => ss.start_date).sort()
    const windows = dateWindows(starts[0] ?? toDateOnlyString(now), toDateOnlyString(now))
    Promise.all(windows.map((w) => sessionsApi.list({ student: studentId, ...w })))
      .then((chunks) => {
        if (cancelled) return
        setSessions(chunks.flat().filter((s) => !isUpcoming(s, now)).sort((a, b) => byStart(b, a)))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, sessions, failed, studentId, studentSubjects])

  return (
    <div className="detail-section">
      <button
        type="button"
        className="detail-section__header detail-section__toggle"
        aria-expanded={open}
        aria-controls="student-session-history"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="icon-badge">
          <History size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Session history
        <ChevronDown size={16} strokeWidth={1.75} className="detail-section__chevron" aria-hidden="true" />
      </button>
      <div id="student-session-history" hidden={!open}>
        {failed && (
          <p className="form-error" role="alert">
            Could not load the session history.
          </p>
        )}
        {open && !failed && !sessions && <p className="form-note">Loading…</p>}
        {sessions && sessions.length === 0 && <p className="form-note">No past sessions yet.</p>}
        {sessions && sessions.length > 0 && <ul className="session-list">{sessions.map((s) => <SessionRow key={s.id} session={s} />)}</ul>}
      </div>
    </div>
  )
}
