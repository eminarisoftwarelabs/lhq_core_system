import { useContext } from 'react'
import { PageHeaderContext } from './pageHeaderContext'

export function usePageHeaderContext() {
  const ctx = useContext(PageHeaderContext)
  if (!ctx) throw new Error('usePageHeaderContext must be used within a PageHeaderProvider')
  return ctx
}
