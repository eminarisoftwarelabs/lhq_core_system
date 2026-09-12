// Mirrors backend TextChoices exactly - keep both sides in sync.

export const ENQUIRY_STAGES = ['INITIAL_CALL', 'MEETING_SET', 'INVOICED', 'ENROLLED']

export const STAGE_LABELS = {
  INITIAL_CALL: 'Initial call',
  MEETING_SET: 'Meeting set',
  INVOICED: 'Invoiced',
  ENROLLED: 'Enrolled',
}

// Stages a staff member can manually move an enquiry to via the change-stage
// endpoint. ENROLLED is deliberately excluded - the backend rejects it
// outright, it's only ever set automatically by the first payment.
export const MANUAL_STAGE_OPTIONS = ['INITIAL_CALL', 'MEETING_SET', 'INVOICED']

// A student's class/form level (Year 1-13) - distinct from `grade`, which
// records the marks/grades a student brought from their previous school.
export const YEAR_GROUPS = Array.from({ length: 13 }, (_, i) => i + 1)

export function yearGroupLabel(year) {
  return year ? `Year ${year}` : '—'
}

export const LEARNING_MODES = ['IN_PERSON', 'ONLINE']

export const LEARNING_MODE_LABELS = {
  IN_PERSON: 'In person',
  ONLINE: 'Online',
}

export const ENROLLMENT_STATUS_LABELS = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  WITHDRAWN: 'Withdrawn',
}

export const INVOICE_STATUS_LABELS = {
  SENT: 'Sent',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
}

export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function dayLabel(dayOfWeek) {
  return DAY_LABELS[dayOfWeek] ?? '—'
}

export function formatTime(value) {
  return value ? value.slice(0, 5) : ''
}

// LHQ bills in Malawi Kwacha. Tuition fees run into the hundreds of
// thousands (see billing/services.py's per-session rates), so grouping
// separators aren't optional polish here - without them a real invoice
// total reads as an unbroken 7-digit string.
export function formatMoney(value) {
  if (value === null || value === undefined) return '—'
  return `MK ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
