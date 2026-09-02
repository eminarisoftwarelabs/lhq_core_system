import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Logo } from './Logo'
import { NavigationMenu } from './NavigationMenu'
import { SidebarFooter } from './SidebarFooter'

export function Sidebar({ isStaffLevel, isOpen, onClose, isCollapsed = false, onToggleCollapse }) {
  return (
    <>
      <div
        className={`sidebar-backdrop${isOpen ? ' sidebar-backdrop--visible' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="primary-navigation"
        className={`sidebar${isOpen ? ' sidebar--open' : ''}${isCollapsed ? ' sidebar--collapsed' : ''}`}
        aria-label="Main navigation"
      >
        <div className="sidebar__inner">
          <Logo />
          <NavigationMenu isStaffLevel={isStaffLevel} onNavigate={onClose} />
          <SidebarFooter onNavigate={onClose} />
        </div>
      </aside>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={onToggleCollapse}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!isCollapsed}
        aria-controls="primary-navigation"
      >
        {isCollapsed ? (
          <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
        ) : (
          <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
        )}
      </button>
    </>
  )
}
