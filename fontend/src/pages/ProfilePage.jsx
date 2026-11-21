import { KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { hasStaffScopeOver } from '../auth/permissions'
import { useAuth } from '../auth/useAuth'
import { TutorHoursCard } from '../components/tutors/TutorHoursCard'
import { TutorTeachingPanel } from '../components/tutors/TutorTeachingPanel'
import { UserEditForm } from '../components/UserEditForm'
import { UserProfileHeader } from '../components/UserProfileHeader'
import { usePageTitle } from '../lib/usePageTitle'

export function ProfilePage() {
  const { user, setUser } = useAuth()
  usePageTitle('My profile')

  return (
    <div className="page">
      <UserProfileHeader user={user}>
        <Link className="button button--secondary" to="/change-password">
          <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
          Change password
        </Link>
      </UserProfileHeader>

      <div className="form-card">
        <UserEditForm actor={user} target={user} onSaved={setUser} />
      </div>

      {user.teaches && user.tutor_profile && (
        <div className="form-card">
          {/* A tutor's own changes wait for an admin. An Owner or System
              Admin who teaches has authority over their own account, so
              their changes apply directly - same rule as the server. */}
          <TutorTeachingPanel
            tutorId={user.tutor_profile.id}
            mode={hasStaffScopeOver(user.role, user.role) ? 'direct' : 'request'}
          />
          <TutorHoursCard tutorId={user.tutor_profile.id} title="My hours" />
        </div>
      )}
    </div>
  )
}
