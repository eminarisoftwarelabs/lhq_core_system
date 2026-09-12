import { CalendarClock, Pencil, Plus, UserCog } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { TimetableSlotFields } from '../components/TimetableSlotFields'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { useToast } from '../components/toast/useToast'
import { useAuth } from '../auth/useAuth'
import { academicsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { DAY_LABELS, formatTime } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

const emptySlot = { day_of_week: 0, start_time: '', end_time: '' }

// Backend day_of_week is 0=Monday...6=Sunday; Date#getDay() is 0=Sunday...
// 6=Saturday - shift by one and wrap Sunday around to line the two up, so
// today's column can be highlighted.
function todayDayOfWeek() {
  const jsDay = new Date().getDay()
  return jsDay === 0 ? 6 : jsDay - 1
}

// Inline editor for one Subject's slot - shared between clicking a
// scheduled block (pre-filled, with a Remove option) and "Set slot" on an
// unscheduled one (starts empty). Lives above the board rather than in a
// modal so it stays reachable by a direct link (?subject=<id> from
// SubjectDetailPage's "Manage timetable" button).
function SlotEditor({ subject, onSaved, onCancel }) {
  const { showToast } = useToast()
  const [slot, setSlot] = useState(
    subject.timetable_slot
      ? {
          day_of_week: subject.timetable_slot.day_of_week,
          start_time: formatTime(subject.timetable_slot.start_time),
          end_time: formatTime(subject.timetable_slot.end_time),
        }
      : emptySlot,
  )
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [removing, setRemoving] = useState(false)
  const editorRef = useRef(null)

  useEffect(() => {
    // jsdom (tests) doesn't implement scrollIntoView - guarded rather than
    // relied upon, this is a nice-to-have scroll cue, not behavior anything
    // depends on.
    editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)
    try {
      const updated = await academicsApi.updateSubject(subject.id, { timetable_slot: slot })
      showToast(`Timetable slot saved for ${subject.name}`)
      onSaved(updated)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not save the timetable slot.' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove() {
    setErrors(null)
    setRemoving(true)
    try {
      const updated = await academicsApi.updateSubject(subject.id, { timetable_slot: null })
      showToast(`Timetable slot removed for ${subject.name}`)
      onSaved(updated)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not remove the timetable slot.' })
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="form-card timetable-editor" ref={editorRef}>
      <form className="form" onSubmit={handleSubmit}>
        <NonFieldErrors errors={errors} />
        <fieldset>
          <legend>
            <span className="icon-badge">
              <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            {subject.name}
          </legend>
          <TimetableSlotFields value={slot} onChange={setSlot} idPrefix="timetable_editor" />
          <FieldErrors errors={errors} field="timetable_slot" />
        </fieldset>

        <div className="form-actions">
          {subject.timetable_slot && (
            <button
              type="button"
              className="button button--danger form-actions__leading"
              onClick={handleRemove}
              disabled={removing || submitting}
            >
              {removing ? 'Removing…' : 'Remove slot'}
            </button>
          )}
          <button type="button" className="button button--secondary" onClick={onCancel} disabled={removing}>
            Cancel
          </button>
          <button type="submit" disabled={submitting || removing}>
            {submitting ? 'Saving…' : 'Save slot'}
          </button>
        </div>
      </form>
    </div>
  )
}

function ScheduledRow({ subject, canEdit, onEdit }) {
  const content = (
    <>
      <span className="timetable-slot-row__time">
        {formatTime(subject.timetable_slot.start_time)}–{formatTime(subject.timetable_slot.end_time)}
      </span>
      <span className="timetable-slot-row__body">
        <span className="timetable-slot-row__name">{subject.name}</span>
        <span className="timetable-slot-row__tutor">
          <UserCog size={12} strokeWidth={1.75} aria-hidden="true" />
          {subject.tutor_name || 'Unassigned'}
        </span>
      </span>
      {canEdit && <Pencil className="timetable-slot-row__icon" size={14} strokeWidth={1.75} aria-hidden="true" />}
    </>
  )

  if (!canEdit) {
    return <div className="timetable-slot-row">{content}</div>
  }

  return (
    <button type="button" className="timetable-slot-row timetable-slot-row--button" onClick={() => onEdit(subject.id)}>
      {content}
    </button>
  )
}

function UnscheduledRow({ subject, canEdit, onEdit }) {
  return (
    <div className="timetable-slot-row timetable-slot-row--unscheduled">
      <span className="timetable-slot-row__body">
        <span className="timetable-slot-row__name">{subject.name}</span>
        <span className="timetable-slot-row__tutor">
          <UserCog size={12} strokeWidth={1.75} aria-hidden="true" />
          {subject.tutor_name || 'Unassigned'}
        </span>
      </span>
      {canEdit && (
        <button type="button" className="button button--secondary timetable-slot-row__set" onClick={() => onEdit(subject.id)}>
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
          Set slot
        </button>
      )}
    </div>
  )
}

export function TimetablePage() {
  usePageTitle('Timetable')
  const { isStaffLevel } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [subjects, setSubjects] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const appliedDeepLink = useRef(false)

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

  // Deep link from SubjectDetailPage's "Manage timetable" button
  // (/timetable?subject=<id>) opens that subject's editor once its data has
  // loaded, then clears the query param so a later save doesn't re-trigger
  // this on re-render.
  useEffect(() => {
    if (appliedDeepLink.current || !subjects || !isStaffLevel) return
    const subjectId = searchParams.get('subject')
    if (!subjectId) return
    appliedDeepLink.current = true
    if (subjects.some((s) => String(s.id) === subjectId)) {
      // One-time application of a URL deep link, not a state sync - guarded
      // by appliedDeepLink.current above so it can only ever run once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditingId(Number(subjectId))
    }
    setSearchParams({}, { replace: true })
  }, [subjects, searchParams, setSearchParams, isStaffLevel])

  const scheduledByDay = useMemo(() => {
    const groups = Array.from({ length: 7 }, () => [])
    for (const subject of subjects || []) {
      if (subject.timetable_slot) groups[subject.timetable_slot.day_of_week].push(subject)
    }
    for (const group of groups) {
      group.sort((a, b) => a.timetable_slot.start_time.localeCompare(b.timetable_slot.start_time))
    }
    return groups
  }, [subjects])

  const unscheduled = useMemo(
    () => (subjects || []).filter((s) => !s.timetable_slot).sort((a, b) => a.name.localeCompare(b.name)),
    [subjects],
  )

  const editingSubject = subjects?.find((s) => s.id === editingId) ?? null
  const today = todayDayOfWeek()

  function handleSaved(updated) {
    setSubjects((current) => current.map((s) => (s.id === updated.id ? updated : s)))
    setEditingId(null)
  }

  return (
    <div className="page">
      {isStaffLevel && (
        <div className="page-toolbar">
          <Link className="button button--secondary" to="/subjects/new">
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Add subject
          </Link>
        </div>
      )}

      {editingSubject && (
        <SlotEditor subject={editingSubject} onSaved={handleSaved} onCancel={() => setEditingId(null)} />
      )}

      {loading && <p className="page-loading">Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && subjects && (
        <>
          <div className="timetable-board">
            {DAY_LABELS.map((label, day) => (
              <section className={`timetable-day${day === today ? ' timetable-day--today' : ''}`} key={label}>
                <div className="timetable-day__header">
                  <span className="timetable-day__name">{label}</span>
                  <span className="timetable-day__count">{scheduledByDay[day].length}</span>
                </div>
                <div className="timetable-day__body">
                  {scheduledByDay[day].length === 0 && <p className="timetable-day__empty">No sessions</p>}
                  {scheduledByDay[day].map((subject) => (
                    <ScheduledRow key={subject.id} subject={subject} canEdit={isStaffLevel} onEdit={setEditingId} />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {unscheduled.length > 0 && (
            <div className="form-card timetable-unscheduled">
              <div className="detail-section">
                <div className="detail-section__header">
                  <span className="icon-badge">
                    <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
                  </span>
                  Unscheduled subjects
                </div>
                {unscheduled.map((subject) => (
                  <UnscheduledRow key={subject.id} subject={subject} canEdit={isStaffLevel} onEdit={setEditingId} />
                ))}
              </div>
            </div>
          )}

          {subjects.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <CalendarClock size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p>No subjects to schedule yet.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
