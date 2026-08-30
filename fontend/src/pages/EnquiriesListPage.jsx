import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { enquiriesApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { ENQUIRY_STAGES, STAGE_LABELS } from '../lib/constants'

export function EnquiriesListPage() {
  const [stage, setStage] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await enquiriesApi.list(stage ? { stage } : {})
        if (!cancelled) setData(res)
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load enquiries.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [stage])

  return (
    <div className="page">
      <div className="page__header">
        <h1>Enquiries</h1>
        <Link className="button" to="/enquiries/new">
          New enquiry
        </Link>
      </div>

      <label htmlFor="stage_filter">Filter by stage</label>
      <select id="stage_filter" value={stage} onChange={(e) => setStage(e.target.value)}>
        <option value="">All stages</option>
        {ENQUIRY_STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABELS[s]}
          </option>
        ))}
      </select>

      {loading && <p>Loading…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && data.results.length === 0 && <p>No enquiries found.</p>}

      {!loading && !error && data && data.results.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Parent</th>
              <th>Stage</th>
              <th>Desired start</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((enquiry) => (
              <tr key={enquiry.id}>
                <td>
                  <Link to={`/enquiries/${enquiry.id}`}>{enquiry.student_name}</Link>
                </td>
                <td>{enquiry.parent.full_name}</td>
                <td>{STAGE_LABELS[enquiry.stage]}</td>
                <td>{enquiry.desired_start_date || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
