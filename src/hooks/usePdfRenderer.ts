import { useEffect, useState } from 'react';
import { openForRender, type RenderableDoc } from '@/lib/pdf/render';
import { PdfPasswordError } from '@/lib/pdf/types';

interface RendererState {
  doc: RenderableDoc | null;
  loading: boolean;
  needsPassword: boolean;
  error: string | null;
}

/**
 * Opens a PDF (bytes) for on-screen rendering with pdf.js. Re-opens whenever
 * `bytes` or `password` change. Cleans up the previous document on change.
 */
export function usePdfRenderer(
  bytes: Uint8Array | null,
  password?: string,
): RendererState {
  const [state, setState] = useState<RendererState>({
    doc: null,
    loading: false,
    needsPassword: false,
    error: null,
  });

  useEffect(() => {
    if (!bytes) {
      setState({ doc: null, loading: false, needsPassword: false, error: null });
      return;
    }

    let cancelled = false;
    let opened: RenderableDoc | null = null;
    setState((s) => ({ ...s, loading: true, error: null }));

    openForRender(bytes, password)
      .then((doc) => {
        if (cancelled) {
          doc.destroy();
          return;
        }
        opened = doc;
        setState({ doc, loading: false, needsPassword: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof PdfPasswordError) {
          setState({
            doc: null,
            loading: false,
            needsPassword: true,
            error: null,
          });
        } else {
          setState({
            doc: null,
            loading: false,
            needsPassword: false,
            error: err instanceof Error ? err.message : 'Failed to open PDF.',
          });
        }
      });

    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [bytes, password]);

  return state;
}
