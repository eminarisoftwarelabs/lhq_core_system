import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import { formatShortDate, parseDateOnly, toDateOnlyString } from '../../lib/dateWindow'

function Chevron({ orientation, ...props }) {
  return orientation === 'left' ? (
    <ChevronLeft size={16} strokeWidth={1.75} {...props} />
  ) : (
    <ChevronRight size={16} strokeWidth={1.75} {...props} />
  )
}

// A themed replacement for <input type="date"> - the browser's own calendar
// popup can't be styled at all, so this renders react-day-picker inside a
// popover instead, keeping the same 'YYYY-MM-DD' string contract as the
// native input it replaces.
export function DatePickerField({ id, value, onChange, placeholder = 'Select date' }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const selected = value ? parseDateOnly(value) : undefined

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
          {value ? formatShortDate(selected) : placeholder}
        </span>
        <Calendar size={16} strokeWidth={1.75} aria-hidden="true" />
      </button>

      {open && (
        <div className="date-picker-field__popover" role="dialog" aria-label="Choose a date">
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onChange(date ? toDateOnlyString(date) : '')
              setOpen(false)
            }}
            components={{ Chevron }}
            autoFocus
          />
        </div>
      )}
    </div>
  )
}
