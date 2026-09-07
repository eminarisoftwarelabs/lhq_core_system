import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { UserEditForm } from '../components/UserEditForm'
import { usePageTitle } from '../lib/usePageTitle'

export function ProfilePage() {
  const { user, setUser } = useAuth()
  usePageTitle('My profile')

  return (
    <div className="page">
      <p>
        <Link to="/change-password">Change password</Link>
      </p>
      <UserEditForm actor={user} target={user} onSaved={setUser} />
    </div>
  )
}
