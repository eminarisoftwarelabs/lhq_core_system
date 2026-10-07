import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { RequirePasswordChange } from './components/RequirePasswordChange'
import { ChangePasswordPage } from './pages/ChangePasswordPage'
import { CreateUserPage } from './pages/CreateUserPage'
import { DashboardPage } from './pages/DashboardPage'
import { EnquiriesListPage } from './pages/EnquiriesListPage'
import { EnquiryCreatePage } from './pages/EnquiryCreatePage'
import { EnquiryDetailPage } from './pages/EnquiryDetailPage'
import { EnrollmentCreatePage } from './pages/EnrollmentCreatePage'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { InvoicesListPage } from './pages/InvoicesListPage'
import { CookiesPage } from './pages/legal/CookiesPage'
import { DataPrivacyPage } from './pages/legal/DataPrivacyPage'
import { LegalNoticePage } from './pages/legal/LegalNoticePage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { SetupPasswordPage } from './pages/SetupPasswordPage'
import { StudentAssessmentPage } from './pages/StudentAssessmentPage'
import { StudentDetailPage } from './pages/StudentDetailPage'
import { StudentsListPage } from './pages/StudentsListPage'
import { SubjectCreatePage } from './pages/SubjectCreatePage'
import { SubjectDetailPage } from './pages/SubjectDetailPage'
import { SubjectsListPage } from './pages/SubjectsListPage'
import { TimetablePage } from './pages/TimetablePage'
import { UserDetailPage } from './pages/UserDetailPage'
import { UsersListPage } from './pages/UsersListPage'

// The roster used to be its own page; it now lives on the subject page.
// Kept so old links and bookmarks still land somewhere useful.
function RosterRedirect() {
  const { id } = useParams()
  return <Navigate to={`/subjects/${id}`} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup-password" element={<SetupPasswordPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />

        <Route element={<RequirePasswordChange />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/me" element={<ProfilePage />} />

            <Route path="/privacy" element={<DataPrivacyPage />} />
            <Route path="/legal-notice" element={<LegalNoticePage />} />
            <Route path="/cookies" element={<CookiesPage />} />

            <Route path="/subjects" element={<SubjectsListPage />} />
            <Route path="/subjects/:id" element={<SubjectDetailPage />} />
            <Route path="/subjects/:id/roster" element={<RosterRedirect />} />
            <Route path="/subjects/:id/students/:studentId" element={<StudentAssessmentPage />} />

            <Route path="/timetable" element={<TimetablePage />} />

            <Route element={<ProtectedRoute staffOnly />}>
              <Route path="/users" element={<UsersListPage />} />
              <Route path="/users/new" element={<CreateUserPage />} />
              <Route path="/users/:id" element={<UserDetailPage />} />

              <Route path="/subjects/new" element={<SubjectCreatePage />} />

              <Route path="/students" element={<StudentsListPage />} />
              <Route path="/students/:id" element={<StudentDetailPage />} />

              <Route path="/enrollments/new" element={<EnrollmentCreatePage />} />

              <Route path="/enquiries" element={<EnquiriesListPage />} />
              <Route path="/enquiries/new" element={<EnquiryCreatePage />} />
              <Route path="/enquiries/:id" element={<EnquiryDetailPage />} />

              <Route path="/invoices" element={<InvoicesListPage />} />
              <Route path="/invoices/:id" element={<InvoiceDetailPage />} />
            </Route>
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
