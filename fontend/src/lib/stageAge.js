// How long an enquiry has sat in its current pipeline stage. Falls back to
// `created_at` for a record that has never changed stage (fresh, or the
// stage_history relation wasn't fetched) - otherwise uses the most recent
// stage_history entry that moved it *into* the given stage, so the clock
// resets every time a record crosses into a new section.
export function getStageEnteredAt(enquiry, stage) {
  const history = enquiry.stage_history || []
  const entriesForStage = history.filter((change) => change.to_stage === stage)

  if (entriesForStage.length === 0) return new Date(enquiry.created_at)

  const latest = entriesForStage.reduce((a, b) => (new Date(a.changed_at) > new Date(b.changed_at) ? a : b))
  return new Date(latest.changed_at)
}

// Compact age label, e.g. "42m", "6h", "3d", "2mo", "1y" - picks the single
// largest unit so it stays short enough for a card row, matching the format
// convention of a relative-time chip rather than a full duration breakdown.
export function formatStageAge(enteredAt, now = new Date()) {
  const ms = Math.max(0, now.getTime() - enteredAt.getTime())
  const minutes = Math.floor(ms / (60 * 1000))

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`

  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`

  const years = Math.floor(days / 365)
  return `${years}y`
}
