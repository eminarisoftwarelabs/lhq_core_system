import { useMemo, useState } from 'react'
import { PageHeaderContext } from './pageHeaderContext'

// Holds the current page's title so it can be rendered once, in the app
// header bar, instead of once per page - see usePageTitle.
export function PageHeaderProvider({ children }) {
  const [title, setTitle] = useState(null)
  const value = useMemo(() => ({ title, setTitle }), [title])
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>
}
