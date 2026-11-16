import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarClock, UserCog } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { academicsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { dayLabel, formatTime } from '../lib/constants'
import { groupByLevel, tutorNames } from '../lib/tutorTeaching'
import { usePageTitle } from '../lib/usePageTitle'

function slotLabel(slot) {
  return slot ? `${dayLabel(slot.day_of_week)} ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}` : 'No lesson time yet'
}

function Badges({ subject, showTaught }) {
  return (
    <>
      {subject.has_paper && <span className="stage-badge paper-badge">Core / Extended</span>}
      {showTaught && subject.taught_by_me && <span className="stage-badge taught-badge">You teach this</span>}
      {!subject.is_active && (
        <span className="stage-badge subject-status-badge subject-status-badge--inactive">Inactive</span>
      )}
    </>
  )
}

// A tutor's home view: the subjects they teach as cards, in level order.
function MySubjects({ subjects }) {
  const mine = groupByLevel(subjects.filter((s) => s.taught_by_me)).flatMap((group) => group.subjects)

  if (mine.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon">
          <BookOpen size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p>You don’t teach any subjects yet.</p>
        <p className="form-note">
          Ask to add some from <Link to="/me">My Profile</Link>, or browse all subjects to see the catalog.
        </p>
      </div>
    )
  }

  return (
    <ul className="my-subjects" aria-label="My subjects">
      {mine.map((subject) => (
        <li key={subject.id}>
          <Link to={`/subjects/${subject.id}`} className="dashboard-card my-subject-card">
            <span className="dashboard-card__top">
              <span className="dashboard-card__icon">
                <BookOpen size={22} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <ArrowUpRight className="dashboard-card__arrow" size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="my-subject-card__name">{subject.name}</span>
            <span className="my-subject-card__meta">
              {[subject.level_name, subject.code].filter(Boolean).join(' · ')}
              <Badges subject={subject} showTaught={false} />
            </span>
            <span className="my-subject-card__slot">
              <CalendarClock size={14} strokeWidth={1.75} aria-hidden="true" />
              {slotLabel(subject.timetable_slot)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// The whole catalog, grouped by level. Staff always see this, with who
// teaches each subject; a tutor reaches it from "Browse all subjects".
function Catalog({ subjects, isStaffLevel }) {
  if (subjects.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-state__icon">
          <BookOpen size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <p>No subjects yet. Run seed_cambridge_topics to load the Cambridge catalog.</p>
      </div>
    )
  }

  return groupByLevel(subjects).map((group) => (
    <section key={group.levelId ?? 'none'} className="level-group" aria-labelledby={`level-${group.levelId}`}>
      <h3 id={`level-${group.levelId}`} className="level-group__title">
        {group.levelName}
        <span className="onboarding-section__count">{group.subjects.length}</span>
      </h3>
      <ul className="recent-enrollments__list directory-card__list">
        {group.subjects.map((subject) => {
          const names = tutorNames(subject)
          return (
            <li key={subject.id}>
              <Link to={`/subjects/${subject.id}`} className="recent-enrollments__row recent-enrollments__row--rich">
                <span className="directory-row__identity">
                  <span>{subject.name}</span>
                  <span className="directory-row__subtext">{subject.code || 'No syllabus code'}</span>
                </span>

                <span className="directory-row__meta">
                  <span className="directory-row__badges">
                    <Badges subject={subject} showTaught />
                  </span>
                  {isStaffLevel && (
                    <span className={`directory-row__detail${names ? '' : ' directory-row__detail--muted'}`}>
                      <UserCog size={14} strokeWidth={1.75} aria-hidden="true" />
                      {names || 'No tutors yet'}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  ))
}

// Staff: the catalog. Tutors: their own subjects first, with the full
// catalog one link away (?view=all, so Back returns to the same view).
export function SubjectsListPage() {
  const { isStaffLevel } = useAuth()
  const [searchParams] = useSearchParams()
  const showMine = !isStaffLevel && searchParams.get('view') !== 'all'
  usePageTitle(isStaffLevel ? 'Subjects' : showMine ? 'My subjects' : 'All subjects')
  const [subjects, setSubjects] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    academicsApi
      .listAllSubjects()
      .then((res) => {
        if (!cancelled) setSubjects(res)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load subjects.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const title = isStaffLevel ? 'Subjects' : showMine ? 'My subjects' : 'All subjects'
  const count = subjects && (showMine ? subjects.filter((s) => s.taught_by_me).length : subjects.length)

  return (
    <div className="page">
      <section className="recent-enrollments directory-card">
        {!isStaffLevel && !showMine && (
          <Link to="/subjects" className="subjects-view-link subjects-view-link--back">
            <ArrowLeft size={14} strokeWidth={1.75} aria-hidden="true" />
            My subjects
          </Link>
        )}
        <div className="recent-enrollments__header">
          <div className="recent-enrollments__title">
            <BookOpen size={16} strokeWidth={1.75} aria-hidden="true" />
            <h2>{title}</h2>
            {subjects && <span className="onboarding-section__count">{count}</span>}
          </div>

          {isStaffLevel && (
            <Link className="button" to="/subjects/new">
              Add subject
            </Link>
          )}
          {showMine && (
            <Link to="/subjects?view=all" className="subjects-view-link">
              Browse all subjects
              <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          )}
        </div>

        {!subjects && !error && <p className="recent-enrollments__status">Loading…</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {subjects &&
          (showMine ? <MySubjects subjects={subjects} /> : <Catalog subjects={subjects} isStaffLevel={isStaffLevel} />)}
      </section>
    </div>
  )
}
