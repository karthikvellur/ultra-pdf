import type { ReactNode } from 'react';
import { useBackend } from '@/hooks/useBackend';

/**
 * Wraps server-only tool UI. When the backend is offline it shows a clear
 * message + retry instead of letting the user start an operation that will
 * fail. `requiredTool` optionally checks a specific binary is present.
 */
export function ServerGate({
  requiredTool,
  children,
}: {
  requiredTool?: 'ghostscript' | 'qpdf' | 'tesseract' | 'poppler';
  children: ReactNode;
}) {
  const { status, tools, recheck } = useBackend();

  if (status === 'checking') {
    return <p className="notice notice--info">Checking the server…</p>;
  }

  if (status === 'offline') {
    return (
      <div className="notice notice--warning">
        <strong>This tool needs the Ultra PDF backend</strong>, which isn’t
        reachable right now. Start it with{' '}
        <code>cd backend &amp;&amp; ./run.sh</code> (see{' '}
        <code>backend/README.md</code>), then{' '}
        <button className="btn btn-ghost btn-sm" onClick={recheck}>
          retry
        </button>
        .
      </div>
    );
  }

  if (requiredTool && tools && !tools[requiredTool]) {
    return (
      <div className="notice notice--warning">
        The server is up, but <code>{requiredTool}</code> isn’t installed there,
        so this tool can’t run. See the backend README for setup.
      </div>
    );
  }

  return <>{children}</>;
}
