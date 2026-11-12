import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Logo } from './Logo'

function renderLogo() {
  return render(
    <MemoryRouter>
      <Logo />
    </MemoryRouter>,
  )
}

describe('Logo', () => {
  it('links home with an accessible name', () => {
    renderLogo()
    const link = screen.getByRole('link', { name: 'LHQ Learning Hub, go to home' })
    expect(link).toHaveAttribute('href', '/')
  })

  it('renders the full logo and the collapsed-sidebar mark from public/', () => {
    const { container } = renderLogo()
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toEqual(['/logo.png', '/arrow.png'])
  })

  it('keeps both images decorative so the link name is read once', () => {
    const { container } = renderLogo()
    for (const img of container.querySelectorAll('img')) expect(img).toHaveAttribute('alt', '')
  })

  it('sets intrinsic sizes so the sidebar does not shift while the logo loads', () => {
    const { container } = renderLogo()
    const [full, mark] = container.querySelectorAll('img')
    expect([full.getAttribute('width'), full.getAttribute('height')]).toEqual(['320', '167'])
    expect([mark.getAttribute('width'), mark.getAttribute('height')]).toEqual(['37', '43'])
  })
})
