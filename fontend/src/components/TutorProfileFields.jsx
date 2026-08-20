export function TutorProfileFields({ value, onChange, idPrefix = 'tutor' }) {
  return (
    <fieldset className="tutor-profile-fields">
      <legend>Tutor profile</legend>
      <label htmlFor={`${idPrefix}_hourly_rate`}>Hourly rate</label>
      <input
        id={`${idPrefix}_hourly_rate`}
        type="number"
        min="0"
        step="0.01"
        value={value.hourly_rate}
        onChange={(e) => onChange({ ...value, hourly_rate: e.target.value })}
      />
      <label htmlFor={`${idPrefix}_is_available`} className="checkbox-label">
        <input
          id={`${idPrefix}_is_available`}
          type="checkbox"
          checked={value.is_available}
          onChange={(e) => onChange({ ...value, is_available: e.target.checked })}
        />
        Available
      </label>
    </fieldset>
  )
}
