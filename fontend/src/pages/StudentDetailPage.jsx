import { BookOpen, CalendarClock, GraduationCap, Phone, Plus, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clientsApi, enrollmentsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, ENROLLMENT_STATUS_LABELS, formatTime, LEARNING_MODE_LABELS, yearGroupLabel } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

function initials(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase()
}

export function StudentDetailPage() {
  const { id } = useParams()
  const [student, setStudent] = useState(null)
  const [timetable, setTimetable] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState(null)
  const [withdrawingId, setWithdrawingId] = useState(null)
  usePageTitle(student ? `${student.full_name} (${student.student_number})` : undefined)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [studentRes, timetableRes, enrollmentsRes] = await Promise.all([
        clientsApi.getStudent(id),
        clientsApi.getStudentTimetable(id),
        enrollmentsApi.listForStudent(id),
      ])
      setStudent(studentRes)
      setTimetable(timetableRes)
      setEnrollments(enrollmentsRes.results)
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'not_found' : 'load_failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // loadAll is also called after a withdraw action, so it stays a shared
    // function rather than an effect-local closure.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleWithdraw(enrollment) {
    const reason = window.prompt(`Withdraw ${student.full_name} from this enrollment? Reason (optional):`)
    if (reason === null) return

    setActionError(null)
    setWithdrawingId(enrollment.id)
    try {
      await enrollmentsApi.withdraw(enrollment.id, reason)
      await loadAll()
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not withdraw this enrollment.')
    } finally {
      setWithdrawingId(null)
    }
  }

  if (loading) return <div className="page page-loading">Loading…</div>
  if (error === 'not_found') return <div className="page">Student not found.</div>
  if (error) return <div className="page">Could not load this student.</div>

  const hasActiveEnrollment = enrollments.some((e) => e.status === 'ACTIVE')

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
        <span
          className={`stage-badge enrollment-status-badge enrollment-status-badge--${hasActiveEnrollment ? 'active' : 'inactive'}`}
        >
          {hasActiveEnrollment ? 'Active student' : 'No active enrollment'}
        </span>
        <div className="invoice-header-actions">
          <Link className="button" to={`/enrollments/new?student=${student.id}`}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            New enrollment
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
        {(student.phone || student.email) && (
          <span className="detail-header__parent">
            <Phone size={14} strokeWidth={1.75} aria-hidden="true" />
            {student.phone}
            {student.phone && student.email && ' · '}
            {student.email}
          </span>
        )}
      </div>

      <div className="form-card">
        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <Users size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Guardians
          </div>
          {student.guardianships.length === 0 && <p className="form-note">No guardians on file.</p>}
          {student.guardianships.length > 0 && (
            <ul className="guardian-list">
              {student.guardianships.map((g) => (
                <li key={g.id} className="guardian-list__item">
                  <span className="avatar-badge avatar-badge--sm" aria-hidden="true">
                    {initials(g.parent.full_name)}
                  </span>
                  <div className="guardian-list__body">
                    <span className="guardian-list__name">
                      <span>{g.parent.full_name}</span>
                      {g.is_primary_contact && <span className="guardian-list__primary-badge">Primary</span>}
                    </span>
                    <span className="guardian-list__meta">
                      {g.relationship}
                      {g.parent.phone && ` · ${g.parent.phone}`}
                      {g.parent.email && ` · ${g.parent.email}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Timetable
          </div>
          {timetable.length === 0 && <p className="form-note">No active subjects.</p>}
          {timetable.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Day</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {timetable.map((entry) => (
                  <tr key={entry.subject_id}>
                    <td>{entry.subject_name}</td>
                    <td>{entry.day_of_week !== null ? dayLabel(entry.day_of_week) : 'Not set'}</td>
                    <td>
                      {entry.start_time ? `${formatTime(entry.start_time)}–${formatTime(entry.end_time)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="detail-section">
          <div className="detail-section__header">
            <span className="icon-badge">
              <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            Enrollments
          </div>
          {actionError && (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          )}
          {enrollments.length === 0 && <p className="form-note">No enrollments yet.</p>}
          {enrollments.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subjects</th>
                  <th>Dates</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td>{enrollment.subject_names.join(', ') || '—'}</td>
                    <td>
                      {enrollment.start_date} – {enrollment.end_date}
                    </td>
                    <td>{LEARNING_MODE_LABELS[enrollment.learning_mode]}</td>
                    <td>
                      <span
                        className={`stage-badge enrollment-status-badge enrollment-status-badge--${enrollment.status.toLowerCase()}`}
                      >
                        {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                      </span>
                    </td>
                    <td>
                      {enrollment.status === 'ACTIVE' && (
                        <button
                          type="button"
                          className="button-danger"
                          disabled={withdrawingId === enrollment.id}
                          onClick={() => handleWithdraw(enrollment)}
                        >
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
