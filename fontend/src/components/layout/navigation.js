import {
  BookOpen,
  CalendarClock,
  CircleUser,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  Receipt,
  UserCog,
} from 'lucide-react'

// Data-driven primary navigation. `staffOnly` items are hidden from the menu
// for non-staff roles (mirrors the route guards in App.jsx). `end` is passed
// straight through to NavLink - required for "/" so it isn't treated as a
// prefix match for every other route.
export const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, staffOnly: false, end: true },
  { to: '/enquiries', label: 'Onboarding', icon: MessagesSquare, staffOnly: true },
  { to: '/students', label: 'Students', icon: GraduationCap, staffOnly: true },
  { to: '/subjects', label: 'Subjects', icon: BookOpen, staffOnly: false },
  // Read-only for a Tutor (their own schedule), editable for staff - same
  // visibility split as /subjects, since a slot lives on a Subject they
  // may or may not be able to edit.
  { to: '/timetable', label: 'Timetable', icon: CalendarClock, staffOnly: false },
  { to: '/invoices', label: 'Invoices', icon: Receipt, staffOnly: true },
  { to: '/users', label: 'Users', icon: UserCog, staffOnly: true },
  { to: '/me', label: 'My Profile', icon: CircleUser, staffOnly: false },
]

// Secondary, low-emphasis links anchored to the bottom of the sidebar.
export const SIDEBAR_FOOTER_LINKS = [
  { to: '/privacy', label: 'Data Privacy' },
  { to: '/legal-notice', label: 'Legal Notice' },
  { to: '/cookies', label: 'Cookies' },
]
