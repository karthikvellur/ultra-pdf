import { Link, Outlet } from 'react-router-dom';
import './Layout.css';

export function Layout() {
  return (
    <div className="layout">
      <header className="layout__header">
        <div className="container layout__header-inner">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </span>
            <span className="brand__name">
              Ultra<span className="brand__accent">PDF</span>
            </span>
          </Link>
          <nav className="layout__nav">
            <Link to="/">All Tools</Link>
            <a
              href="https://github.com/topics/pdf"
              target="_blank"
              rel="noreferrer"
              className="muted"
            >
              About
            </a>
          </nav>
        </div>
      </header>

      <main className="layout__main">
        <Outlet />
      </main>

      <footer className="layout__footer">
        <div className="container layout__footer-inner">
          <span className="muted">
            🔒 Your files are processed entirely in your browser. Nothing is
            uploaded.
          </span>
          <span className="muted">Ultra PDF · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}
