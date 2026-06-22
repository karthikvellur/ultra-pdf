import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ToolDef } from '@/tools/registry';
import { RunsBadge } from './RunsBadge';
import './ToolShell.css';

interface ToolShellProps {
  tool: ToolDef;
  children: ReactNode;
}

export function ToolShell({ tool, children }: ToolShellProps) {
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
            <path d={tool.icon} />
          </svg>
        </span>
        <div>
          <div className="tool-shell__title-row">
            <h1 className="tool-shell__title">{tool.title}</h1>
            <RunsBadge runtime={tool.runtime} />
          </div>
          <p className="tool-shell__desc">{tool.description}</p>
        </div>
      </header>

      <div className="tool-shell__body">{children}</div>
    </div>
  );
}
