import { Briefcase, Mail, Phone } from 'lucide-react'
import { roleLabel } from '../auth/permissions'
import { formatShortDate, parseDateOnly } from '../lib/dateWindow'
import { initials } from '../lib/initials'

const EMPLOYMENT_TYPE_LABELS = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CONTRACT: 'Contract',
}

// Employment facts in one line, dropping whatever's missing rather than
// leaving a stray " · " - most accounts only have one or two of these set.
function employmentLine(user) {
  return [
    user.employee_id,
    EMPLOYMENT_TYPE_LABELS[user.employment_type],
    user.start_date ? `Since ${formatShortDate(parseDateOnly(user.start_date))}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

// Identity strip above a user's edit card - shared by ProfilePage (self) and
// UserDetailPage (staff viewing someone else) so both read as the same
// record, and match StudentDetailPage's avatar + name + badge header.
// `children` renders in the right-aligned actions slot.
export function UserProfileHeader({ user, children }) {
  const name = user.full_name || user.email
  const employment = employmentLine(user)

  return (
    <>
      <div className="detail-header">
        <span className="avatar-badge" aria-hidden="true">
          {initials(name)}
        </span>
        <div className="detail-header__identity">
          <h1 className="detail-header__name">{user.full_name || '(no name)'}</h1>
          <span className="detail-header__number">{roleLabel(user.role)}</span>
        </div>
        <span
          className={`stage-badge user-status-badge user-status-badge--${user.is_active ? 'active' : 'inactive'}`}
        >
          {user.is_active ? 'Active' : 'Deactivated'}
        </span>
        {user.teaches && <span className="stage-badge role-badge">Teaches</span>}
        {children && <div className="invoice-header-actions">{children}</div>}
      </div>

      <div className="detail-header__meta">
        <span className="detail-header__parent">
          <Mail size={14} strokeWidth={1.75} aria-hidden="true" />
          {user.email}
        </span>
        {user.phone && (
          <span className="detail-header__parent">
            <Phone size={14} strokeWidth={1.75} aria-hidden="true" />
            {user.phone}
          </span>
        )}
        {employment && (
          <span className="detail-header__parent">
            <Briefcase size={14} strokeWidth={1.75} aria-hidden="true" />
            {employment}
          </span>
        )}
      </div>
    </>
  )
}
