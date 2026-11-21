import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from './Dialog'

describe('Dialog', () => {
  it('is a labelled modal that takes focus and returns it on close', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = render(
      <Dialog title="Session" subtitle="Mon 16 Nov" onClose={vi.fn()}>
        <p>Body</p>
      </Dialog>,
    )
    const dialog = screen.getByRole('dialog', { name: /Session/ })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    unmount()
    expect(opener).toHaveFocus()
    opener.remove()
  })

  it('closes on Escape, the close button and a backdrop click, not a click inside', () => {
    const onClose = vi.fn()
    render(
      <Dialog title="Session" onClose={onClose}>
        <p>Body</p>
      </Dialog>,
    )
    fireEvent.mouseDown(screen.getByText('Body'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
