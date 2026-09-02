import { Link } from 'react-router-dom'

export function Logo() {
  return (
    <Link to="/" className="sidebar__logo" aria-label="LHQ Learning Hub, go to home">
      <span className="sidebar__logo-mark" aria-hidden="true">
        LHQ
      </span>
      <span className="sidebar__logo-text">
        <span className="sidebar__logo-title">Learning Hub</span>
      </span>
    </Link>
  )
}
