import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudentPage } from './StudentPage'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({ useAuth: () => mockUseAuth() }))
vi.mock('./StudentDetailPage', () => ({ StudentDetailPage: () => <div>staff student page</div> }))
vi.mock('./TutorStudentPage', () => ({ TutorStudentPage: () => <div>tutor student page</div> }))

describe('StudentPage', () => {
  it('gives staff the full student record', () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: true })
    render(<StudentPage />)

    expect(screen.getByText('staff student page')).toBeInTheDocument()
  })

  it('gives a tutor the reduced student page', () => {
    mockUseAuth.mockReturnValue({ isStaffLevel: false })
    render(<StudentPage />)

    expect(screen.getByText('tutor student page')).toBeInTheDocument()
    expect(screen.queryByText('staff student page')).not.toBeInTheDocument()
  })
})
