import { BookOpen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { academicsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, formatTime } from '../lib/constants'
import { usePageTitle } from '../lib/usePageTitle'

// Must match PAGE_SIZE in the backend's settings.py - the API doesn't expose
// its own page size, so this mirrors it the same way UsersListPage and
// StudentsListPage already do for their own Previous/Next controls.
const PAGE_SIZE = 20

export function SubjectsListPage() {
  const { isStaffLevel } = useAuth()
  usePageTitle('Subjects')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await academicsApi.listSubjects({ page })
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
  }, [page])

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Subjects</h2>
            {!loading && !error && data && <span className="onboarding-section__count">{data.count}</span>}
          </div>

          {isStaffLevel && (
            <Link className="button" to="/subjects/new">
              Add subject
            </Link>
          )}
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
              <BookOpen size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>No subjects found.</p>
          </div>
        )}

        {!loading && !error && data && data.results.length > 0 && (
          <ul className="recent-enrollments__list directory-card__list">
            {data.results.map((subject) => (
              <li key={subject.id}>
                <Link to={`/subjects/${subject.id}`} className="recent-enrollments__row recent-enrollments__row--rich">
                  <span className="directory-row__identity">
                    <span>{subject.name}</span>
                    <span className="directory-row__subtext">{subject.tutor_name || 'Unassigned'}</span>
                  </span>

                  <span className="directory-row__meta">
                    <span
                      className={`stage-badge subject-status-badge subject-status-badge--${subject.is_active ? 'active' : 'inactive'}`}
                    >
                      {subject.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <span className="directory-row__detail">
                      {subject.timetable_slot
                        ? `${dayLabel(subject.timetable_slot.day_of_week)} ${formatTime(subject.timetable_slot.start_time)}–${formatTime(subject.timetable_slot.end_time)}`
                        : 'No timetable slot'}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
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
