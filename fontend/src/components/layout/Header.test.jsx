import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { usePageTitle } from '../../lib/usePageTitle'
import { ThemeProvider } from '../../theme/ThemeProvider'
import { Header } from './Header'
import { PageHeaderProvider } from './PageHeaderProvider'

vi.mock('../../lib/greeting', () => ({
  getGreeting: () => 'Good afternoon',
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Stands in for a routed page that has called usePageTitle - Header reads
// the title from the same PageHeaderProvider this renders alongside it,
// exactly as AppLayout wires the real Header and Outlet together.
function StubPage({ title }) {
  usePageTitle(title)
  return null
}

function renderHeader(user, path = '/', pageTitle) {
  return render(
    <ThemeProvider>
      <PageHeaderProvider>
        <MemoryRouter initialEntries={[path]}>
          <Header user={user} onLogout={vi.fn()} onOpenMenu={vi.fn()} isMobileNavOpen={false} />
          {pageTitle && <StubPage title={pageTitle} />}
        </MemoryRouter>
      </PageHeaderProvider>
    </ThemeProvider>,
  )
}

describe('Header', () => {
  it('shows the time-based greeting with the user\'s name on the dashboard route', () => {
    renderHeader({ full_name: 'Wanangwa Banda', role: 'OWNER' }, '/')

    expect(screen.getByText('Good afternoon, Wanangwa Banda')).toBeInTheDocument()
  })

  it('falls back to email when the user has no full name', () => {
    renderHeader({ full_name: '', email: 'tam@lhq.test', role: 'TUTOR' }, '/')

    expect(screen.getByText('Good afternoon, tam@lhq.test')).toBeInTheDocument()
  })

  it('does not show the greeting on other routes', () => {
    renderHeader({ full_name: 'Wanangwa Banda', role: 'OWNER' }, '/enquiries')

    expect(screen.queryByText(/Good afternoon/)).not.toBeInTheDocument()
  })

  it('shows the page title and a back button once the page sets one', () => {
    renderHeader({ full_name: 'Wanangwa Banda', role: 'OWNER' }, '/enquiries', 'Onboarding')

    expect(screen.getByRole('heading', { name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument()
  })

  it('does not show a page title (or the greeting) on the dashboard route even if one is set', () => {
    renderHeader({ full_name: 'Wanangwa Banda', role: 'OWNER' }, '/', 'Should not show')

    expect(screen.queryByText('Should not show')).not.toBeInTheDocument()
    expect(screen.getByText(/Good afternoon/)).toBeInTheDocument()
  })

  it('navigates back in history when the back button is clicked', () => {
    mockNavigate.mockClear()
    renderHeader({ full_name: 'Wanangwa Banda', role: 'OWNER' }, '/enquiries', 'Onboarding')

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))

    expect(mockNavigate).toHaveBeenCalledWith(-1)
  })
})
