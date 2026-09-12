import { ChevronLeft, ChevronRight } from 'lucide-react'

// Shared react-day-picker nav-arrow renderer - used by both DatePickerField
// and DateTimePickerField so the two calendars stay visually identical.
export function Chevron({ orientation, ...props }) {
  return orientation === 'left' ? (
    <ChevronLeft size={16} strokeWidth={1.75} {...props} />
  ) : (
    <ChevronRight size={16} strokeWidth={1.75} {...props} />
  )
}
