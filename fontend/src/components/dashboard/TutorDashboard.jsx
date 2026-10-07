import { ArrowUpRight, BookOpen, CalendarClock, GraduationCap, NotebookPen } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { academicsApi, clientsApi, lessonPlansApi } from '../../lib/api'
import { dayLabel, formatTime } from '../../lib/constants'
import { buildWeekClasses, countDistinctStudents } from '../../lib/tutorWeek'
import { formatWeekRange, weekStartOf } from '../../lib/weeks'

// Everything here comes from endpoints the backend already scopes to the
// tutor: their subjects, those subjects' rosters, and their lesson plans.
// Nothing school-wide is fetched or shown.
function useTutorWeek() {
  const [state, setState] = useState({ loading: true, failed: false, classes: [], studentCount: null })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = new Date()
      try {
        const subjects = await academicsApi.listAllSubjects({ is_active: true })
        // Plans and rosters are extras on top of the subject list - if
        // either fails, the classes still show, just without that detail.
        const [plansResult, ...rosterResults] = await Promise.allSettled([
          lessonPlansApi.list(weekStartOf(today)),
          ...subjects.map((subject) => clientsApi.getSubjectRoster(subject.id)),
        ])
        if (cancelled) return

        const rosters = {}
        rosterResults.forEach((result, i) => {
          if (result.status === 'fulfilled') rosters[subjects[i].id] = result.value
        })
        const plans = plansResult.status === 'fulfilled' ? plansResult.value : []

        setState({
          loading: false,
          failed: false,
          classes: buildWeekClasses(subjects, plans, rosters, today),
          studentCount: subjects.length === 0 ? 0 : countDistinctStudents(rosters),
          plansFailed: plansResult.status === 'rejected',
        })
      } catch {
        if (!cancelled) setState({ loading: false, failed: true, classes: [], studentCount: null })
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

function StatCard({ to, label, icon: Icon, value }) {
  return (
    <Link to={to} className="dashboard-card">
      <span className="dashboard-card__top">
        <span className="dashboard-card__icon">
          <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <ArrowUpRight className="dashboard-card__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="dashboard-card__count">{value}</span>
      <span className="dashboard-card__label">{label}</span>
    </Link>
  )
}

export function TutorDashboard() {
  const { loading, failed, classes, studentCount, plansFailed } = useTutorWeek()
  const weekStart = weekStartOf(new Date())

  const pending = loading ? '···' : '—'
  const planned = classes.filter((c) => c.topicName).length
  const ready = !loading && !failed

  return (
    <div className="page">
      <div className="dashboard-grid">
        <StatCard to="/subjects" label="My Subjects" icon={BookOpen} value={ready ? classes.length : pending} />
        <StatCard
          to="/subjects"
          label="My Students"
          icon={GraduationCap}
          value={ready && studentCount !== null ? studentCount : pending}
        />
        <StatCard
          to="/timetable"
          label="Topics this week"
          icon={NotebookPen}
          value={ready && !plansFailed ? `${planned}/${classes.length}` : pending}
        />
      </div>

      <section className="recent-enrollments">
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>This week's classes</h2>
          </div>
          <span className="recent-enrollments__date">{formatWeekRange(weekStart)}</span>
        </div>

        {loading && <p className="recent-enrollments__status">Loading…</p>}
        {failed && <p className="recent-enrollments__status">Could not load your classes.</p>}
        {ready && classes.length === 0 && (
          <p className="recent-enrollments__status">No subjects are assigned to you yet.</p>
        )}

        {ready && classes.length > 0 && (
          <ul className="recent-enrollments__list directory-card__list">
            {classes.map((item) => (
              <li key={item.id}>
                <Link to={`/subjects/${item.id}`} className="recent-enrollments__row recent-enrollments__row--rich">
                  <span className="directory-row__identity">
                    <span className="week-class__name">
                      {item.name}
                      {item.isToday && <span className="week-class__today">Today</span>}
                    </span>
                    <span className="directory-row__subtext">
                      {item.slot
                        ? `${dayLabel(item.slot.day_of_week)} ${formatTime(item.slot.start_time)}–${formatTime(item.slot.end_time)}`
                        : 'Not on the timetable yet'}
                      {item.studentCount !== null &&
                        ` · ${item.studentCount} ${item.studentCount === 1 ? 'student' : 'students'}`}
                    </span>
                  </span>

                  <span className="directory-row__meta">
                    {item.topicName ? (
                      <span className="week-class__topic">{item.topicName}</span>
                    ) : (
                      !plansFailed && <span className="week-class__topic week-class__topic--missing">No topic planned</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
