import { useEffect, useRef, useState } from 'react';
import type { RenderableDoc } from '@/lib/pdf/render';

interface PageCanvasProps {
  doc: RenderableDoc;
  pageNumber: number;
  /** Target CSS width in px. */
  width: number;
  /** Called with the actual rendered CSS size once a render completes —
   * pages aren't always the portrait-ish aspect ratio callers might assume. */
  onRendered?: (size: { width: number; height: number }) => void;
}

/**
 * Renders a single PDF page into a canvas via pdf.js. Re-renders when the page
 * or width changes.
 *
 * We mount a real <canvas> element via React (so its identity is stable across
 * StrictMode's mount→unmount→mount cycle) and draw into it in an effect. This
 * avoids the trap of imperatively inserting a canvas into a ref captured during
 * a prior, now-detached mount.
 */
export function PageCanvas({ doc, pageNumber, width, onRendered }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendering, setRendering] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRendering(true);
    setFailed(false);

    const task = doc.renderPageInto(canvasRef.current!, pageNumber, width);
    task.promise
      .then(() => {
        if (cancelled) return;
        setRendering(false);
        const canvas = canvasRef.current;
        if (canvas && onRendered) {
          // Actual on-screen size pdf.js just set — pages aren't all the
          // same aspect ratio, so this can differ a lot from width * 1.3.
          onRendered({
            width: parseFloat(canvas.style.width) || width,
            height: parseFloat(canvas.style.height) || width * 1.3,
          });
        }
      })
      .catch((err: unknown) => {
        // A cancelled render (StrictMode remount / fast navigation) is expected.
        if (cancelled || isCancellation(err)) return;
        setFailed(true);
        setRendering(false);
      });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [doc, pageNumber, width, onRendered]);

  return (
    <div
      className="page-canvas"
      style={{
        width,
        minHeight: rendering ? width * 1.3 : undefined,
        background: '#fff',
        boxShadow: 'var(--shadow-md)',
        borderRadius: 4,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-subtle)',
        fontSize: 13,
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: rendering || failed ? 'none' : 'block', width }}
      />
      {rendering && <span>Rendering…</span>}
      {failed && <span>Couldn’t render page</span>}
    </div>
  );
}

function isCancellation(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: string }).name === 'RenderingCancelledException'
  );
}
