import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { checkHealth, type BackendTools } from '@/lib/api/client';

export type BackendStatus = 'checking' | 'online' | 'offline';

interface BackendState {
  status: BackendStatus;
  tools: BackendTools | null;
  version: string | null;
  recheck: () => void;
}

const BackendContext = createContext<BackendState | null>(null);

export function BackendProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<BackendState, 'recheck'>>({
    status: 'checking',
    tools: null,
    version: null,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Free-tier backends (e.g. HF Spaces) sleep when idle and take ~30-60s to
    // wake. Cap the health check so the UI flips to "offline" quickly instead
    // of hanging on "checking" — the user's actual request wakes the backend,
    // and the header's retry re-checks once it's up.
    const timeout = setTimeout(() => controller.abort(), 6000);
    setState((s) => ({ ...s, status: 'checking' }));
    checkHealth(controller.signal)
      .then((health) => {
        if (cancelled) return;
        setState({
          status: 'online',
          tools: health.tools,
          version: health.version,
        });
      })
      .catch(() => {
        // Any failure — network error, timeout abort, non-200 — is "offline".
        // `cancelled` guards only against a component unmount / re-run.
        if (!cancelled) {
          setState({ status: 'offline', tools: null, version: null });
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [nonce]);

  return (
    <BackendContext.Provider
      value={{ ...state, recheck: () => setNonce((n) => n + 1) }}
    >
      {children}
    </BackendContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBackend(): BackendState {
  const ctx = useContext(BackendContext);
  if (!ctx) throw new Error('useBackend must be used within BackendProvider');
  return ctx;
}
