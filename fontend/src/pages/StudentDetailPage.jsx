import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { clientsApi, enrollmentsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, ENROLLMENT_STATUS_LABELS, formatTime, LEARNING_MODE_LABELS } from '../lib/constants'

export function StudentDetailPage() {
  const { id } = useParams()
  const [student, setStudent] = useState(null)
  const [timetable, setTimetable] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState(null)
  const [withdrawingId, setWithdrawingId] = useState(null)

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

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">Student not found.</div>
  if (error) return <div className="page">Could not load this student.</div>

  return (
    <div className="page">
      <div className="page__header">
        <h1>
          {student.full_name} <small>({student.student_number})</small>
        </h1>
        <Link className="button" to={`/enrollments/new?student=${student.id}`}>
          New enrollment
        </Link>
      </div>

      <p>Grade: {student.grade}</p>

      <h2>Guardians</h2>
      {student.guardianships.length === 0 && <p>No guardians on file.</p>}
      {student.guardianships.length > 0 && (
        <ul>
          {student.guardianships.map((g) => (
            <li key={g.id}>
              {g.parent.full_name} — {g.relationship}
              {g.is_primary_contact && ' (primary contact)'}
              {g.parent.phone && ` · ${g.parent.phone}`}
              {g.parent.email && ` · ${g.parent.email}`}
            </li>
          ))}
        </ul>
      )}

      <h2>Timetable</h2>
      {timetable.length === 0 && <p>No active subjects.</p>}
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

      <h2>Enrollments</h2>
      {actionError && (
        <p className="form-error" role="alert">
          {actionError}
        </p>
      )}
      {enrollments.length === 0 && <p>No enrollments yet.</p>}
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
                <td>{ENROLLMENT_STATUS_LABELS[enrollment.status]}</td>
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
  )
}
