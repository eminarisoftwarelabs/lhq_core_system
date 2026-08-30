import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TimetableSlotFields } from '../components/TimetableSlotFields'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { useAuth } from '../auth/useAuth'
import { academicsApi, tutorsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, formatTime } from '../lib/constants'

const emptySlot = { day_of_week: 0, start_time: '', end_time: '' }

function EditForm({ subject, tutors, onSaved }) {
  const [name, setName] = useState(subject.name)
  const [tutorId, setTutorId] = useState(subject.tutor ?? '')
  const [isActive, setIsActive] = useState(subject.is_active)
  const [setSlot, setSetSlot] = useState(Boolean(subject.timetable_slot))
  const [slot, setSlotValue] = useState(
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
  const [savedMessage, setSavedMessage] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSavedMessage(null)
    setSubmitting(true)

    const payload = { name, is_active: isActive, tutor: tutorId || null, timetable_slot: setSlot ? slot : null }

    try {
      const updated = await academicsApi.updateSubject(subject.id, payload)
      setSavedMessage('Saved.')
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
      {savedMessage && <p className="form-success">{savedMessage}</p>}

      <label htmlFor="name">Name</label>
      <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      <FieldErrors errors={errors} field="name" />

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

      <label htmlFor="is_active" className="checkbox-label">
        <input id="is_active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (offered to onboarding)
      </label>

      <label htmlFor="set_slot" className="checkbox-label">
        <input id="set_slot" type="checkbox" checked={setSlot} onChange={(e) => setSetSlot(e.target.checked)} />
        Has a timetable slot
      </label>
      {setSlot && <TimetableSlotFields value={slot} onChange={setSlotValue} idPrefix="edit_slot" />}
      <FieldErrors errors={errors} field="timetable_slot" />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save changes'}
      </button>
    </form>
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
    <section>
      <h2>Topics</h2>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {subject.topics.length === 0 && <p>No topics yet.</p>}
      {subject.topics.length > 0 && (
        <ul>
          {subject.topics.map((topic) => (
            <li key={topic.id}>
              {topic.name}
              {canEdit && (
                <>
                  {' '}
                  <button type="button" onClick={() => handleDelete(topic.id)}>
                    Remove
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="form" onSubmit={handleAdd}>
          <label htmlFor="topic_name">Add a topic</label>
          <input id="topic_name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add topic'}
          </button>
        </form>
      )}
    </section>
  )
}

export function SubjectDetailPage() {
  const { id } = useParams()
  const { isStaffLevel } = useAuth()
  const [subject, setSubject] = useState(null)
  const [tutors, setTutors] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

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

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">Subject not found.</div>
  if (error) return <div className="page">Could not load this subject.</div>

  return (
    <div className="page">
      <h1>{subject.name}</h1>
      <p>
        <Link to={`/subjects/${subject.id}/roster`}>View class roster</Link>
      </p>

      {isStaffLevel ? (
        <EditForm subject={subject} tutors={tutors} onSaved={setSubject} />
      ) : (
        <>
          <p>Tutor: {subject.tutor_name || 'Unassigned'}</p>
          <p>Status: {subject.is_active ? 'Active' : 'Inactive'}</p>
          <p>
            Timetable:{' '}
            {subject.timetable_slot
              ? `${dayLabel(subject.timetable_slot.day_of_week)} ${formatTime(subject.timetable_slot.start_time)}–${formatTime(subject.timetable_slot.end_time)}`
              : 'Not set'}
          </p>
        </>
      )}

      <TopicsPanel subject={subject} canEdit={isStaffLevel} onChanged={load} />
    </div>
  )
}
