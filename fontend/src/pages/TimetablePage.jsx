import { CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Clock, Copy, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { LessonPlanEditor } from '../components/timetable/LessonPlanEditor'
import { SessionDialog } from '../components/timetable/SessionDialog'
import { UnscheduledTray } from '../components/timetable/UnscheduledTray'
import { WeekGrid } from '../components/timetable/WeekGrid'
import { useToast } from '../components/toast/useToast'
import { academicsApi, lessonPlansApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import {
  DEFAULT_SESSION_MINUTES,
  firstFreeStart,
  formatDuration,
  formatRange,
  gridBounds,
  overlaps,
  placeStart,
  toSession,
  toSlotPayload,
  tutorClashes,
  WEEKDAYS,
  weekdayIndex,
} from '../lib/timetableGrid'
import { usePageTitle } from '../lib/usePageTitle'
import { addWeeks, formatWeekRange, parseWeekParam, relativeWeekLabel, weekStartOf } from '../lib/weeks'

function nowMinutes(date) {
  return date.getHours() * 60 + date.getMinutes()
}

export function TimetablePage() {
  usePageTitle('Timetable')
  const { isStaffLevel } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [subjects, setSubjects] = useState(null)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(null)
  const [dragging, setDragging] = useState(null)
  const [fullDay, setFullDay] = useState(false)
  // Always on when the page opens - hiding topics is a per-visit choice.
  const [showTopics, setShowTopics] = useState(true)
  const [plans, setPlans] = useState({})
  const [plansError, setPlansError] = useState(null)
  const [copying, setCopying] = useState(false)
  const appliedDeepLink = useRef(false)

  // Ticks once a minute so the "now" line on today's column keeps moving
  // (and "today" rolls over at midnight) without a reload.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000)
    return () => clearInterval(id)
  }, [])
  const today = weekdayIndex(now)
  const thisWeek = weekStartOf(now)
  // The week on screen lives in the URL (?week=<monday>), so a planned-ahead
  // week can be bookmarked or shared; anything invalid means this week.
  const week = parseWeekParam(searchParams.get('week')) ?? thisWeek
  const todayInView = week === thisWeek ? today : null
  // On a phone the grid shows one day at a time - start on today, or
  // Monday over the weekend.
  const [mobileDay, setMobileDay] = useState(today ?? 0)

  function goToWeek(next) {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        if (next === thisWeek) params.delete('week')
        else params.set('week', next)
        return params
      },
      { replace: true },
    )
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const results = await academicsApi.listAllSubjects()
        if (!cancelled) setSubjects(results)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load the timetable.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  // The displayed week's lesson plans, keyed by subject id.
  const loadPlans = useCallback(async (weekStart) => {
    setPlansError(null)
    try {
      const results = await lessonPlansApi.list(weekStart)
      setPlans(Object.fromEntries(results.map((p) => [p.subject, p])))
    } catch (err) {
      setPlans({})
      setPlansError(err instanceof ApiError ? err.message : 'Could not load this week\'s topics.')
    }
  }, [])

  useEffect(() => {
    // Refetch whenever the week changes; loadPlans only sets state after
    // its request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPlans(week)
  }, [week, loadPlans])

  const sessions = useMemo(() => (subjects || []).map(toSession).filter(Boolean), [subjects])
  const unscheduled = useMemo(
    () => (subjects || []).filter((s) => !toSession(s)).sort((a, b) => a.name.localeCompare(b.name)),
    [subjects],
  )
  const bounds = useMemo(() => gridBounds(sessions, { fullDay }), [sessions, fullDay])
  // Both ranges are computed up front so each option can name the exact
  // hours it shows - the label says what you'll see, not how it's derived.
  const lessonBounds = useMemo(() => gridBounds(sessions), [sessions])
  const wholeDayBounds = gridBounds([], { fullDay: true })
  const clashes = useMemo(() => tutorClashes(sessions), [sessions])
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.end - s.start), 0)

  const findClashes = useCallback(
    (subjectId, day, start, end) => {
      const subject = subjects?.find((s) => s.id === subjectId)
      if (!subject || subject.tutor == null) return []
      const candidate = { day, start, end }
      return sessions.filter(
        (s) => s.subject.id !== subjectId && s.subject.tutor === subject.tutor && overlaps(s, candidate),
      )
    },
    [subjects, sessions],
  )

  const openAdd = useCallback(
    (subject = null, day = today ?? 0, start = null) => {
      const from = start ?? firstFreeStart(sessions, day, bounds)
      setActionError(null)
      setDialog({
        mode: 'add',
        subjectId: subject?.id ?? null,
        initial: { day, start: from, end: from + DEFAULT_SESSION_MINUTES },
      })
    },
    [sessions, bounds, today],
  )

  // Staff get the full editor (time + lesson plan); a Tutor gets the
  // lesson plan only - they plan what they teach, staff own the schedule.
  const openEdit = useCallback(
    (session) => {
      setActionError(null)
      setDialog({
        mode: isStaffLevel ? 'edit' : 'plan',
        subjectId: session.subject.id,
        initial: { day: session.day, start: session.start, end: session.end },
      })
    },
    [isStaffLevel],
  )

  // Deep link from SubjectDetailPage's "Manage timetable" button
  // (/timetable?subject=<id>): opens that subject's session once data has
  // loaded - to edit it if it's scheduled, or to add it if not - then
  // clears the param so it can't re-open on a later render.
  useEffect(() => {
    if (appliedDeepLink.current || !subjects || !isStaffLevel) return
    const subjectId = searchParams.get('subject')
    if (!subjectId) return
    appliedDeepLink.current = true
    const subject = subjects.find((s) => String(s.id) === subjectId)
    const session = subject && toSession(subject)
    // One-time application of a URL deep link, guarded by the ref above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (session) openEdit(session)
    else if (subject) openAdd(subject)
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current)
        params.delete('subject')
        return params
      },
      { replace: true },
    )
  }, [subjects, searchParams, setSearchParams, isStaffLevel, openAdd, openEdit])

  function handlePlanChanged(subjectId, weekStart, plan) {
    if (weekStart !== week) return
    setPlans((current) => {
      const next = { ...current }
      if (plan) next[subjectId] = plan
      else delete next[subjectId]
      return next
    })
  }

  function handleTopicCreated(subjectId, topic) {
    setSubjects((current) =>
      current.map((s) =>
        s.id === subjectId
          ? { ...s, topics: [...(s.topics ?? []), topic].sort((a, b) => a.name.localeCompare(b.name)) }
          : s,
      ),
    )
  }

  // Re-use last week's topics for this week: fills only lessons with
  // nothing planned yet, never overwriting (see LessonPlanCopyWeekView).
  async function copyLastWeek() {
    setActionError(null)
    setCopying(true)
    try {
      const { copied, skipped } = await lessonPlansApi.copyWeek(addWeeks(week, -1), week)
      await loadPlans(week)
      if (copied === 0 && skipped === 0) {
        showToast('Last week has no topics to copy')
      } else if (copied === 0) {
        showToast('Every lesson this week already has a topic')
      } else {
        showToast(
          `Copied ${copied} ${copied === 1 ? 'topic' : 'topics'} from last week` +
            (skipped ? ` (${skipped} already planned, left as they were)` : ''),
        )
      }
    } catch (err) {
      setActionError(`Could not copy last week's topics. ${err instanceof ApiError ? err.message : 'Please try again.'}`)
    } finally {
      setCopying(false)
    }
  }

  function replaceSubject(updated) {
    setSubjects((current) => current.map((s) => (s.id === updated.id ? updated : s)))
  }

  async function saveSession(subjectId, day, start, end) {
    const subject = subjects.find((s) => s.id === subjectId)
    const wasScheduled = Boolean(toSession(subject))
    const updated = await academicsApi.updateSubject(subjectId, { timetable_slot: toSlotPayload(day, start, end) })
    replaceSubject(updated)
    setDialog(null)
    setMobileDay(day)
    showToast(`${subject.name} ${wasScheduled ? 'moved to' : 'scheduled for'} ${WEEKDAYS[day].label} ${formatRange(start, end)}`)
  }

  async function removeSession(subject) {
    const updated = await academicsApi.updateSubject(subject.id, { timetable_slot: null })
    replaceSubject(updated)
    setDialog(null)
    showToast(`${subject.name} removed from the timetable`)
  }

  // The × on a block and drag-and-drop act immediately (no dialog), so a
  // failure surfaces as a page-level alert instead of inside a form.
  async function quickAction(label, action) {
    setActionError(null)
    try {
      await action()
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.data?.timetable_slot
            ? Object.values(err.data.timetable_slot).flat().join(' ')
            : err.message
          : 'Please try again.'
      setActionError(`Could not ${label}. ${detail}`)
    }
  }

  function handleDrop(subjectId, day, minute) {
    const subject = subjects.find((s) => s.id === subjectId)
    if (!subject) return
    const existing = toSession(subject)
    const duration = existing ? existing.end - existing.start : DEFAULT_SESSION_MINUTES
    const start = placeStart(minute, duration, bounds)
    setDragging(null)
    if (existing && existing.day === day && existing.start === start) return
    quickAction(`move ${subject.name}`, () => saveSession(subjectId, day, start, start + duration))
  }

  const dialogSubject = dialog?.subjectId ? subjects?.find((s) => s.id === dialog.subjectId) : null
  const hasAny = subjects && subjects.length > 0

  return (
    <div className="page page--timetable">
      <div className="tt-toolbar">
        <div className="tt-toolbar__summary">
          <span className="tt-stat">
            <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
            <strong>{sessions.length}</strong> {sessions.length === 1 ? 'session' : 'sessions'} a week
          </span>
          <span className="tt-stat">
            <Clock size={14} strokeWidth={1.75} aria-hidden="true" />
            <strong>{totalMinutes ? formatDuration(totalMinutes) : '0 h'}</strong> of teaching
          </span>
          {clashes.size > 0 && (
            <span className="tt-stat tt-stat--warning">{clashes.size} sessions double-book a tutor</span>
          )}
        </div>

        {isStaffLevel && (
          <div className="tt-toolbar__actions">
            <Link className="button button--secondary" to="/subjects/new">
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Add subject
            </Link>
            <button type="button" className="button" onClick={() => openAdd(unscheduled[0] ?? null)} disabled={!hasAny}>
              <CalendarPlus size={16} strokeWidth={1.75} aria-hidden="true" />
              Schedule a subject
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}

      {loading && <p className="page-loading">Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && subjects && !hasAny && (
        <div className="empty-state">
          <span className="empty-state__icon">
            <CalendarClock size={22} strokeWidth={1.75} aria-hidden="true" />
          </span>
          <p>No subjects to schedule yet.</p>
        </div>
      )}

      {!loading && !error && hasAny && (
        <>
          <div className="tt-day-tabs period-toggle" role="group" aria-label="Day">
            {WEEKDAYS.map(({ day, short, label }) => (
              <button
                key={day}
                type="button"
                className={`period-toggle__option${day === mobileDay ? ' period-toggle__option--active' : ''}`}
                aria-pressed={day === mobileDay}
                aria-label={label}
                onClick={() => setMobileDay(day)}
              >
                {short}
              </button>
            ))}
          </div>

          {isStaffLevel && (
            <UnscheduledTray
              subjects={unscheduled}
              onSchedule={(subject) => openAdd(subject, mobileDay)}
              onDragStart={(subjectId, duration, grabOffset) => setDragging({ subjectId, duration, grabOffset })}
              onDragEnd={() => setDragging(null)}
            />
          )}

          <div className="tt-board">
            <div className="tt-weekbar">
              <div className="tt-weekbar__nav">
                <button
                  type="button"
                  className="icon-button tt-weekbar__step"
                  aria-label="Previous week"
                  onClick={() => goToWeek(addWeeks(week, -1))}
                >
                  <ChevronLeft size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
                <h2 className="tt-weekbar__title" aria-live="polite">
                  {relativeWeekLabel(week, now) && (
                    <span className="tt-weekbar__relative">{relativeWeekLabel(week, now)}</span>
                  )}
                  <span className="tt-weekbar__range">{formatWeekRange(week)}</span>
                </h2>
                <button
                  type="button"
                  className="icon-button tt-weekbar__step"
                  aria-label="Next week"
                  onClick={() => goToWeek(addWeeks(week, 1))}
                >
                  <ChevronRight size={18} strokeWidth={1.75} aria-hidden="true" />
                </button>
                {week !== thisWeek && (
                  <button
                    type="button"
                    className="button button--secondary button--compact"
                    onClick={() => goToWeek(thisWeek)}
                  >
                    Back to this week
                  </button>
                )}
              </div>

              <div className="tt-weekbar__tools">
                <label htmlFor="tt_show_topics" className="checkbox-label tt-weekbar__switch">
                  <input
                    id="tt_show_topics"
                    type="checkbox"
                    checked={showTopics}
                    onChange={(e) => setShowTopics(e.target.checked)}
                  />
                  Show topics
                </label>
                {sessions.length > 0 && (
                  <button
                    type="button"
                    className="button button--secondary button--compact"
                    onClick={copyLastWeek}
                    disabled={copying}
                    title="Fill this week's lessons that have no topic with last week's topics"
                  >
                    <Copy size={14} strokeWidth={1.75} aria-hidden="true" />
                    {copying ? 'Copying…' : "Copy last week's topics"}
                  </button>
                )}
              </div>
            </div>

            {plansError && (
              <p className="form-error" role="alert">
                {plansError}
              </p>
            )}

            <div className="tt-board__bar">
              <p className="tt-board__hint">
                {isStaffLevel
                  ? 'Click an empty time to add a lesson, or a lesson to plan its topics. Drag to move, × to remove.'
                  : 'Click a lesson to plan the topics you will teach.'}
              </p>
              <div className="tt-hours-toggle">
                <span className="tt-hours-toggle__label" id="tt-hours-label">
                  Hours shown
                </span>
                <div className="period-toggle" role="group" aria-labelledby="tt-hours-label">
                  <button
                    type="button"
                    className={`period-toggle__option${fullDay ? '' : ' period-toggle__option--active'}`}
                    aria-pressed={!fullDay}
                    title="Only the hours that have lessons, with an hour either side"
                    onClick={() => setFullDay(false)}
                  >
                    Lesson hours <span className="tt-hours-toggle__range">{formatRange(lessonBounds.start, lessonBounds.end)}</span>
                  </button>
                  <button
                    type="button"
                    className={`period-toggle__option${fullDay ? ' period-toggle__option--active' : ''}`}
                    aria-pressed={fullDay}
                    title="The whole working day, to add lessons at any time"
                    onClick={() => setFullDay(true)}
                  >
                    Whole day <span className="tt-hours-toggle__range">{formatRange(wholeDayBounds.start, wholeDayBounds.end)}</span>
                  </button>
                </div>
              </div>
            </div>
            <WeekGrid
              sessions={sessions}
              bounds={bounds}
              canEdit={isStaffLevel}
              canOpen
              weekStart={week}
              plans={plans}
              showTopics={showTopics}
              today={todayInView}
              nowMinutes={nowMinutes(now)}
              mobileDay={mobileDay}
              clashes={clashes}
              dragging={dragging}
              onAddAt={(day, start) => openAdd(unscheduled[0] ?? null, day, start)}
              onOpen={openEdit}
              onRemove={(session) =>
                quickAction(`remove ${session.subject.name}`, () => removeSession(session.subject))
              }
              onDropSubject={handleDrop}
              onDragStart={(subjectId, duration, grabOffset) => setDragging({ subjectId, duration, grabOffset })}
              onDragEnd={() => setDragging(null)}
            />
          </div>
        </>
      )}

      {dialog && (
        <SessionDialog
          key={`${dialog.mode}-${dialog.subjectId}-${dialog.initial.day}-${dialog.initial.start}`}
          mode={dialog.mode}
          subject={dialog.mode === 'add' ? null : dialogSubject}
          choices={
            dialog.mode === 'add'
              ? dialogSubject
                ? [dialogSubject, ...unscheduled.filter((s) => s.id !== dialogSubject.id)]
                : unscheduled
              : []
          }
          initial={dialog.initial}
          findClashes={findClashes}
          onSave={saveSession}
          onRemove={removeSession}
          onClose={() => setDialog(null)}
          summary={
            dialogSubject && dialog.mode === 'plan'
              ? `${WEEKDAYS[dialog.initial.day].label}s, ${formatRange(dialog.initial.start, dialog.initial.end)}`
              : null
          }
        >
          {dialogSubject && dialog.mode !== 'add' && (
            <LessonPlanEditor
              subject={dialogSubject}
              day={dialog.initial.day}
              fromWeek={week}
              today={now}
              onPlanChanged={handlePlanChanged}
              onTopicCreated={handleTopicCreated}
            />
          )}
        </SessionDialog>
      )}
    </div>
  )
}
