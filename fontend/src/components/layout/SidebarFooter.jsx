import { Link } from 'react-router-dom'
import { SIDEBAR_FOOTER_LINKS } from './navigation'

export function SidebarFooter({ onNavigate }) {
  return (
    <div className="sidebar__footer">
      <ul className="sidebar-footer-list">
        {SIDEBAR_FOOTER_LINKS.map((link) => (
          <li key={link.to}>
            <Link to={link.to} onClick={onNavigate} className="sidebar-footer-list__link">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
