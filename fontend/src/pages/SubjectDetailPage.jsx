import { BookOpen, CalendarClock, Pencil, StickyNote, UserCog } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { SubjectRoster } from '../components/SubjectRoster'
import { useToast } from '../components/toast/useToast'
import { useAuth } from '../auth/useAuth'
import { academicsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, formatTime } from '../lib/constants'
import { tutorNames } from '../lib/tutorTeaching'
import { usePageTitle } from '../lib/usePageTitle'

function timetableLabel(slot) {
  return slot ? `${dayLabel(slot.day_of_week)} ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}` : 'No timetable slot'
}

// Catalog fields only. Who teaches the subject is set on each tutor's
// profile (TutorSubject), and the timetable slot on the Timetable page -
// omitting `timetable_slot` from the PATCH leaves it untouched.
function EditForm({ subject, levels, onSaved, onCancel }) {
  const { showToast } = useToast()
  const [name, setName] = useState(subject.name)
  const [level, setLevel] = useState(subject.level)
  const [code, setCode] = useState(subject.code)
  const [hasPaper, setHasPaper] = useState(subject.has_paper)
  const [isActive, setIsActive] = useState(subject.is_active)
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)
    try {
      const updated = await academicsApi.updateSubject(subject.id, {
        name,
        level: Number(level),
        code,
        has_paper: hasPaper,
        is_active: isActive,
      })
      showToast('Changes saved')
      onSaved(updated)
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not save changes.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <NonFieldErrors errors={errors} />

      <div className="form-row">
        <div className="field field--required">
          <label htmlFor="name">Name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          <FieldErrors errors={errors} field="name" />
        </div>

        <div className="field field--required">
          <label htmlFor="level">Level</label>
          <select id="level" value={level} onChange={(e) => setLevel(e.target.value)} required>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <FieldErrors errors={errors} field="level" />
        </div>

        <div className="field">
          <label htmlFor="code">Syllabus code</label>
          <input id="code" type="text" value={code} onChange={(e) => setCode(e.target.value)} />
          <FieldErrors errors={errors} field="code" />
        </div>
      </div>

      <label htmlFor="has_paper" className="checkbox-label">
        <input id="has_paper" type="checkbox" checked={hasPaper} onChange={(e) => setHasPaper(e.target.checked)} />
        Core and Extended papers
      </label>

      <label htmlFor="is_active" className="checkbox-label">
        <input id="is_active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (offered to onboarding)
      </label>

      <div className="form-actions">
        <button type="button" className="button button--secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

function DetailsSection({ subject, levels, onSaved }) {
  const [editing, setEditing] = useState(false)
  const names = tutorNames(subject)

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Subject details
        {!editing && (
          <button
            type="button"
            className="button button--secondary detail-section__edit"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <EditForm
          subject={subject}
          levels={levels}
          onSaved={(updated) => {
            onSaved(updated)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <dl className="detail-summary">
          <div className="detail-summary__row">
            <dt>Level</dt>
            <dd>{subject.level_name}</dd>
          </div>
          <div className="detail-summary__row">
            <dt>Syllabus code</dt>
            <dd>{subject.code || '—'}</dd>
          </div>
          <div className="detail-summary__row">
            <dt>Core and Extended</dt>
            <dd>{subject.has_paper ? 'Yes' : 'No'}</dd>
          </div>
          <div className="detail-summary__row">
            <dt>Offered to onboarding</dt>
            <dd>{subject.is_active ? 'Yes' : 'No'}</dd>
          </div>
          <div className="detail-summary__row detail-summary__row--full">
            <dt>Taught by</dt>
            <dd>{names || 'No tutors yet. Set subjects on a tutor’s profile.'}</dd>
          </div>
        </dl>
      )}
    </div>
  )
}

// The official syllabus, read-only (seed_cambridge_topics), grouped by
// chapter in syllabus order.
function TopicsPanel({ subjectId, hasPaper }) {
  const [chapters, setChapters] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    academicsApi
      .listTopics(subjectId)
      .then((res) => {
        if (!cancelled) setChapters(res)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [subjectId])

  const topicCount = chapters?.reduce((n, c) => n + c.topics.length, 0) ?? 0

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <StickyNote size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Topics
        {chapters && <span className="onboarding-section__count">{topicCount}</span>}
      </div>

      {!chapters && !failed && <p className="form-note">Loading topics…</p>}
      {failed && (
        <p className="form-error" role="alert">
          Could not load the topics.
        </p>
      )}
      {chapters && chapters.length === 0 && <p className="form-note">No topics loaded for this subject yet.</p>}
      {hasPaper && chapters?.length > 0 && (
        <p className="form-note form-note--icon">Topics marked Extended are only on the Extended paper.</p>
      )}

      {chapters?.map((chapter, index) => (
        <section key={`${chapter.chapter}-${index}`} className="chapter" aria-label={chapter.chapter || 'General'}>
          <h3 className="chapter__title">{chapter.chapter || 'General'}</h3>
          <ol className="chapter__topics">
            {chapter.topics.map((topic) => (
              <li key={topic.id} className="chapter__topic">
                {topic.number && <span className="chapter__number">{topic.number}</span>}
                <span className="chapter__name">{topic.name}</span>
                {topic.extended_only && <span className="stage-badge extended-badge">Extended</span>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}

export function SubjectDetailPage() {
  const { id } = useParams()
  const { isStaffLevel } = useAuth()
  const [subject, setSubject] = useState(null)
  const [levels, setLevels] = useState([])
  const [error, setError] = useState(null)
  usePageTitle(subject?.name)

  useEffect(() => {
    let cancelled = false
    academicsApi
      .getSubject(id)
      .then((res) => {
        if (!cancelled) setSubject(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
      })
    if (isStaffLevel) {
      academicsApi
        .listLevels()
        .then((res) => {
          if (!cancelled) setLevels(res)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [id, isStaffLevel])

  if (error === 'not_found') return <div className="page">Subject not found.</div>
  if (error) return <div className="page">Could not load this subject.</div>
  if (!subject) return <div className="page page-loading">Loading…</div>

  const names = tutorNames(subject)
  // The roster is students' details: staff, or a tutor who teaches it.
  const showRoster = isStaffLevel || subject.taught_by_me

  return (
    <div className="page">
      <div className="detail-header">
        <span className="icon-badge">
          <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="detail-header__identity">
          <h1 className="detail-header__name">{subject.name}</h1>
          <span className="detail-header__number">
            {[subject.level_name, subject.code].filter(Boolean).join(' · ')}
          </span>
        </div>
        {subject.has_paper && <span className="stage-badge paper-badge">Core / Extended</span>}
        <span
          className={`stage-badge subject-status-badge subject-status-badge--${subject.is_active ? 'active' : 'inactive'}`}
        >
          {subject.is_active ? 'Active' : 'Inactive'}
        </span>
        {isStaffLevel && (
          <div className="invoice-header-actions">
            <Link className="button button--secondary" to={`/timetable?subject=${subject.id}`}>
              <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
              Manage timetable
            </Link>
          </div>
        )}
      </div>

      <div className="detail-header__meta">
        {isStaffLevel && (
          <span className="detail-header__parent">
            <UserCog size={14} strokeWidth={1.75} aria-hidden="true" />
            {names || 'No tutors yet'}
          </span>
        )}
        {!isStaffLevel && subject.taught_by_me && <span className="stage-badge taught-badge">You teach this</span>}
        <span className="detail-header__parent">
          <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
          {timetableLabel(subject.timetable_slot)}
        </span>
      </div>

      <div className="form-card">
        {isStaffLevel && <DetailsSection subject={subject} levels={levels} onSaved={setSubject} />}
        <TopicsPanel subjectId={subject.id} hasPaper={subject.has_paper} />
      </div>

      {showRoster && (
        <div className="form-card">
          <SubjectRoster subject={subject} />
        </div>
      )}
    </div>
  )
}
