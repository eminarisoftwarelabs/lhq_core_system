import { ArrowUpRight, BookOpen, GraduationCap, MessagesSquare, UserCog } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { academicsApi, clientsApi, enquiriesApi, tutorsApi } from '../lib/api'
import { getGreeting } from '../lib/greeting'

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

export function DashboardPage() {
  const { user, isStaffLevel } = useAuth()
  const sections = useMemo(
    () => DASHBOARD_CARDS.filter((item) => !item.staffOnly || isStaffLevel),
    [isStaffLevel],
  )
  const [counts, setCounts] = useState({})
  const [failedCounts, setFailedCounts] = useState({})

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
                  <Icon size={26} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <ArrowUpRight className="dashboard-card__arrow" size={20} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="dashboard-card__count">{failed ? '—' : (count ?? '···')}</span>
              <span className="dashboard-card__label">{section.label}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
