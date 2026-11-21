import { ChevronDown, GraduationCap, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { defaultOpenMonths, fetchAllPages, groupByEnrolmentMonth } from '../lib/enrolmentMonths'
import { clientsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { usePageTitle } from '../lib/usePageTitle'

// Students by the month they enrolled, newest first, names only. Every page
// is read so a month is never split across pages with a wrong count.
export function StudentsListPage() {
  usePageTitle('Students')
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  // key -> true/false once the user has opened or closed a month.
  const [toggled, setToggled] = useState({})
  const groups = useMemo(
    () =>
      groupByEnrolmentMonth(students ?? []).map((group) => ({
        ...group,
        students: [...group.students].sort((a, b) => a.full_name.localeCompare(b.full_name)),
      })),
    [students],
  )
  const searching = query.trim() !== ''
  const defaultOpen = useMemo(() => defaultOpenMonths(groups), [groups])
  const isOpen = (key) => searching || (key in toggled ? toggled[key] : defaultOpen.has(key))

  useEffect(() => {
    let cancelled = false
    const handle = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await fetchAllPages((page) => clientsApi.searchStudents(query, page))
        if (!cancelled) setStudents(rows)
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

  const ready = !loading && !error && students
  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <GraduationCap size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>Students</h2>
          </div>

          <div className="field search-field">
            <label htmlFor="q">Search by name or student number</label>
            <div className="search-field__control">
              <Search size={16} strokeWidth={1.75} className="search-field__icon" aria-hidden="true" />
              <input
                id="q"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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

        {ready && groups.length === 0 && (
          <div className="empty-state">
            <span className="empty-state__icon">
              <GraduationCap size={22} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <p>No students found.</p>
          </div>
        )}

        {ready &&
          groups.map((group) => {
            const open = isOpen(group.key)
            const count = group.students.length
            return (
              <section key={group.key} className="month-group">
                <h3 className="month-group__heading">
                  <button
                    type="button"
                    className="month-group__toggle"
                    aria-expanded={open}
                    aria-controls={`month-${group.key}`}
                    onClick={() => setToggled((prev) => ({ ...prev, [group.key]: !open }))}
                  >
                    <ChevronDown size={18} strokeWidth={2} className="month-group__chevron" aria-hidden="true" />
                    {group.label}
                    <span className="month-group__count">
                      {count} {count === 1 ? 'student' : 'students'}
                    </span>
                  </button>
                </h3>
                <ul id={`month-${group.key}`} className="month-group__grid" hidden={!open} aria-label={group.label}>
                  {group.students.map((student) => (
                    <li key={student.id}>
                      <Link to={`/students/${student.id}`} className="month-group__name">
                        {student.full_name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
      </section>
    </div>
  )
}
