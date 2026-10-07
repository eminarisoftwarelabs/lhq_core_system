import { ChevronRight, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { canAssessSubject } from '../auth/permissions'
import { useAuth } from '../auth/useAuth'
import { clientsApi } from '../lib/api'
import { yearGroupLabel } from '../lib/constants'
import { initials } from '../lib/initials'

// student_number/school/year group, in that order, dropping whatever's
// missing rather than leaving a stray " · " - a roster entry rarely has
// every field (year_group in particular predates a lot of client records).
function subtext(student) {
  const year = yearGroupLabel(student.year_group)
  return [student.student_number, student.school, year === '—' ? null : year].filter(Boolean).join(' · ')
}

// The class roster card on SubjectDetailPage: the subject's active
// students. Loads on its own so a roster failure never takes the rest of
// the subject page down with it.
export function SubjectRoster({ subject }) {
  const { user, isStaffLevel } = useAuth()
  const [students, setStudents] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false

    clientsApi
      .getSubjectRoster(subject.id)
      .then((res) => {
        if (!cancelled) setStudents(res)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [subject.id])

  // Whoever teaches this class lands on the student's assessment page for
  // it; so does anyone who can't open the staff-only student record at
  // all. Staff who don't teach it keep going to the full record, which
  // shows the same assessments read-only.
  const linksToAssessments = !isStaffLevel || canAssessSubject(user, subject)
  const studentPath = (student) =>
    linksToAssessments ? `/subjects/${subject.id}/students/${student.id}` : `/students/${student.id}`

  const count = students?.length ?? 0

  return (
    <div className="detail-section">
      <div className="detail-section__header">
        <span className="icon-badge">
          <Users size={16} strokeWidth={1.75} aria-hidden="true" />
        </span>
        Class roster
        {students && (
          <span
            className={`stage-badge enrollment-status-badge enrollment-status-badge--${count > 0 ? 'active' : 'inactive'} detail-section__badge`}
          >
            {count} active {count === 1 ? 'student' : 'students'}
          </span>
        )}
      </div>

      {!students && !failed && <p className="form-note">Loading…</p>}
      {failed && (
        <p className="form-error" role="alert">
          Could not load the class roster.
        </p>
      )}

      {students && count === 0 && (
        <div className="empty-state empty-state--compact">
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
                  <Link to={studentPath(student)} className="roster-row__link">
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
                <ChevronRight className="roster-row__chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
