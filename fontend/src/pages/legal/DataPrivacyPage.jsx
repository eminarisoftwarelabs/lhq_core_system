import { Link } from 'react-router-dom'
import { usePageTitle } from '../../lib/usePageTitle'

export function DataPrivacyPage() {
  usePageTitle('Data Privacy')

  return (
    <div className="page legal-page">
      <p>
        This page will hold LHQ Learning Hub&apos;s data privacy notice: what account and student data we collect,
        why we collect it, and how long we retain it.
      </p>
      <p className="form-note">Content for this page is pending from the compliance team.</p>
      <Link to="/">Back to home</Link>
    </div>
  )
}
