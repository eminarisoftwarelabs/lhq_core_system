import { BookOpen, CalendarClock, Pencil, StickyNote, UserCog, Users, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { useToast } from '../components/toast/useToast'
import { useAuth } from '../auth/useAuth'
import { academicsApi, tutorsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, formatTime } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

function timetableLabel(slot) {
  return slot ? `${dayLabel(slot.day_of_week)} ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}` : 'No timetable slot'
}

// Name, tutor, and active status only - the timetable slot lives on the
// Timetable page now (see TimetablePage), so this form no longer touches
// `timetable_slot` at all: omitting it from the PATCH payload leaves
// whatever slot the subject already has untouched (SubjectSerializer.update
// only clears/replaces it when the key is present).
function EditForm({ subject, tutors, onSaved, onCancel }) {
  const { showToast } = useToast()
  const [name, setName] = useState(subject.name)
  const [tutorId, setTutorId] = useState(subject.tutor ?? '')
  const [isActive, setIsActive] = useState(subject.is_active)
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = { name, is_active: isActive, tutor: tutorId || null }

    try {
      const updated = await academicsApi.updateSubject(subject.id, payload)
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
        <div className="field field--full field--required">
          <label htmlFor="name">Name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          <FieldErrors errors={errors} field="name" />
        </div>

        <div className="field">
          <label htmlFor="tutor">Tutor</label>
          <select id="tutor" value={tutorId} onChange={(e) => setTutorId(e.target.value)}>
            <option value="">Unassigned</option>
            {tutors.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <FieldErrors errors={errors} field="tutor" />
        </div>
      </div>

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

// Collapsed to a plain "Edit" affordance by default rather than a
// permanently-open form - the header above already surfaces name, status,
// tutor, and timetable, so a form sitting open here just duplicates it
// until someone actually wants to change something. Mirrors the
// summary/Edit pattern EnquiryDetailPage's DetailsSection established.
function DetailsSection({ subject, tutors, onSaved }) {
  const [editing, setEditing] = useState(false)

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
          tutors={tutors}
          onSaved={(updated) => {
            onSaved(updated)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <p className="form-note">Name, assigned tutor, and whether it's offered to onboarding.</p>
      )}
    </div>
  )
}

function TopicsPanel({ subject, canEdit, onChanged }) {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await academicsApi.createTopic(subject.id, { name })
      setName('')
      onChanged()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not add the topic.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(topicId) {
    try {
      await academicsApi.deleteTopic(topicId)
      onChanged()
    } catch {
      setError('Could not delete the topic.')
    }
  }

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <StickyNote size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Topics
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {subject.topics.length === 0 && <p className="form-note">No topics yet.</p>}
      {subject.topics.length > 0 && (
        <div className="topic-chip-list">
          {subject.topics.map((topic) => (
            <span key={topic.id} className="topic-chip">
              {topic.name}
              {canEdit && (
                <button
                  type="button"
                  className="topic-chip__remove"
                  onClick={() => handleDelete(topic.id)}
                  aria-label={`Remove ${topic.name}`}
                >
                  <X size={12} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        <form className="inline-add-form" onSubmit={handleAdd}>
          <div className="field">
            <label htmlFor="topic_name">Add a topic</label>
            <input id="topic_name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add topic'}
          </button>
        </form>
      )}
    </div>
  )
}

export function SubjectDetailPage() {
  const { id } = useParams()
  const { isStaffLevel } = useAuth()
  const [subject, setSubject] = useState(null)
  const [tutors, setTutors] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(subject?.name)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await academicsApi.getSubject(id)
      setSubject(res)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    // load is also passed to TopicsPanel to refresh after a topic is added
    // or removed, so it stays a shared function rather than an
    // effect-local closure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    if (isStaffLevel) {
      tutorsApi.listTeaching().then((list) => {
        if (!cancelled) setTutors(list)
      })
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isStaffLevel])

  if (loading) return <div className="page page-loading">Loading…</div>
  if (error === 'not_found') return <div className="page">Subject not found.</div>
  if (error) return <div className="page">Could not load this subject.</div>

  return (
    <div className="page">
      <div className="detail-header">
        <span className="icon-badge">
          <BookOpen size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="detail-header__identity">
          <h1 className="detail-header__name">{subject.name}</h1>
        </div>
        <span
          className={`stage-badge subject-status-badge subject-status-badge--${subject.is_active ? 'active' : 'inactive'}`}
        >
          {subject.is_active ? 'Active' : 'Inactive'}
        </span>
        <div className="invoice-header-actions">
          <Link className="button button--secondary" to={`/subjects/${subject.id}/roster`}>
            <Users size={16} strokeWidth={1.75} aria-hidden="true" />
            View class roster
          </Link>
          {isStaffLevel && (
            <Link className="button button--secondary" to={`/timetable?subject=${subject.id}`}>
              <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
              Manage timetable
            </Link>
          )}
        </div>
      </div>

      <div className="detail-header__meta">
        <span className="detail-header__parent">
          <UserCog size={14} strokeWidth={1.75} aria-hidden="true" />
          {subject.tutor_name || 'Unassigned'}
        </span>
        <span className="detail-header__parent">
          <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
          {timetableLabel(subject.timetable_slot)}
        </span>
      </div>

      <div className="form-card">
        {isStaffLevel && <DetailsSection subject={subject} tutors={tutors} onSaved={setSubject} />}

        <TopicsPanel subject={subject} canEdit={isStaffLevel} onChanged={load} />
      </div>
    </div>
  )
}
