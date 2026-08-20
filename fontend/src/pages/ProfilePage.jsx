import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { UserEditForm } from '../components/UserEditForm'

export function ProfilePage() {
  const { user, setUser } = useAuth()

  return (
    <div className="page">
      <h1>My profile</h1>
      <p>
        <Link to="/change-password">Change password</Link>
      </p>
      <UserEditForm actor={user} target={user} onSaved={setUser} />
    </div>
  )
}
