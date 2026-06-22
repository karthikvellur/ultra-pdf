import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="container" style={{ textAlign: 'center', padding: '64px 0' }}>
      <h1 style={{ fontSize: 64, color: 'var(--color-primary)' }}>404</h1>
      <p className="muted" style={{ fontSize: 17, marginTop: 8 }}>
        We couldn't find that tool.
      </p>
      <Link to="/" className="btn btn-primary" style={{ marginTop: 24 }}>
        Back to all tools
      </Link>
    </div>
  );
}
