import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import { AppLayout } from './AppLayout'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

function renderLayout() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/subjects']}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/subjects" element={<h1>Subjects</h1>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('AppLayout', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders the sidebar navigation, header, and routed page content', () => {
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa', role: 'OWNER' },
      isStaffLevel: true,
      logout: vi.fn(),
    })
    renderLayout()

    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Subjects' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /account menu for wanangwa/i })).toBeInTheDocument()
  })

  it('opens and closes the mobile navigation drawer from the header toggle', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa', role: 'OWNER' },
      isStaffLevel: true,
      logout: vi.fn(),
    })
    const { container } = renderLayout()

    const sidebar = container.querySelector('.sidebar')
    expect(sidebar).not.toHaveClass('sidebar--open')

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }))

    expect(sidebar).toHaveClass('sidebar--open')
  })

  it('logs out and redirects to /login when "Log out" is chosen from the account menu', async () => {
    const user = userEvent.setup()
    const logout = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa', role: 'OWNER' },
      isStaffLevel: true,
      logout,
    })
    renderLayout()

    await user.click(screen.getByRole('button', { name: /account menu for wanangwa/i }))
    await user.click(screen.getByRole('menuitem', { name: /log out/i }))

    expect(logout).toHaveBeenCalledTimes(1)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('collapses and expands the sidebar from the floating toggle, persisting the choice', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa', role: 'OWNER' },
      isStaffLevel: true,
      logout: vi.fn(),
    })
    const { container } = renderLayout()

    const shell = container.querySelector('.app-shell')
    expect(shell).not.toHaveClass('app-shell--sidebar-collapsed')

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(shell).toHaveClass('app-shell--sidebar-collapsed')
    expect(container.querySelector('.sidebar')).toHaveClass('sidebar--collapsed')
    expect(window.localStorage.getItem('lhq-sidebar-collapsed')).toBe('true')

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(shell).not.toHaveClass('app-shell--sidebar-collapsed')
    expect(window.localStorage.getItem('lhq-sidebar-collapsed')).toBe('false')
  })

  it('starts collapsed when a previous session left the sidebar collapsed', () => {
    window.localStorage.setItem('lhq-sidebar-collapsed', 'true')
    mockUseAuth.mockReturnValue({
      user: { full_name: 'Wanangwa', role: 'OWNER' },
      isStaffLevel: true,
      logout: vi.fn(),
    })
    const { container } = renderLayout()

    expect(container.querySelector('.app-shell')).toHaveClass('app-shell--sidebar-collapsed')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })
})
