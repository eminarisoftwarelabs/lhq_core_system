import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TimetableSlotFields } from '../components/TimetableSlotFields'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { academicsApi, tutorsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'

const emptySlot = { day_of_week: 0, start_time: '', end_time: '' }

export function SubjectCreatePage() {
  const navigate = useNavigate()
  const [tutors, setTutors] = useState([])
  const [name, setName] = useState('')
  const [tutorId, setTutorId] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [setSlot, setSetSlot] = useState(false)
  const [slot, setSlotValue] = useState(emptySlot)
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    tutorsApi.listTeaching().then((list) => {
      if (!cancelled) setTutors(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = { name, is_active: isActive, tutor: tutorId || null }
    if (setSlot) {
      payload.timetable_slot = slot
    }

    try {
      const created = await academicsApi.createSubject(payload)
      navigate(`/subjects/${created.id}`, { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not create the subject.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1>Add subject</h1>
      <form className="form" onSubmit={handleSubmit}>
        <NonFieldErrors errors={errors} />

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
          <input
            id="is_active"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active (offered to onboarding)
        </label>

        <label htmlFor="set_slot" className="checkbox-label">
          <input
            id="set_slot"
            type="checkbox"
            checked={setSlot}
            onChange={(e) => setSetSlot(e.target.checked)}
          />
          Set a timetable slot now
        </label>
        {setSlot && <TimetableSlotFields value={slot} onChange={setSlotValue} idPrefix="create_slot" />}
        <FieldErrors errors={errors} field="timetable_slot" />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create subject'}
        </button>
      </form>
    </div>
  )
}
