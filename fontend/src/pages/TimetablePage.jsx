import { CalendarClock, ChevronLeft, ChevronRight, ClipboardCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { SessionPanel } from '../components/timetable/SessionPanel'
import { SessionWeekGrid } from '../components/timetable/SessionWeekGrid'
import { sessionChangeRequestsApi, sessionsApi, studentSubjectsApi, tutorsApi } from '../lib/api'
import { errorText, LEGEND, statusLabel, statusTone, toGridItems, weekEnd } from '../lib/sessions'
import { gridBounds, toMinutes, WEEKDAYS } from '../lib/timetableGrid'
import { usePageTitle } from '../lib/usePageTitle'
import { addWeeks, formatWeekRange, parseWeekParam, relativeWeekLabel, weekStartOf } from '../lib/weeks'

function todayIndexFor(week, now) {
  return week === weekStartOf(now) ? (now.getDay() + 6) % 7 : null
}

// Filter choices come from the active student subjects, so every option
// actually has sessions behind it.
function filterOptions(studentSubjects) {
  const byId = (items) => [...new Map(items.map((i) => [i.id, i])).values()].sort((a, b) => a.name.localeCompare(b.name))
  return {
    tutors: byId(studentSubjects.map((ss) => ss.tutor)),
    subjects: byId(studentSubjects.map((ss) => ({ id: ss.subject.id, name: ss.subject.display_name }))),
    students: byId(studentSubjects.map((ss) => ss.student)),
  }
}

/**
 * The timetable. Staff get the master timetable: every tutor's sessions,
 * filterable by tutor, subject and student, with the change-request queue
 * a click away. A tutor gets their own week with their free time shaded.
 * Either way a session opens in the session panel (?session=<id>).
 */
export function TimetablePage() {
  const { user, isStaffLevel } = useAuth()
  usePageTitle(isStaffLevel ? 'Timetable' : 'My Timetable')
  const [params, setParams] = useSearchParams()
  const now = useMemo(() => new Date(), [])
  const week = parseWeekParam(params.get('week')) ?? weekStartOf(now)
  const filters = { tutor: params.get('tutor') ?? '', subject: params.get('subject') ?? '', student: params.get('student') ?? '' }
  const openId = params.get('session') ? Number(params.get('session')) : null
  const tutorId = user?.tutor_profile?.id ?? null

  const [sessions, setSessions] = useState(null)
  const [error, setError] = useState(null)
  const [free, setFree] = useState(null)
  const [options, setOptions] = useState({ tutors: [], subjects: [], students: [] })
  const [pendingCount, setPendingCount] = useState(null)
  const [reload, setReload] = useState(0)
  const todayIndex = todayIndexFor(week, now)
  const [mobileDay, setMobileDay] = useState(todayIndex ?? 0)

  const setParam = useCallback(
    (changes) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '' || value === undefined) next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  useEffect(() => {
    let cancelled = false
    const query = { from: week, to: weekEnd(week) }
    if (isStaffLevel) Object.assign(query, filters)
    sessionsApi
      .list(query)
      .then((res) => {
        if (!cancelled) {
          setSessions(res)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Could not load the timetable.'))
      })
    return () => {
      cancelled = true
    }
    // filters is rebuilt each render; its fields are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, isStaffLevel, filters.tutor, filters.subject, filters.student, reload])

  // A tutor's free time this week (working hours minus booked sessions).
  useEffect(() => {
    if (isStaffLevel || !tutorId) return undefined
    let cancelled = false
    tutorsApi
      .getFreeSlots(tutorId, week)
      .then((res) => {
        if (!cancelled) setFree(res.days.map((d) => d.free))
      })
      .catch(() => {
        if (!cancelled) setFree(null)
      })
    return () => {
      cancelled = true
    }
  }, [isStaffLevel, tutorId, week, reload])

  useEffect(() => {
    if (!isStaffLevel) return undefined
    let cancelled = false
    studentSubjectsApi
      .list({ status: 'ACTIVE' })
      .then((res) => {
        if (!cancelled) setOptions(filterOptions(res))
      })
      .catch(() => {})
    sessionChangeRequestsApi
      .list({ status: 'PENDING' })
      .then((res) => {
        if (!cancelled) setPendingCount(res.length)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isStaffLevel, reload])

  const items = useMemo(() => toGridItems(sessions ?? [], week), [sessions, week])
  const freeItems = useMemo(
    () =>
      (free ?? []).flatMap((blocks, day) =>
        blocks.map((b) => ({ day, start: toMinutes(b.start_time), end: toMinutes(b.end_time) })),
      ),
    [free],
  )
  const bounds = gridBounds([...items, ...freeItems])
  const relative = relativeWeekLabel(week, now)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const unlogged = (sessions ?? []).filter((s) => s.display_status === 'UNLOGGED').length

  return (
    <div className="page page--timetable">
      <div className="tt-toolbar">
        <div className="tt-weekbar">
          <button
            type="button"
            className="icon-button"
            aria-label="Previous week"
            onClick={() => setParam({ week: addWeeks(week, -1), session: null })}
          >
            <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <div className="tt-weekbar__title">
            <span className="tt-weekbar__range">{formatWeekRange(week)}</span>
            {relative && <span className="tt-weekbar__relative">{relative}</span>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Next week"
            onClick={() => setParam({ week: addWeeks(week, 1), session: null })}
          >
            <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          {week !== weekStartOf(now) && (
            <button type="button" className="button button--secondary button--compact" onClick={() => setParam({ week: null })}>
              This week
            </button>
          )}
        </div>

        <div className="tt-toolbar__actions">
          {unlogged > 0 && (
            <span className="tt-stat tt-stat--warning">
              {unlogged} unlogged
            </span>
          )}
          {isStaffLevel && (
            <Link className="button button--secondary" to="/timetable/requests">
              <ClipboardCheck size={16} strokeWidth={1.75} aria-hidden="true" />
              Requests{pendingCount ? ` (${pendingCount})` : ''}
            </Link>
          )}
        </div>
      </div>

      {isStaffLevel && (
        <div className="tt-filters" role="group" aria-label="Filter the timetable">
          <select aria-label="Tutor" value={filters.tutor} onChange={(e) => setParam({ tutor: e.target.value })}>
            <option value="">All tutors</option>
            {options.tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select aria-label="Subject" value={filters.subject} onChange={(e) => setParam({ subject: e.target.value })}>
            <option value="">All subjects</option>
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select aria-label="Student" value={filters.student} onChange={(e) => setParam({ student: e.target.value })}>
            <option value="">All students</option>
            {options.students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <ul className="tt-legend" aria-label="Key">
        {LEGEND.map((status) => (
          <li key={status} className="tt-legend__item">
            <span className={`tt-legend__swatch tt-legend__swatch--${statusTone(status)}`} aria-hidden="true" />
            {statusLabel(status)}
          </li>
        ))}
        {!isStaffLevel && (
          <li className="tt-legend__item">
            <span className="tt-legend__swatch tt-legend__swatch--free" aria-hidden="true" />
            Free time
          </li>
        )}
      </ul>

      <div className="period-toggle tt-day-tabs" role="group" aria-label="Day">
        {WEEKDAYS.map(({ day, short }) => (
          <button
            key={short}
            type="button"
            className={`period-toggle__option${day === mobileDay ? ' period-toggle__option--active' : ''}`}
            aria-pressed={day === mobileDay}
            onClick={() => setMobileDay(day)}
          >
            {short}
          </button>
        ))}
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!sessions && !error && <p className="form-note">Loading…</p>}
      {sessions && (
        <>
          <SessionWeekGrid
            weekStart={week}
            items={items}
            bounds={bounds}
            free={isStaffLevel ? null : free}
            showTutor={isStaffLevel}
            todayIndex={todayIndex}
            nowMinutes={nowMinutes}
            mobileDay={mobileDay}
            onOpen={(session) => setParam({ session: session.id })}
          />
          {sessions.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <CalendarClock size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p>{isStaffLevel ? 'No sessions this week.' : 'You have no sessions this week.'}</p>
            </div>
          )}
        </>
      )}

      {openId && (
        <SessionPanel
          key={openId}
          sessionId={openId}
          onClose={() => setParam({ session: null })}
          onChanged={() => setReload((n) => n + 1)}
        />
      )}
    </div>
  )
}
