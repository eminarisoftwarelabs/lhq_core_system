import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/useAuth'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { CreateUserPage } from './pages/CreateUserPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SetupPasswordPage } from './pages/SetupPasswordPage'
import { UserDetailPage } from './pages/UserDetailPage'
import { UsersListPage } from './pages/UsersListPage'

function HomeRedirect() {
  const { isStaffLevel } = useAuth()
  return <Navigate to={isStaffLevel ? '/users' : '/me'} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup-password" element={<SetupPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/me" element={<ProfilePage />} />

          <Route element={<ProtectedRoute staffOnly />}>
            <Route path="/users" element={<UsersListPage />} />
            <Route path="/users/new" element={<CreateUserPage />} />
            <Route path="/users/:id" element={<UserDetailPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
