import { NAV_ITEMS } from './navigation'
import { NavigationItem } from './NavigationItem'

export function NavigationMenu({ isStaffLevel, onNavigate }) {
  const items = NAV_ITEMS.filter((item) => !item.staffOnly || isStaffLevel)

  return (
    <nav className="sidebar__nav" aria-label="Main navigation">
      <ul className="nav-list">
        {items.map((item) => (
          <NavigationItem key={item.to} {...item} onNavigate={onNavigate} />
        ))}
      </ul>
    </nav>
  )
}
