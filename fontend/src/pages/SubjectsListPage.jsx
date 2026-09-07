import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { academicsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

export function SubjectsListPage() {
  const { isStaffLevel } = useAuth()
  usePageTitle('Subjects')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await academicsApi.listSubjects()
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load subjects.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page">
      {isStaffLevel && (
        <div className="page-toolbar">
          <Link className="button" to="/subjects/new">
            Add subject
          </Link>
        </div>
      )}

      {loading && <p>Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.results.length === 0 && <p>No subjects found.</p>}

      {!loading && !error && data && data.results.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tutor</th>
              <th>Status</th>
              <th>Timetable</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((subject) => (
              <tr key={subject.id}>
                <td>
                  <Link to={`/subjects/${subject.id}`}>{subject.name}</Link>
                </td>
                <td>{subject.tutor_name || 'Unassigned'}</td>
                <td>{subject.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                  {subject.timetable_slot
                    ? `${subject.timetable_slot.start_time.slice(0, 5)}–${subject.timetable_slot.end_time.slice(0, 5)}`
                    : 'Not set'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
