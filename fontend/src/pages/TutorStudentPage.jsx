import { ArrowLeft, GraduationCap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { StudentNotesPanel } from '../components/StudentNotesPanel'
import { clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { yearGroupLabel } from '../lib/constants'
import { initials } from '../lib/initials'
import { usePageTitle } from '../lib/usePageTitle'

// A tutor's view of one of their students: who they are and the
// assessments on their record. Deliberately without guardians, contact
// details, enrollments or timetable - the API doesn't send them to a tutor
// either.
export function TutorStudentPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const [student, setStudent] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(student ? `${student.full_name} (${student.student_number})` : undefined)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await clientsApi.getStudent(id)
        if (!cancelled) setStudent(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) return <div className="page page-loading">Loading…</div>
  if (error === 'not_found') return <div className="page">Student not found.</div>
  if (error) return <div className="page">Could not load this student.</div>

  const requestedSubject = searchParams.get('subject')
  const rosterSubject =
    student.shared_subjects.find((s) => String(s.id) === requestedSubject) ?? student.shared_subjects[0]

  return (
    <div className="page">
      <div className="detail-header">
        <span className="avatar-badge" aria-hidden="true">
          {initials(student.full_name)}
        </span>
        <div className="detail-header__identity">
          <h1 className="detail-header__name">{student.full_name}</h1>
          <span className="detail-header__number">{student.student_number}</span>
        </div>
        <div className="invoice-header-actions">
          <Link
            className="button button--secondary"
            to={rosterSubject ? `/subjects/${rosterSubject.id}/roster` : '/subjects'}
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to roster
          </Link>
        </div>
      </div>

      <div className="detail-header__meta">
        <span className="detail-header__parent">
          <GraduationCap size={14} strokeWidth={1.75} aria-hidden="true" />
          {yearGroupLabel(student.year_group)}
          {student.school && ` · ${student.school}`}
          {student.grade && ` · Grade: ${student.grade}`}
        </span>
      </div>

      <div className="form-card">
        <StudentNotesPanel
          studentId={student.id}
          sharedSubjects={student.shared_subjects}
          preferredSubjectId={rosterSubject?.id}
        />
      </div>
    </div>
  )
}
