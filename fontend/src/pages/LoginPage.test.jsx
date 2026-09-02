import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../theme/ThemeProvider'
import { LoginPage } from './LoginPage'

const mockUseAuth = vi.fn()
vi.mock('../auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}))

function renderLoginPage(initialPath = '/login') {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/subjects" element={<div>Subjects page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('renders the sign-in form and a theme toggle', () => {
    mockUseAuth.mockReturnValue({ login: vi.fn(), isAuthenticated: false })
    renderLoginPage()

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('logs in with the entered credentials and continues to the intended page', async () => {
    const user = userEvent.setup()
    const login = vi.fn().mockResolvedValue({ id: 1 })
    mockUseAuth.mockReturnValue({ login, isAuthenticated: false })
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'tam@lhq.test')
    await user.type(screen.getByLabelText('Password'), 'correct horse battery staple')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(login).toHaveBeenCalledWith('tam@lhq.test', 'correct horse battery staple')
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('shows the server error message when login fails', async () => {
    const user = userEvent.setup()
    const { ApiError } = await import('../lib/apiClient')
    const login = vi.fn().mockRejectedValue(new ApiError(400, { detail: 'Invalid credentials.' }))
    mockUseAuth.mockReturnValue({ login, isAuthenticated: false })
    renderLoginPage()

    await user.type(screen.getByLabelText('Email'), 'tam@lhq.test')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials.')
  })

  it('redirects away immediately when already authenticated', () => {
    mockUseAuth.mockReturnValue({ login: vi.fn(), isAuthenticated: true })
    renderLoginPage()

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
  })

  it('toggles between light and dark mode', async () => {
    const user = userEvent.setup()
    mockUseAuth.mockReturnValue({ login: vi.fn(), isAuthenticated: false })
    renderLoginPage()

    await user.click(screen.getByRole('button', { name: 'Switch to dark mode' }))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument()
  })
})
