import { AlarmClock, ArrowUpRight, CalendarClock, Clock, NotebookPen, Timer } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { sessionsApi, tutorsApi } from '../../lib/api'
import { toDateOnlyString } from '../../lib/dateWindow'
import { formatShortDay, statusLabel, statusTone, timeLeft } from '../../lib/sessions'
import { SessionPanel } from '../timetable/SessionPanel'

// The countdowns move on their own; the list itself only reloads after a log.
const TICK_MS = 30 * 1000

function StatCard({ to, label, icon: Icon, value }) {
  return (
    <Link to={to} className="dashboard-card">
      <span className="dashboard-card__top">
        <span className="dashboard-card__icon">
          <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <ArrowUpRight className="dashboard-card__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="dashboard-card__count">{value}</span>
      <span className="dashboard-card__label">{label}</span>
    </Link>
  )
}

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(timer)
  }, [])
  return now
}

/**
 * A tutor's day: today's sessions with what is planned for each, and every
 * session still waiting to be logged with a countdown to its 24 hour
 * deadline. Logging opens the session panel right here.
 */
export function TutorDashboard() {
  const { user } = useAuth()
  const tutorId = user?.tutor_profile?.id ?? null
  const now = useClock()
  const today = toDateOnlyString(now)
  const [sessions, setSessions] = useState(null)
  const [failed, setFailed] = useState(false)
  const [hours, setHours] = useState(null)
  const [openId, setOpenId] = useState(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    const start = new Date()
    const yesterday = toDateOnlyString(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1))
    // The log window is 24 hours, so yesterday's and today's sessions are
    // the only ones that can still be unlogged.
    sessionsApi
      .list({ from: yesterday, to: toDateOnlyString(start) })
      .then((res) => {
        if (!cancelled) {
          setSessions(res)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  const refresh = useCallback(() => setReload((n) => n + 1), [])

  useEffect(() => {
    if (!tutorId) return undefined
    let cancelled = false
    tutorsApi
      .getHours(tutorId)
      .then((res) => {
        if (!cancelled) setHours(res)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [tutorId, reload])

  const todays = (sessions ?? []).filter((s) => s.date === today)
  const unlogged = (sessions ?? []).filter((s) => s.display_status === 'UNLOGGED')
  const pending = sessions ? null : failed ? '—' : '···'

  return (
    <div className="page">
      <div className="dashboard-grid">
        <StatCard to="/timetable" label="Sessions today" icon={CalendarClock} value={pending ?? todays.length} />
        <StatCard to="/" label="Waiting to be logged" icon={NotebookPen} value={pending ?? unlogged.length} />
        <StatCard to="/me" label="Hours held this month" icon={Clock} value={hours ? `${Number(hours.hours)} h` : '···'} />
      </div>

      <section className="recent-enrollments" aria-label="Waiting to be logged">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <AlarmClock size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Unlogged</h2>
          </div>
          <span className="recent-enrollments__date">Log each within 24 hours of its end</span>
        </div>
        {failed && <p className="recent-enrollments__status">Could not load your sessions.</p>}
        {sessions && unlogged.length === 0 && <p className="recent-enrollments__status">All caught up.</p>}
        {unlogged.length > 0 && (
          <ul className="session-list">
            {unlogged.map((session) => {
              const left = timeLeft(session.log_deadline, now)
              return (
                <li key={session.id} className="session-row">
                  <span className="session-row__time">
                    {session.date === today ? 'Today' : formatShortDay(session.date)}
                    <br />
                    {session.start_time}–{session.end_time}
                  </span>
                  <span className="session-row__body">
                    <span className="session-row__title">{session.subject.display_name}</span>
                    <span className="session-row__sub">{session.student.name}</span>
                  </span>
                  <span className="session-row__end">
                    <span className={`countdown${left.urgent ? ' countdown--urgent' : ''}`}>
                      <Timer size={13} strokeWidth={2} aria-hidden="true" />
                      {left.label}
                    </span>
                    <button
                      type="button"
                      className="button--compact"
                      aria-label={`Log ${session.subject.display_name} with ${session.student.name}`}
                      onClick={() => setOpenId(session.id)}
                    >
                      Log
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="recent-enrollments" aria-label="Today">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Today</h2>
          </div>
          <Link to="/timetable" className="recent-enrollments__date">
            My timetable
          </Link>
        </div>
        {!sessions && !failed && <p className="recent-enrollments__status">Loading…</p>}
        {sessions && todays.length === 0 && <p className="recent-enrollments__status">No sessions today.</p>}
        {todays.length > 0 && (
          <ul className="session-list">
            {todays.map((session) => (
              <li key={session.id}>
                <button type="button" className="session-row button--ghost" onClick={() => setOpenId(session.id)}>
                  <span className="session-row__time">
                    {session.start_time}–{session.end_time}
                  </span>
                  <span className="session-row__body">
                    <span className="session-row__title">
                      {session.subject.display_name} · {session.student.name}
                    </span>
                    <span className="session-row__sub">
                      {session.planned_topic_names.length > 0
                        ? `Plan: ${session.planned_topic_names.join(', ')}`
                        : 'No topics planned yet'}
                    </span>
                  </span>
                  <span className="session-row__end">
                    <span className={`status-pill status-pill--${statusTone(session.display_status)}`}>
                      {statusLabel(session.display_status)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {openId && <SessionPanel key={openId} sessionId={openId} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  )
}
