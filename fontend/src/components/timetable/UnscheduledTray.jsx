import { CalendarCheck, GripVertical, Plus, UserCog } from 'lucide-react'
import { DEFAULT_SESSION_MINUTES, DRAG_TYPE, encodeDrag } from '../../lib/timetableGrid'

/**
 * Subjects with no session yet. Each can be dragged straight onto the
 * grid, or scheduled with its button (the keyboard/touch path).
 */
export function UnscheduledTray({ subjects, onSchedule, onDragStart, onDragEnd }) {
  return (
    <aside className="tt-tray" aria-labelledby="tt-tray-title">
      <div className="tt-tray__header">
        <h2 id="tt-tray-title">Not on the timetable</h2>
        <span className="onboarding-section__count">{subjects.length}</span>
        {subjects.length > 0 && <span className="tt-tray__hint">Drag a subject onto the grid, or use Schedule.</span>}
      </div>

      {subjects.length === 0 ? (
        <div className="tt-tray__empty">
          <CalendarCheck size={20} strokeWidth={1.75} aria-hidden="true" />
          <p>Every subject has a session this week.</p>
        </div>
      ) : (
        <>
          <ul className="tt-tray__list">
            {subjects.map((subject) => (
              <li
                key={subject.id}
                className="tt-tray__item"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(DRAG_TYPE, encodeDrag(subject.id, 0))
                  event.dataTransfer.effectAllowed = 'move'
                  onDragStart(subject.id, DEFAULT_SESSION_MINUTES, 0)
                }}
                onDragEnd={onDragEnd}
              >
                <GripVertical size={14} strokeWidth={1.75} className="tt-tray__grip" aria-hidden="true" />
                <span className="tt-tray__text">
                  <span className="tt-tray__name">{subject.name}</span>
                  <span className="tt-tray__tutor">
                    <UserCog size={11} strokeWidth={1.75} aria-hidden="true" />
                    {subject.tutor_name || 'Unassigned'}
                  </span>
                </span>
                <button
                  type="button"
                  className="button button--secondary button--compact"
                  aria-label={`Schedule ${subject.name}`}
                  onClick={() => onSchedule(subject)}
                >
                  <Plus size={13} strokeWidth={2} aria-hidden="true" />
                  Schedule
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  )
}
