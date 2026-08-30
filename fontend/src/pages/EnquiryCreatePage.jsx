import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SubjectMultiSelect } from '../components/SubjectMultiSelect'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { academicsApi, enquiriesApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { LEARNING_MODE_LABELS, LEARNING_MODES } from '../lib/constants'

export function EnquiryCreatePage() {
  const navigate = useNavigate()
  const [subjects, setSubjects] = useState([])
  const [subjectIds, setSubjectIds] = useState([])

  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentLocation, setParentLocation] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [durationWeeks, setDurationWeeks] = useState('')
  const [learningMode, setLearningMode] = useState('')
  const [desiredStartDate, setDesiredStartDate] = useState('')

  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    academicsApi.listSubjects({ is_active: true }).then((res) => setSubjects(res.results))
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = {
      parent: {
        full_name: parentName,
        phone: parentPhone,
        email: parentEmail,
        location: parentLocation,
      },
      student_name: studentName,
      student_grade: studentGrade,
      subject_ids: subjectIds,
      duration_weeks: durationWeeks ? Number(durationWeeks) : null,
      learning_mode: learningMode || null,
      desired_start_date: desiredStartDate || null,
    }

    try {
      const enquiry = await enquiriesApi.create(payload)
      navigate(`/enquiries/${enquiry.id}`, { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not create the enquiry.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1>New enquiry</h1>
      <form className="form" onSubmit={handleSubmit}>
        <NonFieldErrors errors={errors} />

        <fieldset>
          <legend>Parent</legend>
          <label htmlFor="parent_full_name">Full name</label>
          <input
            id="parent_full_name"
            type="text"
            value={parentName}
            onChange={(e) => setParentName(e.target.value)}
            required
          />
          <FieldErrors errors={errors} field="parent" />

          <label htmlFor="parent_phone">Phone</label>
          <input
            id="parent_phone"
            type="text"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            required
          />

          <label htmlFor="parent_email">Email</label>
          <input
            id="parent_email"
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
          />

          <label htmlFor="parent_location">Location</label>
          <input
            id="parent_location"
            type="text"
            value={parentLocation}
            onChange={(e) => setParentLocation(e.target.value)}
          />
        </fieldset>

        <label htmlFor="student_name">Student name</label>
        <input
          id="student_name"
          type="text"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          required
        />
        <FieldErrors errors={errors} field="student_name" />

        <label htmlFor="student_grade">Student grade</label>
        <input
          id="student_grade"
          type="text"
          value={studentGrade}
          onChange={(e) => setStudentGrade(e.target.value)}
          required
        />
        <FieldErrors errors={errors} field="student_grade" />

        <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} />
        <FieldErrors errors={errors} field="subject_ids" />

        <label htmlFor="duration_weeks">Duration (weeks)</label>
        <input
          id="duration_weeks"
          type="number"
          min="1"
          value={durationWeeks}
          onChange={(e) => setDurationWeeks(e.target.value)}
        />
        <FieldErrors errors={errors} field="duration_weeks" />

        <label htmlFor="learning_mode">Learning mode</label>
        <select id="learning_mode" value={learningMode} onChange={(e) => setLearningMode(e.target.value)}>
          <option value="">—</option>
          {LEARNING_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {LEARNING_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
        <FieldErrors errors={errors} field="learning_mode" />

        <label htmlFor="desired_start_date">Desired start date</label>
        <input
          id="desired_start_date"
          type="date"
          value={desiredStartDate}
          onChange={(e) => setDesiredStartDate(e.target.value)}
        />
        <p className="form-note">Required before an invoice can be generated for this enquiry.</p>
        <FieldErrors errors={errors} field="desired_start_date" />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create enquiry'}
        </button>
      </form>
    </div>
  )
}
