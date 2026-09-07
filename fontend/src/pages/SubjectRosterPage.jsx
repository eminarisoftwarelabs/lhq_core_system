import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { academicsApi, clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

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

  if (loading) return <div className="page">Loading…</div>
  if (error === 'not_found') return <div className="page">Subject not found.</div>
  if (error) return <div className="page">Could not load this roster.</div>

  return (
    <div className="page">
      <div className="page-toolbar">
        <Link to={`/subjects/${id}`}>Back to subject</Link>
      </div>

      {students.length === 0 && <p>No active students enrolled in this subject yet.</p>}
      {students.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Number</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>
                  <Link to={`/students/${student.id}`}>{student.full_name}</Link>
                </td>
                <td>{student.student_number}</td>
                <td>{student.grade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
