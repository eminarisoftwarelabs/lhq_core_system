import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { useTheme } from './useTheme'

function Consumer() {
  const { theme, toggleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={toggleTheme}>
        Toggle
      </button>
    </div>
  )
}

describe('ThemeProvider / useTheme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete document.documentElement.dataset.theme
  })

  afterEach(() => {
    delete document.documentElement.dataset.theme
  })

  it('throws when useTheme is used outside a ThemeProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Consumer />)).toThrow('useTheme must be used within a ThemeProvider')
    spy.mockRestore()
  })

  it('defaults to the OS preference (light, per the jsdom matchMedia stub) when nothing is stored', () => {
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('resolves the initial theme from a previously stored explicit choice, and applies it to <html>', () => {
    window.localStorage.setItem('lhq-theme', 'dark')
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('toggling flips the theme, stamps data-theme on <html>, and persists the choice', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Consumer />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('theme')).toHaveTextContent('light')

    await user.click(screen.getByRole('button', { name: 'Toggle' }))

    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(window.localStorage.getItem('lhq-theme')).toBe('dark')

    await user.click(screen.getByRole('button', { name: 'Toggle' }))

    expect(screen.getByTestId('theme')).toHaveTextContent('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(window.localStorage.getItem('lhq-theme')).toBe('light')
  })
})
