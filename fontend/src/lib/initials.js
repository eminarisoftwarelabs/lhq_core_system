// Shared by every avatar-badge chip (StudentDetailPage's student + guardian
// avatars, SubjectRoster's rows) so the same name always renders
// the same initials rather than each page reimplementing this slightly
// differently.
export function initials(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[parts.length - 1][0] || '')).toUpperCase()
}
