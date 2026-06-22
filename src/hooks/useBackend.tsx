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
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'checking' }));
    checkHealth(controller.signal)
      .then((health) =>
        setState({
          status: 'online',
          tools: health.tools,
          version: health.version,
        }),
      )
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ status: 'offline', tools: null, version: null });
        }
      });
    return () => controller.abort();
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
