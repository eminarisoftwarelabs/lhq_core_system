import { KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
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
    </div>
  )
}
