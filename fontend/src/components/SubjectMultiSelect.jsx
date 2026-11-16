import { Check } from 'lucide-react'
import { groupByLevel } from '../lib/tutorTeaching'

// Chip toggles rather than a <select multiple> or a checkbox list - easier
// to scan and operate at a glance. The real checkbox stays in the DOM
// (visually hidden) so this keeps native keyboard/checked semantics
// instead of reinventing them with a <button>.
//
// Grouped by level: the same subject name ("Mathematics") exists at every
// level, so the level heading is what tells the chips apart. Each chip's
// accessible name includes the level for the same reason.
// hideLegend: keep the legend for screen readers but not on screen, for a
// picker that already sits under a section header saying the same thing.
export function SubjectMultiSelect({
  subjects,
  selectedIds,
  onChange,
  idPrefix = 'subjects',
  legend = 'Subjects',
  hideLegend = false,
}) {
  function toggle(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]
    onChange(next)
  }

  if (subjects.length === 0) {
    return <p className="form-note">No active subjects to choose from yet.</p>
  }

  const groups = groupByLevel(subjects)
  const showHeadings = groups.length > 1 || Boolean(groups[0]?.levelId)

  return (
    <fieldset className="subject-select">
      <legend className={hideLegend ? 'visually-hidden' : undefined}>{legend}</legend>
      {groups.map((group) => (
        <div key={group.levelId ?? 'none'} className="subject-select__group">
          {showHeadings && <p className="subject-select__level">{group.levelName}</p>}
          <div className="subject-select__chips">
            {group.subjects.map((subject) => {
              const selected = selectedIds.includes(subject.id)
              return (
                <label
                  key={subject.id}
                  htmlFor={`${idPrefix}_${subject.id}`}
                  className={`subject-chip${selected ? ' subject-chip--selected' : ''}`}
                >
                  <input
                    id={`${idPrefix}_${subject.id}`}
                    type="checkbox"
                    checked={selected}
                    onChange={() => toggle(subject.id)}
                    className="visually-hidden"
                    aria-label={showHeadings ? `${group.levelName} ${subject.name}` : undefined}
                  />
                  <Check className="subject-chip__check" size={13} strokeWidth={2.5} aria-hidden="true" />
                  {subject.name}
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </fieldset>
  )
}
