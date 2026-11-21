import { Plus, Trash2 } from 'lucide-react'
import { DAY_LABELS } from '../../lib/constants'
import { newRow } from '../../lib/tutorTeaching'

/**
 * Rows of day + start + end, any day of the week, several blocks a day
 * allowed. Controlled: `rows` come from toRows() and go back through
 * fromRows(). Overlap and start-before-end are checked by the server (one
 * place for the rule) and its messages shown via `errors`.
 *
 * Also edits a student subject's weekly slots: `itemLabel` names a row in
 * accessible labels ("block", "slot"), `addLabel` the add button, and
 * `makeRow(rows)` builds a new row (default: tutorTeaching.newRow).
 */
export function WorkingHoursEditor({
  rows,
  onChange,
  idPrefix = 'hours',
  disabled = false,
  itemLabel = 'block',
  addLabel = 'Add hours',
  emptyText = 'No working hours yet.',
  makeRow = newRow,
}) {
  function update(key, field, value) {
    onChange(rows.map((row) => (row.key === key ? { ...row, [field]: field === 'weekday' ? Number(value) : value } : row)))
  }

  return (
    <div className="hours-editor">
      {rows.length === 0 && <p className="form-note">{emptyText}</p>}
      {rows.length > 0 && (
        <ul className="hours-editor__rows">
          {rows.map((row, index) => {
            const n = index + 1
            return (
              <li key={row.key} className="hours-editor__row">
                <div className="field">
                  <label htmlFor={`${idPrefix}_${row.key}_day`}>Day</label>
                  <select
                    id={`${idPrefix}_${row.key}_day`}
                    aria-label={`Day for ${itemLabel} ${n}`}
                    value={row.weekday}
                    disabled={disabled}
                    onChange={(e) => update(row.key, 'weekday', e.target.value)}
                  >
                    {DAY_LABELS.map((label, day) => (
                      <option key={label} value={day}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor={`${idPrefix}_${row.key}_start`}>Start</label>
                  <input
                    id={`${idPrefix}_${row.key}_start`}
                    aria-label={`Start time for ${itemLabel} ${n}`}
                    type="time"
                    step="300"
                    required
                    value={row.start_time}
                    disabled={disabled}
                    onChange={(e) => update(row.key, 'start_time', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor={`${idPrefix}_${row.key}_end`}>End</label>
                  <input
                    id={`${idPrefix}_${row.key}_end`}
                    aria-label={`End time for ${itemLabel} ${n}`}
                    type="time"
                    step="300"
                    required
                    value={row.end_time}
                    disabled={disabled}
                    onChange={(e) => update(row.key, 'end_time', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="icon-button hours-editor__remove"
                  aria-label={`Remove ${itemLabel} ${n}`}
                  disabled={disabled}
                  onClick={() => onChange(rows.filter((r) => r.key !== row.key))}
                >
                  <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        className="button button--secondary button--compact hours-editor__add"
        disabled={disabled}
        onClick={() => onChange([...rows, makeRow(rows)])}
      >
        <Plus size={14} strokeWidth={2} aria-hidden="true" />
        {addLabel}
      </button>
    </div>
  )
}
