import { Link } from 'react-router-dom'

export function DataPrivacyPage() {
  return (
    <div className="page legal-page">
      <h1>Data Privacy</h1>
      <p>
        This page will hold LHQ Learning Hub&apos;s data privacy notice: what account and student data we collect,
        why we collect it, and how long we retain it.
      </p>
      <p className="form-note">Content for this page is pending from the compliance team.</p>
      <Link to="/">Back to home</Link>
    </div>
  )
}
