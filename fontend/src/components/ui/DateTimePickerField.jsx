import { CalendarClock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { formatDateTime } from '../../lib/dateWindow'
import { Chevron } from './Chevron'

const DEFAULT_TIME = '09:00'

function toDateOnly(value) {
  return value ? value.slice(0, 10) : ''
}

function toTimeOnly(value) {
  return value ? value.slice(11, 16) : ''
}

// A themed replacement for <input type="datetime-local"> - same problem as
// DatePickerField (the native calendar can't be styled, and looks wildly
// different per browser/OS), plus a plain <input type="time"> underneath
// for the part a calendar can't pick. Keeps the exact 'YYYY-MM-DDTHH:mm'
// string contract the native input used, so callers (MeetingTimeForm's
// fromDatetimeLocalValue/toDatetimeLocalValue) don't need to change.
export function DateTimePickerField({ id, value, onChange, placeholder = 'Select date & time' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const datePart = toDateOnly(value)
  const timePart = toTimeOnly(value)
  const selected = datePart ? new Date(`${datePart}T00:00`) : undefined

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleDaySelect(date) {
    if (!date) return
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    onChange(`${year}-${month}-${day}T${timePart || DEFAULT_TIME}`)
  }

  function handleTimeChange(event) {
    const nextTime = event.target.value
    if (!nextTime) return
    const today = new Date()
    const fallbackDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    onChange(`${datePart || fallbackDate}T${nextTime}`)
  }

  return (
    <div className="date-picker-field" ref={containerRef}>
      <button
        type="button"
        id={id}
        className="date-picker-field__trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={value ? '' : 'date-picker-field__placeholder'}>
          {value ? formatDateTime(new Date(value)) : placeholder}
        </span>
        <CalendarClock size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div className="date-picker-field__popover" role="dialog" aria-label="Choose a date and time">
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={handleDaySelect}
            components={{ Chevron }}
            autoFocus
          />
          <div className="date-time-picker__time-row">
            <label htmlFor={`${id}-time`}>Time</label>
            <input
              id={`${id}-time`}
              type="time"
              value={timePart}
              onChange={handleTimeChange}
              className="date-time-picker__time-input"
            />
            <button type="button" className="button button--secondary date-time-picker__done" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
