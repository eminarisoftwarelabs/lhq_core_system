import { Link } from 'react-router-dom'

export function CookiesPage() {
  return (
    <div className="page legal-page">
      <h1>Cookies</h1>
      <p>This page will describe the cookies LHQ Learning Hub uses, such as session and authentication tokens.</p>
      <p className="form-note">Content for this page is pending from the compliance team.</p>
      <Link to="/">Back to home</Link>
    </div>
  )
}
