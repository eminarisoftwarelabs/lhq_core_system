import { useAuth } from '../auth/useAuth'
import { StudentDetailPage } from './StudentDetailPage'
import { TutorStudentPage } from './TutorStudentPage'

// /students/:id is open to tutors (for the students they teach) as well as
// staff, but the two see different pages: staff get the full record, a tutor
// gets the reduced one the API returns to them.
export function StudentPage() {
  const { isStaffLevel } = useAuth()
  return isStaffLevel ? <StudentDetailPage /> : <TutorStudentPage />
}
