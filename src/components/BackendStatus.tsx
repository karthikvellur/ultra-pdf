import { useBackend } from '@/hooks/useBackend';
import './BackendStatus.css';

/** Small pill in the header showing whether the heavy-ops backend is reachable. */
export function BackendStatus() {
  const { status, recheck } = useBackend();

  const label =
    status === 'online'
      ? 'Server tools ready'
      : status === 'checking'
        ? 'Checking server…'
        : 'Server offline';

  const title =
    status === 'offline'
      ? 'Heavy tools (unlock-with-text, protect, compress, OCR) need the backend. Click to retry.'
      : status === 'online'
        ? 'Heavy operations are available.'
        : undefined;

  return (
    <button
      type="button"
      className={`backend-status backend-status--${status}`}
      onClick={status === 'offline' ? recheck : undefined}
      title={title}
    >
      <span className="backend-status__dot" />
      {label}
    </button>
  );
}
