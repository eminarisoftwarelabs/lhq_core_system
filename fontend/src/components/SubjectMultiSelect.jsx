import { Check } from 'lucide-react'

// Chip toggles rather than a <select multiple> or a checkbox list - easier
// to scan and operate at a glance, and the subject count here is small (a
// tutoring business's course catalog, not a large enumeration). The real
// checkbox stays in the DOM (visually hidden) so this keeps native
// keyboard/checked semantics instead of reinventing them with a <button>.
export function SubjectMultiSelect({ subjects, selectedIds, onChange, idPrefix = 'subjects' }) {
  function toggle(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]
    onChange(next)
  }

  if (subjects.length === 0) {
    return <p className="form-note">No active subjects to choose from yet.</p>
  }

  return (
    <fieldset className="subject-select">
      <legend>Subjects</legend>
      <div className="subject-select__chips">
        {subjects.map((subject) => {
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
              />
              <Check className="subject-chip__check" size={13} strokeWidth={2.5} aria-hidden="true" />
              {subject.name}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
