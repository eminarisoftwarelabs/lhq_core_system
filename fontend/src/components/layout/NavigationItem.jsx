import { NavLink } from 'react-router-dom'

export function NavigationItem({ to, label, icon: Icon, onNavigate, end = false }) {
  return (
    <li className="nav-item-wrapper">
      <NavLink
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
      >
        <Icon className="nav-item__icon" size={20} strokeWidth={1.75} aria-hidden="true" />
        <span className="nav-item__label">{label}</span>
      </NavLink>
    </li>
  )
}
