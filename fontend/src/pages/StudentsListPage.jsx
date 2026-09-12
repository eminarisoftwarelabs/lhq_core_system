import { GraduationCap, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clientsApi, enrollmentsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { ENROLLMENT_STATUS_LABELS, LEARNING_MODE_LABELS } from '../lib/constants'
import { formatShortDate } from '../lib/dateWindow'
import { usePageTitle } from '../lib/usePageTitle'

// Must match PAGE_SIZE in the backend's settings.py - the API doesn't expose
// its own page size, so this mirrors it the same way UsersListPage already
// does for its own Previous/Next controls.
const PAGE_SIZE = 20

// The enrollment status shown per student has to be correct regardless of
// which page of students is on screen, so - unlike the paged student list
// itself - this always needs the complete set: a single `fetchPage(1)` call
// would silently miss any enrollment past the first page while reporting
// the true total in `count`, so this walks every page rather than
// assuming one is enough.
async function fetchAllPages(fetchPage) {
  const first = await fetchPage(1)
  const results = [...first.results]
  let next = first.next
  let page = 1
  while (next) {
    page += 1
    const res = await fetchPage(page)
    results.push(...res.results)
    next = res.next
  }
  return { count: first.count, results }
}

// One enrollment per student, chosen so the directory reflects "what's
// actually going on" rather than just the newest row - an ACTIVE enrollment
// always wins over a withdrawn/completed one even if it's not the most
// recently created, falling back to the newest when nothing is active.
function useEnrollmentByStudentId() {
  const [enrollments, setEnrollments] = useState([])

  useEffect(() => {
    let cancelled = false
    fetchAllPages((page) => enrollmentsApi.list({ page }))
      .then((res) => {
        if (!cancelled) setEnrollments(res.results)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => {
    const map = {}
    for (const enrollment of enrollments) {
      const current = map[enrollment.student]
      if (!current || (enrollment.status === 'ACTIVE' && current.status !== 'ACTIVE')) {
        map[enrollment.student] = enrollment
      }
    }
    return map
  }, [enrollments])
}

export function StudentsListPage() {
  usePageTitle('Students')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const enrollmentByStudentId = useEnrollmentByStudentId()
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await clientsApi.searchStudents(query, page)
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
  }, [query, page])

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Students</h2>
            {!loading && !error && data && <span className="onboarding-section__count">{data.count}</span>}
          </div>

          <div className="field search-field">
            <label htmlFor="q">Search by name or student number</label>
            <div className="search-field__control">
              <Search size={16} strokeWidth={1.75} className="search-field__icon" aria-hidden="true" />
              <input
                id="q"
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="e.g. Alice or STU-000001"
              />
            </div>
          </div>
        </div>

        {loading && <p className="recent-enrollments__status">Loading…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && data && data.results.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <GraduationCap size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>No students found.</p>
          </div>
        )}

        {!loading && !error && data && data.results.length > 0 && (
          <ul className="recent-enrollments__list directory-card__list">
            {data.results.map((student) => {
              const enrollment = enrollmentByStudentId[student.id]
              return (
                <li key={student.id}>
                  <Link to={`/students/${student.id}`} className="recent-enrollments__row recent-enrollments__row--rich">
                    <span className="directory-row__identity">
                      <span>{student.full_name}</span>
                      <span className="directory-row__subtext">
                        {[student.student_number, student.school].filter(Boolean).join(' · ')}
                      </span>
                    </span>

                    <span className="directory-row__meta">
                      {enrollment ? (
                        <>
                          <span
                            className={`stage-badge enrollment-status-badge enrollment-status-badge--${enrollment.status.toLowerCase()}`}
                          >
                            {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                          </span>
                          <span className="directory-row__detail">
                            {enrollment.subject_names.join(', ') || '—'} · {LEARNING_MODE_LABELS[enrollment.learning_mode]}
                          </span>
                          <span className="directory-row__detail">
                            Enrolled {formatShortDate(new Date(enrollment.created_at))}
                          </span>
                        </>
                      ) : (
                        <span className="directory-row__detail directory-row__detail--muted">Not enrolled</span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}

        {!loading && !error && totalPages > 1 && (
          <div className="pagination">
            <button type="button" disabled={!data.previous} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button type="button" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
