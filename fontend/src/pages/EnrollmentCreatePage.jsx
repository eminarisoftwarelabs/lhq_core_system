import { BookOpen, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { SubjectMultiSelect } from '../components/SubjectMultiSelect'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { useToast } from '../components/toast/useToast'
import { DatePickerField } from '../components/ui/DatePickerField'
import { academicsApi, clientsApi, enrollmentsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { LEARNING_MODE_LABELS, LEARNING_MODES } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

export function EnrollmentCreatePage() {
  usePageTitle('New enrollment')
  const navigate = useNavigate()
  const { showToast } = useToast()
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
      showToast('Enrollment created')
      navigate(`/students/${enrollment.student}`, { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not create the enrollment.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="form-card">
        {!student && (
          <fieldset className="student-search">
            <legend>
              <span className="icon-badge">
                <Search size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Find student
            </legend>
            <p className="form-note">For a returning student. No enquiry is created.</p>

            <div className="field field--full">
              <label htmlFor="student_search">Name or student number</label>
              <input
                id="student_search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing to search"
              />
            </div>

            {candidates.length > 0 && (
              <ul className="student-search__results">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="student-search__result" onClick={() => setStudent(c)}>
                      <span className="student-search__result-name">{c.full_name}</span>
                      <span className="student-search__result-number">{c.student_number}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        {student && (
          <form className="form" onSubmit={handleSubmit}>
            <NonFieldErrors errors={errors} />

            <div className="student-search__selected">
              <span>
                Enrolling <strong>{student.full_name}</strong> ({student.student_number})
              </span>
              {!preselectedStudentId && (
                <button type="button" className="button button--secondary" onClick={() => setStudent(null)}>
                  Change
                </button>
              )}
            </div>

            <fieldset>
              <legend>
                <span className="icon-badge">
                  <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
                Enrollment details
              </legend>

              <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} />
              <FieldErrors errors={errors} field="subjects" />

              <div className="form-row">
                <div className="field field--required">
                  <label htmlFor="start_date">Start date</label>
                  <DatePickerField id="start_date" value={startDate} onChange={setStartDate} />
                  <FieldErrors errors={errors} field="start_date" />
                  <FieldErrors errors={errors} field="end_date" />
                </div>

                <div className="field field--required">
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
                </div>

                <div className="field">
                  <label htmlFor="learning_mode">Learning mode</label>
                  <select id="learning_mode" value={learningMode} onChange={(e) => setLearningMode(e.target.value)}>
                    {LEARNING_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {LEARNING_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  <FieldErrors errors={errors} field="learning_mode" />
                </div>
              </div>
            </fieldset>

            <div className="form-actions">
              <Link className="button button--secondary" to="/students">
                Cancel
              </Link>
              <button type="submit" disabled={submitting}>
                {submitting ? 'Enrolling…' : 'Enroll'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
