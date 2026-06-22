import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './ToolShell.css';

interface ToolShellProps {
  title: string;
  description: string;
  icon: string;
  children: ReactNode;
}

export function ToolShell({ title, description, icon, children }: ToolShellProps) {
  return (
    <div className="container tool-shell">
      <Link to="/" className="tool-shell__back">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        All tools
      </Link>

      <header className="tool-shell__header">
        <span className="tool-shell__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d={icon} />
          </svg>
        </span>
        <div>
          <h1 className="tool-shell__title">{title}</h1>
          <p className="tool-shell__desc">{description}</p>
        </div>
      </header>

      <div className="tool-shell__body">{children}</div>
    </div>
  );
}
