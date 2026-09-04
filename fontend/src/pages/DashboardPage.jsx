import { ArrowUpRight, BookOpen, GraduationCap, MessagesSquare, PartyPopper, UserCog } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { academicsApi, clientsApi, enquiriesApi, enrollmentsApi, tutorsApi } from '../lib/api'
import { formatShortDate, isWithinDays } from '../lib/dateWindow'
import { getGreeting } from '../lib/greeting'

const ENROLLMENT_PERIOD_OPTIONS = [7, 14, 30, 60, 90]
const DEFAULT_ENROLLMENT_PERIOD_DAYS = 30

// Independent from the sidebar's NAV_ITEMS - these cards frame a metric
// rather than just a section link, so a couple scope differently from what
// their linked list page shows:
//  - Subjects counts only is_active ones ("Active Subjects").
//  - Users counts only teaching tutors ("Tutors"), not every staff role
//    (Owners/Admins are users too, but aren't tutors).
const DASHBOARD_CARDS = [
  {
    to: '/enquiries',
    label: 'Onboarding',
    icon: MessagesSquare,
    staffOnly: true,
    fetchCount: () => enquiriesApi.list().then((res) => res.count),
  },
  {
    to: '/students',
    label: 'Enrolled Students',
    icon: GraduationCap,
    staffOnly: true,
    fetchCount: () => clientsApi.searchStudents('').then((res) => res.count),
  },
  {
    to: '/subjects',
    label: 'Active Subjects',
    icon: BookOpen,
    staffOnly: false,
    // Counts active subjects on the first page - fine at this app's scale
    // (a single tutoring business), same assumption tutorsApi.listTeaching
    // already makes for the users list.
    fetchCount: () => academicsApi.listSubjects().then((res) => res.results.filter((s) => s.is_active).length),
  },
  {
    to: '/users',
    label: 'Tutors',
    icon: UserCog,
    staffOnly: true,
    fetchCount: () => tutorsApi.listTeaching().then((res) => res.length),
  },
]

// Fetches every enrollment once (already newest-first server-side, see
// Enrollment.Meta.ordering) - filtering by the chosen period then happens
// client-side (see `visibleEnrollments` below), so switching the period is
// instant with no refetch or loading flicker.
function useAllEnrollments(enabled) {
  const [state, setState] = useState({ loading: true, error: false, all: [] })

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    enrollmentsApi
      .list()
      .then((res) => {
        if (cancelled) return
        const all = res.results.map((e) => ({
          id: e.id,
          studentId: e.student,
          studentName: e.student_name,
          enrolledOn: new Date(e.created_at),
        }))
        setState({ loading: false, error: false, all })
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, error: true, all: [] })
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}

export function DashboardPage() {
  const { user, isStaffLevel } = useAuth()
  const sections = useMemo(
    () => DASHBOARD_CARDS.filter((item) => !item.staffOnly || isStaffLevel),
    [isStaffLevel],
  )
  const [counts, setCounts] = useState({})
  const [failedCounts, setFailedCounts] = useState({})
  const [periodDays, setPeriodDays] = useState(DEFAULT_ENROLLMENT_PERIOD_DAYS)
  const { loading: enrollmentsLoading, error: enrollmentsError, all: allEnrollments } = useAllEnrollments(isStaffLevel)
  const visibleEnrollments = useMemo(
    () => allEnrollments.filter((e) => isWithinDays(e.enrolledOn, periodDays)),
    [allEnrollments, periodDays],
  )

  useEffect(() => {
    let cancelled = false

    for (const section of sections) {
      section
        .fetchCount()
        .then((count) => {
          if (!cancelled) setCounts((prev) => ({ ...prev, [section.to]: count }))
        })
        .catch(() => {
          if (!cancelled) setFailedCounts((prev) => ({ ...prev, [section.to]: true }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [sections])

  const displayName = user?.full_name || user?.email

  return (
    <div className="page">
      <div className="page__header">
        <h1>
          {getGreeting()}, {displayName}
        </h1>
      </div>

      <div className="dashboard-grid">
        {sections.map((section) => {
          const Icon = section.icon
          const count = counts[section.to]
          const failed = failedCounts[section.to]
          return (
            <Link key={section.to} to={section.to} className="dashboard-card">
              <span className="dashboard-card__top">
                <span className="dashboard-card__icon">
                  <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <ArrowUpRight className="dashboard-card__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="dashboard-card__count">{failed ? '—' : (count ?? '···')}</span>
              <span className="dashboard-card__label">{section.label}</span>
            </Link>
          )
        })}
      </div>

      {isStaffLevel && (
        <section className="recent-enrollments">
          <div className="recent-enrollments__header">
            <div className="recent-enrollments__title">
              <PartyPopper size={16} strokeWidth={1.75} aria-hidden="true" />
              <h2>Recently enrolled</h2>
            </div>

            <div className="period-toggle" role="group" aria-label="Time period">
              {ENROLLMENT_PERIOD_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`period-toggle__option${days === periodDays ? ' period-toggle__option--active' : ''}`}
                  aria-pressed={days === periodDays}
                  onClick={() => setPeriodDays(days)}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          {enrollmentsLoading && <p className="recent-enrollments__status">Loading…</p>}
          {enrollmentsError && <p className="recent-enrollments__status">Could not load recent enrollments.</p>}
          {!enrollmentsLoading && !enrollmentsError && visibleEnrollments.length === 0 && (
            <p className="recent-enrollments__status">No enrollments in the last {periodDays} days.</p>
          )}

          {!enrollmentsLoading && !enrollmentsError && visibleEnrollments.length > 0 && (
            <ul className="recent-enrollments__list">
              {visibleEnrollments.map((item) => (
                <li key={item.id}>
                  <Link to={`/students/${item.studentId}`} className="recent-enrollments__row">
                    <span className="recent-enrollments__name">{item.studentName}</span>
                    <span className="recent-enrollments__date">{formatShortDate(item.enrolledOn)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
