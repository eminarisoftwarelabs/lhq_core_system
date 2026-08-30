import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SubjectMultiSelect } from '../components/SubjectMultiSelect'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { academicsApi, clientsApi, enrollmentsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { LEARNING_MODE_LABELS, LEARNING_MODES } from '../lib/constants'

export function EnrollmentCreatePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedStudentId = searchParams.get('student')

  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState([])
  const [student, setStudent] = useState(null)
  const [subjects, setSubjects] = useState([])
  const [subjectIds, setSubjectIds] = useState([])
  const [startDate, setStartDate] = useState('')
  const [durationWeeks, setDurationWeeks] = useState('')
  const [learningMode, setLearningMode] = useState(LEARNING_MODES[0])
  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    academicsApi.listSubjects({ is_active: true }).then((res) => setSubjects(res.results))
  }, [])

  useEffect(() => {
    if (preselectedStudentId) {
      clientsApi.getStudent(preselectedStudentId).then(setStudent)
    }
  }, [preselectedStudentId])

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(async () => {
      if (student || !query) {
        if (!cancelled) setCandidates([])
        return
      }
      const res = await clientsApi.searchStudents(query)
      if (!cancelled) setCandidates(res.results)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query, student])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors(null)
    setSubmitting(true)

    const payload = {
      student: student.id,
      subjects: subjectIds,
      start_date: startDate,
      duration_weeks: Number(durationWeeks),
      learning_mode: learningMode,
    }

    try {
      const enrollment = await enrollmentsApi.create(payload)
      navigate(`/students/${enrollment.student}`, { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not create the enrollment.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <h1>New enrollment</h1>
      <p className="form-note">For a returning student. No enquiry is created.</p>

      {!student && (
        <>
          <label htmlFor="student_search">Find student</label>
          <input
            id="student_search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or student number"
          />
          {candidates.length > 0 && (
            <ul>
              {candidates.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setStudent(c)}>
                    {c.full_name} ({c.student_number})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {student && (
        <form className="form" onSubmit={handleSubmit}>
          <NonFieldErrors errors={errors} />
          <p>
            Enrolling <strong>{student.full_name}</strong> ({student.student_number}){' '}
            {!preselectedStudentId && (
              <button type="button" onClick={() => setStudent(null)}>
                Change
              </button>
            )}
          </p>

          <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} />
          <FieldErrors errors={errors} field="subjects" />

          <label htmlFor="start_date">Start date</label>
          <input
            id="start_date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
          <FieldErrors errors={errors} field="start_date" />

          <label htmlFor="duration_weeks">Duration (weeks)</label>
          <input
            id="duration_weeks"
            type="number"
            min="1"
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
            required
          />
          <FieldErrors errors={errors} field="duration_weeks" />
          <FieldErrors errors={errors} field="end_date" />

          <label htmlFor="learning_mode">Learning mode</label>
          <select id="learning_mode" value={learningMode} onChange={(e) => setLearningMode(e.target.value)}>
            {LEARNING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {LEARNING_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
          <FieldErrors errors={errors} field="learning_mode" />

          <button type="submit" disabled={submitting}>
            {submitting ? 'Enrolling…' : 'Enroll'}
          </button>
        </form>
      )}
    </div>
  )
}
