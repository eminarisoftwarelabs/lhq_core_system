export function TutorProfileFields({ value, onChange, idPrefix = 'tutor' }) {
  return (
    <fieldset className="tutor-profile-fields">
      <legend>Tutor profile</legend>
      <div className="form-row form-row--2col">
        <div className="field">
          <label htmlFor={`${idPrefix}_hourly_rate`}>Hourly rate</label>
          <input
            id={`${idPrefix}_hourly_rate`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={value.hourly_rate}
            onChange={(e) => onChange({ ...value, hourly_rate: e.target.value })}
          />
        </div>
      </div>
      <label htmlFor={`${idPrefix}_is_available`} className="checkbox-label">
        <input
          id={`${idPrefix}_is_available`}
          type="checkbox"
          checked={value.is_available}
          onChange={(e) => onChange({ ...value, is_available: e.target.checked })}
        />
        Available for new students
      </label>
    </fieldset>
  )
}
