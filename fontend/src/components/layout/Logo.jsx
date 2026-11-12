import { Link } from 'react-router-dom'

// The LHQ logo on a white chip, so the navy artwork reads on any background
// (dark mode included). Both images are always rendered and CSS picks one:
// the full logo normally, the gold arrow mark in the collapsed sidebar,
// where the full logo would be squashed to an unreadable sliver.
export function Logo() {
  return (
    <Link to="/" className="sidebar__logo" aria-label="LHQ Learning Hub, go to home">
      <span className="sidebar__logo-chip">
        <img className="sidebar__logo-full" src="/logo.png" alt="" width="320" height="167" />
        <img className="sidebar__logo-mark" src="/arrow.png" alt="" width="37" height="43" />
      </span>
    </Link>
  )
}
