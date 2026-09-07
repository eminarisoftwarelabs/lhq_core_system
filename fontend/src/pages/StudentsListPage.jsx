import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

export function StudentsListPage() {
  usePageTitle('Students')
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await clientsApi.searchStudents(query)
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load students.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [query])

  return (
    <div className="page">
      <label htmlFor="q">Search by name or student number</label>
      <input
        id="q"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. Alice or STU-000001"
      />

      {loading && <p>Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.results.length === 0 && <p>No students found.</p>}

      {!loading && !error && data && data.results.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Student number</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((student) => (
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
