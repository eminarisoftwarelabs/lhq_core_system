import { Link } from 'react-router-dom'

export function LegalNoticePage() {
  return (
    <div className="page legal-page">
      <h1>Legal Notice</h1>
      <p>This page will hold LHQ Learning Hub&apos;s legal notice: operating entity, contact details, and jurisdiction.</p>
      <p className="form-note">Content for this page is pending from the compliance team.</p>
      <Link to="/">Back to home</Link>
    </div>
  )
}
