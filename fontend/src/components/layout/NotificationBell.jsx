import { Bell } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsApi } from '../../lib/api'
import { formatStageAge } from '../../lib/stageAge'

// Often enough that a new change request shows up while an admin is on
// another page, rare enough to be nothing for the server.
const POLL_MS = 60_000

function badgeText(count) {
  return count > 9 ? '9+' : String(count)
}

export function NotificationBell() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const [data, setData] = useState({ unread_count: 0, results: [] })
  const containerRef = useRef(null)
  const triggerRef = useRef(null)

  // A failed poll keeps what is on screen; the next one will catch up.
  const refresh = useCallback(() => notificationsApi.list().then(setData).catch(() => {}), [])

  useEffect(() => {
    let cancelled = false
    const poll = () =>
      notificationsApi
        .list()
        .then((res) => {
          if (!cancelled) setData(res)
        })
        .catch(() => {})
    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) return undefined
    function handlePointerDown(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function toggle() {
    if (!isOpen) refresh()
    setIsOpen((open) => !open)
  }

  async function openItem(item) {
    setIsOpen(false)
    if (!item.is_read) {
      setData((d) => ({
        unread_count: Math.max(0, d.unread_count - 1),
        results: d.results.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)),
      }))
      notificationsApi.markRead(item.id).catch(() => {})
    }
    if (item.link) navigate(item.link)
  }

  const unread = data.unread_count
  const label = unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'

  return (
    <div className="notification-bell" ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-button notification-bell__trigger"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="notification-panel"
        aria-label={label}
        onClick={toggle}
      >
        <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
        {unread > 0 && (
          <span className="notification-bell__badge" aria-hidden="true">
            {badgeText(unread)}
          </span>
        )}
      </button>

      {isOpen && (
        <div id="notification-panel" className="notification-bell__panel" role="menu" aria-label="Notifications">
          <p className="notification-bell__heading">Notifications</p>
          {data.results.length === 0 ? (
            <p className="notification-bell__empty">Nothing new.</p>
          ) : (
            <ul className="notification-bell__list">
              {data.results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    role="menuitem"
                    className={`notification-bell__item${item.is_read ? '' : ' notification-bell__item--unread'}`}
                    onClick={() => openItem(item)}
                  >
                    <span className="notification-bell__message">{item.message}</span>
                    <span className="notification-bell__time">{formatStageAge(new Date(item.created_at))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
