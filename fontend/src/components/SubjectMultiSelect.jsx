// Checkbox list rather than a <select multiple> - easier to operate and to
// test, and the subject count here is small (a tutoring business's course
// catalog, not a large enumeration).
export function SubjectMultiSelect({ subjects, selectedIds, onChange, idPrefix = 'subjects' }) {
  function toggle(id) {
    const next = selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id]
    onChange(next)
  }

  if (subjects.length === 0) {
    return <p className="form-note">No active subjects to choose from yet.</p>
  }

  return (
    <fieldset>
      <legend>Subjects</legend>
      {subjects.map((subject) => (
        <label key={subject.id} htmlFor={`${idPrefix}_${subject.id}`} className="checkbox-label">
          <input
            id={`${idPrefix}_${subject.id}`}
            type="checkbox"
            checked={selectedIds.includes(subject.id)}
            onChange={() => toggle(subject.id)}
          />
          {subject.name}
        </label>
      ))}
    </fieldset>
  )
}
