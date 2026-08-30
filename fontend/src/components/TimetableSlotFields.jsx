import { DAY_LABELS } from '../lib/constants'

export function TimetableSlotFields({ value, onChange, idPrefix = 'slot' }) {
  return (
    <fieldset>
      <legend>Timetable slot</legend>
      <label htmlFor={`${idPrefix}_day_of_week`}>Day</label>
      <select
        id={`${idPrefix}_day_of_week`}
        value={value.day_of_week}
        onChange={(e) => onChange({ ...value, day_of_week: Number(e.target.value) })}
      >
        {DAY_LABELS.map((label, index) => (
          <option key={label} value={index}>
            {label}
          </option>
        ))}
      </select>

      <label htmlFor={`${idPrefix}_start_time`}>Start time</label>
      <input
        id={`${idPrefix}_start_time`}
        type="time"
        value={value.start_time}
        onChange={(e) => onChange({ ...value, start_time: e.target.value })}
      />

      <label htmlFor={`${idPrefix}_end_time`}>End time</label>
      <input
        id={`${idPrefix}_end_time`}
        type="time"
        value={value.end_time}
        onChange={(e) => onChange({ ...value, end_time: e.target.value })}
      />
    </fieldset>
  )
}
