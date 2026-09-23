import { ArrowLeft, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { academicsApi, clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { yearGroupLabel } from '../lib/constants'
import { initials } from '../lib/initials'
import { usePageTitle } from '../lib/usePageTitle'

// student_number/school/year group, in that order, dropping whatever's
// missing rather than leaving a stray " · " - a roster entry rarely has
// every field (year_group in particular predates a lot of client records).
function subtext(student) {
  const year = yearGroupLabel(student.year_group)
  return [student.student_number, student.school, year === '—' ? null : year].filter(Boolean).join(' · ')
}

export function SubjectRosterPage() {
  const { id } = useParams()
  const [subject, setSubject] = useState(null)
  const [students, setStudents] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  usePageTitle(subject ? `${subject.name} roster` : undefined)

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
        if (!cancelled) {
          setSubject(subjectRes)
          setStudents(rosterRes)
        }
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
  }, [id])

  if (loading) return <div className="page page-loading">Loading…</div>
  if (error === 'not_found') return <div className="page">Subject not found.</div>
  if (error) return <div className="page">Could not load this roster.</div>

  const count = students.length

  return (
    <div className="page">
      <div className="detail-header">
        <span className="icon-badge">
          <Users size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="detail-header__identity">
          <h1 className="detail-header__name">{subject.name} roster</h1>
        </div>
        <span
          className={`stage-badge enrollment-status-badge enrollment-status-badge--${count > 0 ? 'active' : 'inactive'}`}
        >
          {count} active {count === 1 ? 'student' : 'students'}
        </span>
        <div className="invoice-header-actions">
          <Link className="button button--secondary" to={`/subjects/${id}`}>
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden="true" />
            Back to subject
          </Link>
        </div>
      </div>

      <div className="form-card">
        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <Users size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Active students
          </div>

          {count === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">
                <Users size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <p>No active students enrolled in this subject yet.</p>
            </div>
          )}

          {count > 0 && (
            <ul className="roster-list">
              {students.map((student) => (
                <li key={student.id} className="roster-row">
                  <div className="roster-row__who">
                    <span className="avatar-badge avatar-badge--sm" aria-hidden="true">
                      {initials(student.full_name)}
                    </span>
                    <div className="directory-row__identity">
                      {/* The stretched-link pattern: this anchor's own text is just the
                          name, so its accessible name stays exactly that, but its ::after
                          (see index.css) covers the whole row via the row's
                          position:relative, making the entire row a click target. */}
                      <Link to={`/students/${student.id}`} className="roster-row__link">
                        {student.full_name}
                      </Link>
                      <span className="directory-row__subtext">{subtext(student)}</span>
                    </div>
                  </div>

                  <div className="directory-row__meta">
                    {student.grade && (
                      <span className="roster-grade-badge" aria-label={`Grade ${student.grade}`}>
                        {student.grade}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
