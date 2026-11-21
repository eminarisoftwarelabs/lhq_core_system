import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, GraduationCap, LayoutGrid, List, UserCog } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { academicsApi, studentSubjectsApi } from '../lib/api'
import { ApiError } from '../lib/apiClient'
import { groupByLevel, tutorNames } from '../lib/tutorTeaching'
import { usePageTitle } from '../lib/usePageTitle'
import { readView, writeView } from '../lib/viewPreference'

// Lesson times live on each student's booking now, so a card counts the
// tutor's active students for the subject instead of showing one time.
function studentCountLabel(count) {
  if (count === undefined) return 'Students: …'
  if (count === 0) return 'No students yet'
  return `${count} ${count === 1 ? 'student' : 'students'}`
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

function EmptyCatalog() {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <BookOpen size={22} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p>No subjects yet. Run seed_cambridge_topics to load the Cambridge catalog.</p>
    </div>
  )
}

function EmptyMine() {
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

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`
}

// The count line on a card. Staff see tutors and active students per
// subject; a tutor sees how many of their own students they have (only
// loaded for their own subjects), and nothing when browsing the catalog.
function CardCounts({ subject, isStaffLevel, showMine, studentCounts }) {
  if (isStaffLevel) {
    return (
      <span className="my-subject-card__slot">
        <UserCog size={14} strokeWidth={1.75} aria-hidden="true" />
        {plural(subject.tutor_count ?? 0, 'tutor', 'tutors')}
        <GraduationCap size={14} strokeWidth={1.75} aria-hidden="true" />
        {plural(subject.active_student_count ?? 0, 'active student', 'active students')}
      </span>
    )
  }
  if (!showMine) return null
  return (
    <span className="my-subject-card__slot">
      <GraduationCap size={14} strokeWidth={1.75} aria-hidden="true" />
      {studentCountLabel(studentCounts ? (studentCounts[subject.id] ?? 0) : undefined)}
    </span>
  )
}

// Thumbnails: a grid of cards per level.
function Thumbnails({ subjects, isStaffLevel, showMine, studentCounts }) {
  return groupByLevel(subjects).map((group) => (
    <section key={group.levelId ?? 'none'} className="level-group" aria-labelledby={`level-${group.levelId}`}>
      <h3 id={`level-${group.levelId}`} className="level-group__title">
        {group.levelName}
        <span className="onboarding-section__count">{group.subjects.length}</span>
      </h3>
      <ul className="my-subjects" aria-label={`${group.levelName} subjects`}>
        {group.subjects.map((subject) => (
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
                <Badges subject={subject} showTaught={!showMine} />
              </span>
              <CardCounts subject={subject} isStaffLevel={isStaffLevel} showMine={showMine} studentCounts={studentCounts} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  ))
}

// List: one row per subject, grouped by level. Staff see who teaches each
// subject.
function SubjectList({ subjects, isStaffLevel, showMine, studentCounts }) {
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
                    <Badges subject={subject} showTaught={!showMine} />
                  </span>
                  {isStaffLevel && (
                    <span className={`directory-row__detail${names ? '' : ' directory-row__detail--muted'}`}>
                      <UserCog size={14} strokeWidth={1.75} aria-hidden="true" />
                      {names || 'No tutors yet'}
                    </span>
                  )}
                  {showMine && studentCounts && (
                    <span className="directory-row__detail">{studentCountLabel(studentCounts[subject.id] ?? 0)}</span>
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

const VIEW_KEY = 'lhq.subjects.view'
const VIEWS = ['thumbnails', 'list']

// Thumbnails or list. The choice is remembered per browser.
function ViewSwitch({ view, onChange }) {
  return (
    <div className="view-switch" role="group" aria-label="View">
      <button
        type="button"
        className="view-switch__option"
        aria-pressed={view === 'thumbnails'}
        onClick={() => onChange('thumbnails')}
      >
        <LayoutGrid size={14} strokeWidth={1.75} aria-hidden="true" />
        Thumbnails
      </button>
      <button type="button" className="view-switch__option" aria-pressed={view === 'list'} onClick={() => onChange('list')}>
        <List size={14} strokeWidth={1.75} aria-hidden="true" />
        List
      </button>
    </div>
  )
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
  const [studentCounts, setStudentCounts] = useState(null)
  const [view, setView] = useState(() => readView(VIEW_KEY, VIEWS, 'thumbnails'))

  function chooseView(next) {
    setView(next)
    writeView(VIEW_KEY, next)
  }

  // A tutor's own active bookings (the server only returns theirs).
  useEffect(() => {
    if (!showMine) return undefined
    let cancelled = false
    studentSubjectsApi
      .list({ status: 'ACTIVE' })
      .then((res) => {
        if (cancelled) return
        const counts = {}
        for (const ss of res) counts[ss.subject.id] = (counts[ss.subject.id] ?? 0) + 1
        setStudentCounts(counts)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [showMine])

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
  const shown = subjects ? (showMine ? subjects.filter((s) => s.taught_by_me) : subjects) : []
  const Layout = view === 'list' ? SubjectList : Thumbnails
  const count = subjects && shown.length

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

          <ViewSwitch view={view} onChange={chooseView} />
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

        {subjects && shown.length === 0 && (showMine ? <EmptyMine /> : <EmptyCatalog />)}
        {subjects && shown.length > 0 && (
          <Layout subjects={shown} isStaffLevel={isStaffLevel} showMine={showMine} studentCounts={studentCounts} />
        )}
      </section>
    </div>
  )
}
