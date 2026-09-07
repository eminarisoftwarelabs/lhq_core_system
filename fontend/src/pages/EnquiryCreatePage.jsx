import { BookOpen, GraduationCap, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SubjectMultiSelect } from '../components/SubjectMultiSelect'
import { FieldErrors, NonFieldErrors } from '../components/FieldErrors'
import { useToast } from '../components/toast/useToast'
import { DatePickerField } from '../components/ui/DatePickerField'
import { academicsApi, enquiriesApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { LEARNING_MODE_LABELS, LEARNING_MODES, YEAR_GROUPS, yearGroupLabel } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

export function EnquiryCreatePage() {
  usePageTitle('New enquiry')
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [subjects, setSubjects] = useState([])
  const [subjectIds, setSubjectIds] = useState([])
  const [schools, setSchools] = useState([])

  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [parentEmail, setParentEmail] = useState('')
  const [parentAddress, setParentAddress] = useState('')
  const [parentCity, setParentCity] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentYearGroup, setStudentYearGroup] = useState('')
  // schoolChoice drives the <select> - either a known school's name, '', or
  // the OTHER sentinel, which reveals a free-text field. studentSchool is
  // the actual value submitted: kept in lockstep with schoolChoice except
  // while OTHER is picked, when it holds whatever the free-text field says.
  const [schoolChoice, setSchoolChoice] = useState('')
  const [studentSchool, setStudentSchool] = useState('')
  const [studentPhone, setStudentPhone] = useState('')
  const [studentEmail, setStudentEmail] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [durationWeeks, setDurationWeeks] = useState('')
  const [learningMode, setLearningMode] = useState('')
  const [desiredStartDate, setDesiredStartDate] = useState('')

  const [errors, setErrors] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    academicsApi.listSubjects({ is_active: true }).then((res) => setSubjects(res.results))
    academicsApi.listSchools({ is_active: true }).then((res) => setSchools(res.results))
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
        address: parentAddress,
        city: parentCity,
      },
      student_name: studentName,
      student_year_group: studentYearGroup ? Number(studentYearGroup) : null,
      student_school: studentSchool,
      student_phone: studentPhone,
      student_email: studentEmail,
      student_grade: studentGrade,
      subject_ids: subjectIds,
      duration_weeks: durationWeeks ? Number(durationWeeks) : null,
      learning_mode: learningMode || null,
      desired_start_date: desiredStartDate || null,
    }

    try {
      await enquiriesApi.create(payload)
      showToast('New enquiry created')
      navigate('/enquiries', { replace: true })
    } catch (err) {
      setErrors(err instanceof ApiError && err.data ? err.data : { detail: 'Could not create the enquiry.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page page--enquiry-create">
      <div className="form-card">
        <form className="form" onSubmit={handleSubmit}>
          <NonFieldErrors errors={errors} />

          <fieldset>
            <legend>
              <span className="icon-badge">
                <Users size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Parent
            </legend>
            <div className="form-row">
              <div className="field field--full field--required">
                <label htmlFor="parent_full_name">Full name</label>
                <input
                  id="parent_full_name"
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  required
                />
                <FieldErrors errors={errors} field="parent" />
              </div>

              <div className="field field--required">
                <label htmlFor="parent_phone">Phone</label>
                <input
                  id="parent_phone"
                  type="text"
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="parent_email">Email</label>
                <input
                  id="parent_email"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="parent_address">Address</label>
                <input
                  id="parent_address"
                  type="text"
                  placeholder="Street / residential address"
                  value={parentAddress}
                  onChange={(e) => setParentAddress(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="parent_city">City</label>
                <input
                  id="parent_city"
                  type="text"
                  value={parentCity}
                  onChange={(e) => setParentCity(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>
              <span className="icon-badge">
                <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Student
            </legend>
            <div className="form-row">
              <div className="field field--full field--required">
                <label htmlFor="student_name">Student name</label>
                <input
                  id="student_name"
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  required
                />
                <FieldErrors errors={errors} field="student_name" />
              </div>

              <div className="field field--required">
                <label htmlFor="student_year_group">Year / class</label>
                <select
                  id="student_year_group"
                  value={studentYearGroup}
                  onChange={(e) => setStudentYearGroup(e.target.value)}
                  required
                >
                  <option value="">Select year</option>
                  {YEAR_GROUPS.map((year) => (
                    <option key={year} value={year}>
                      {yearGroupLabel(year)}
                    </option>
                  ))}
                </select>
                <FieldErrors errors={errors} field="student_year_group" />
              </div>

              <div className="field">
                <label htmlFor="student_grade">Grade</label>
                <input
                  id="student_grade"
                  type="text"
                  placeholder="Optional"
                  value={studentGrade}
                  onChange={(e) => setStudentGrade(e.target.value)}
                />
                <FieldErrors errors={errors} field="student_grade" />
              </div>

              <div className="field field--full field--required">
                <label htmlFor="student_school">School</label>
                <select
                  id="student_school"
                  value={schoolChoice}
                  onChange={(e) => {
                    const value = e.target.value
                    setSchoolChoice(value)
                    setStudentSchool(value === 'OTHER' ? '' : value)
                  }}
                  required
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.name}>
                      {school.name}
                    </option>
                  ))}
                  <option value="OTHER">Other</option>
                </select>
                {schoolChoice === 'OTHER' && (
                  <input
                    type="text"
                    className="field__other-input"
                    placeholder="Enter school name"
                    aria-label="School name"
                    value={studentSchool}
                    onChange={(e) => setStudentSchool(e.target.value)}
                    required
                  />
                )}
                <FieldErrors errors={errors} field="student_school" />
              </div>

              <div className="field">
                <label htmlFor="student_phone">Student phone</label>
                <input
                  id="student_phone"
                  type="text"
                  placeholder="Optional"
                  value={studentPhone}
                  onChange={(e) => setStudentPhone(e.target.value)}
                />
                <FieldErrors errors={errors} field="student_phone" />
              </div>

              <div className="field">
                <label htmlFor="student_email">Student email</label>
                <input
                  id="student_email"
                  type="email"
                  placeholder="Optional"
                  value={studentEmail}
                  onChange={(e) => setStudentEmail(e.target.value)}
                />
                <FieldErrors errors={errors} field="student_email" />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>
              <span className="icon-badge">
                <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              Program details
            </legend>

            <SubjectMultiSelect subjects={subjects} selectedIds={subjectIds} onChange={setSubjectIds} />
            <FieldErrors errors={errors} field="subject_ids" />

            <div className="form-row">
              <div className="field">
                <label htmlFor="duration_weeks">Duration (weeks)</label>
                <input
                  id="duration_weeks"
                  type="number"
                  min="1"
                  value={durationWeeks}
                  onChange={(e) => setDurationWeeks(e.target.value)}
                />
                <FieldErrors errors={errors} field="duration_weeks" />
              </div>

              <div className="field">
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
              </div>

              <div className="field field--full">
                <label htmlFor="desired_start_date">Desired start date</label>
                <DatePickerField id="desired_start_date" value={desiredStartDate} onChange={setDesiredStartDate} />
                <p className="form-note">Required before an invoice can be generated for this enquiry.</p>
                <FieldErrors errors={errors} field="desired_start_date" />
              </div>
            </div>
          </fieldset>

          <div className="form-actions">
            <Link to="/enquiries" className="button button--secondary">
              Cancel
            </Link>
            <button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create enquiry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
