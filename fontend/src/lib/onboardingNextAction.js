import { formatDateTime, formatShortDate, parseDateOnly } from './dateWindow'

// What staff should do next, per pipeline stage - replaces the old
// "Starts {date}" line, which told you about the plan but not the work.
// Only INVOICED needs an invoice passed in; the other two stages already
// carry everything they need on the enquiry itself (meeting_datetime).
export function getNextAction(stage, enquiry, invoice, now = new Date()) {
  if (stage === 'INITIAL_CALL') {
    return enquiry.meeting_datetime
      ? `Meeting ${formatDateTime(new Date(enquiry.meeting_datetime))}`
      : 'No meeting scheduled yet'
  }

  if (stage === 'MEETING_SET') {
    if (!enquiry.meeting_datetime) return 'Meeting time not set'
    const meetingAt = new Date(enquiry.meeting_datetime)
    return meetingAt < now
      ? `Meeting was ${formatDateTime(meetingAt)} — follow up`
      : `Meeting ${formatDateTime(meetingAt)}`
  }

  if (stage === 'INVOICED') {
    // generate_invoice() always creates exactly one Invoice in the same
    // transaction that moves the enquiry to INVOICED, so this should
    // always be present - the fallback only covers the invoices fetch
    // not having resolved yet.
    if (!invoice) return 'Awaiting payment'
    const dueDate = formatShortDate(parseDateOnly(invoice.due_date))
    return invoice.is_overdue ? `Overdue — was due ${dueDate}` : `Awaiting payment — due ${dueDate}`
  }

  return ''
}
