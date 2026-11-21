import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'

/**
 * A modal dialog: Escape and a backdrop click close it, focus moves into
 * it on open and back to whatever opened it on close. `icon` is a lucide
 * component shown in the header badge.
 */
export function Dialog({ title, subtitle, icon: Icon, onClose, children, labelledBy }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    dialogRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  return (
    <div className="tt-dialog__backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="tt-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className="tt-dialog__header">
          {Icon && (
            <span className="icon-badge">
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
          )}
          <h2 id={titleId}>
            {title}
            {subtitle && <span className="tt-dialog__subtitle">{subtitle}</span>}
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <div className="tt-dialog__body">{children}</div>
      </div>
    </div>
  )
}
