import { useEffect } from 'react'
import { usePageHeaderContext } from '../components/layout/usePageHeaderContext'

// Sets the page title shown in the app header bar (with a back arrow),
// instead of each page rendering its own <h1>. Plain strings only - a title
// built from JSX would be a new object reference every render, which would
// re-trigger this effect (and therefore a context update) on every render,
// an infinite loop for any page whose title depends on render-time data.
// Pass a falsy value (e.g. before data has loaded) to show nothing yet.
export function usePageTitle(title) {
  const { setTitle } = usePageHeaderContext()

  useEffect(() => {
    setTitle(title)
    return () => setTitle(null)
  }, [title, setTitle])
}
