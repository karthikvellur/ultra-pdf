import type { ToolRuntime } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import './RunsBadge.css';

const LABELS: Record<ToolRuntime, string> = {
  client: 'Runs in your browser',
  server: 'Runs on the server',
  hybrid: 'Browser + server',
};

const SHORT: Record<ToolRuntime, string> = {
  client: 'Browser',
  server: 'Server',
  hybrid: 'Hybrid',
};

/**
 * Indicates where a tool runs. For server/hybrid tools it also reflects live
 * backend availability so users know upfront if a heavy feature is reachable.
 */
export function RunsBadge({
  runtime,
  short = false,
}: {
  runtime: ToolRuntime;
  short?: boolean;
}) {
  const { status } = useBackend();
  const needsServer = runtime !== 'client';
  const degraded = needsServer && status !== 'online';

  return (
    <span
      className={`runs-badge runs-badge--${runtime} ${degraded ? 'runs-badge--degraded' : ''}`}
      title={
        degraded
          ? runtime === 'server'
            ? 'Needs the backend, which is currently offline.'
            : 'Full features need the backend; a browser-only fallback is available.'
          : LABELS[runtime]
      }
    >
      <span className="runs-badge__icon" aria-hidden="true">
        {runtime === 'client' ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" /><path d="M7 7h.01M7 17h.01" /></svg>
        )}
      </span>
      {short ? SHORT[runtime] : LABELS[runtime]}
    </span>
  );
}
