import { ArrowLeft, BookOpen, GraduationCap, SquareArrowOutUpRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { canAssessSubject } from '../auth/permissions'
import { StudentAssessments } from '../components/assessments/StudentAssessments'
import { academicsApi, clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { yearGroupLabel } from '../lib/constants'
import { initials } from '../lib/initials'
import { usePageTitle } from '../lib/usePageTitle'

// One student, seen from inside one class: /subjects/:id/students/:studentId.
// This is a tutor's only view of a student - /students/:id is staff-only -
// so the student comes from the subject's own roster (which the backend
// already scopes to the tutor) rather than the students API.
export function StudentAssessmentPage() {
  const { id, studentId } = useParams()
  const { user, isStaffLevel } = useAuth()
  const [subject, setSubject] = useState(null)
  const [student, setStudent] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(student && subject ? `${student.full_name} · ${subject.name}` : undefined)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [subjectRes, rosterRes] = await Promise.all([
          academicsApi.getSubject(id),
          clientsApi.getSubjectRoster(id),
        ])
        if (cancelled) return
        const found = rosterRes.find((s) => String(s.id) === String(studentId))
        if (!found) {
          setError('not_found')
          return
        }
        setSubject(subjectRes)
        setStudent(found)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [id, studentId])

  if (loading) return <div className="page page-loading">Loading…</div>
  if (error === 'not_found') return <div className="page">Student not found in this class.</div>
  if (error) return <div className="page">Could not load this student.</div>

  const year = yearGroupLabel(student.year_group)

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
          {isStaffLevel && (
            <Link className="button button--secondary" to={`/students/${student.id}`}>
              <SquareArrowOutUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
              Full student record
            </Link>
          )}
          <Link className="button button--secondary" to={`/subjects/${id}`}>
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to {subject.name}
          </Link>
        </div>
      </div>

      <div className="detail-header__meta">
        <span className="detail-header__parent">
          <BookOpen size={14} strokeWidth={1.75} aria-hidden="true" />
          {subject.name}
        </span>
        {(year !== '—' || student.school) && (
          <span className="detail-header__parent">
            <GraduationCap size={14} strokeWidth={1.75} aria-hidden="true" />
            {[year === '—' ? null : year, student.school].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>

      <div className="form-card">
        <StudentAssessments
          studentId={student.id}
          studentName={student.full_name}
          composeSubject={canAssessSubject(user, subject) ? subject : null}
        />
      </div>
    </div>
  )
}
