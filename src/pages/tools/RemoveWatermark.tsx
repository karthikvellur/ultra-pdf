import { useRef, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { removeWatermarkAnnotations } from '@/lib/pdf/watermark';
import { serverRedactRegions, type RedactRegion } from '@/lib/api/operations';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import { downloadBytes, ensurePdfName, formatBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('remove-watermark')!;
const PAGE_WIDTH = 520;

type Mode = 'annotations' | 'redact';

export function RemoveWatermark() {
  const { status } = useBackend();
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>('annotations');
  const [pageIndex, setPageIndex] = useState(0);
  const [regions, setRegions] = useState<RedactRegion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // In-progress rectangle while dragging (normalized to current page).
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [draftRect, setDraftRect] = useState<RedactRegion | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const { doc } = usePdfRenderer(file?.bytes ?? null);
  const serverUp = status === 'online';

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setRegions([]);
    setError(null);
    setResult(null);
    setPageIndex(0);
  }

  async function handleStripAnnotations() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await removeWatermarkAnnotations(file.bytes);
      if (res.annotationsRemoved > 0) {
        downloadBytes(res.bytes, ensurePdfName(`${file.name}-no-watermark`));
        setResult(
          `Removed ${res.annotationsRemoved} watermark annotation${res.annotationsRemoved === 1 ? '' : 's'} and downloaded the cleaned PDF.`,
        );
      } else {
        setResult(
          'No removable watermark annotations found. If the watermark is painted into the page, switch to “Redact regions”.',
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not process this PDF.');
    } finally {
      setBusy(false);
    }
  }

  function norm(e: React.MouseEvent) {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function down(e: React.MouseEvent) {
    dragStart.current = norm(e);
  }
  function move(e: React.MouseEvent) {
    if (!dragStart.current) return;
    const cur = norm(e);
    const s = dragStart.current;
    setDraftRect({
      page: pageIndex,
      x: Math.min(s.x, cur.x),
      y: Math.min(s.y, cur.y),
      w: Math.abs(cur.x - s.x),
      h: Math.abs(cur.y - s.y),
    });
  }
  function up() {
    if (draftRect && draftRect.w > 0.01 && draftRect.h > 0.01) {
      setRegions((prev) => [...prev, draftRect]);
    }
    dragStart.current = null;
    setDraftRect(null);
  }

  async function handleRedact() {
    if (!file || regions.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await serverRedactRegions(file.bytes, `${file.name}.pdf`, regions);
      downloadBytes(res.bytes, ensurePdfName(`${file.name}-redacted`));
      setResult(`Covered ${regions.length} region(s) and downloaded the result.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Redaction failed.');
    } finally {
      setBusy(false);
    }
  }

  const pageRegions = regions.filter((r) => r.page === pageIndex);

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a watermarked PDF" onFiles={handleFiles} />
      ) : (
        <>
          <div className="sig-tabs" style={{ marginBottom: 'var(--space-4)' }}>
            <button
              className={`btn btn-secondary btn-sm ${mode === 'annotations' ? 'active' : ''}`}
              onClick={() => setMode('annotations')}
            >
              Strip annotations
            </button>
            <button
              className={`btn btn-secondary btn-sm ${mode === 'redact' ? 'active' : ''}`}
              onClick={() => setMode('redact')}
            >
              Redact regions
            </button>
            <span className="muted" style={{ alignSelf: 'center', fontSize: 12 }}>
              {formatBytes(file.bytes.length)}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setFile(null)}
            >
              Change file
            </button>
          </div>

          {mode === 'annotations' ? (
            <div className="card panel">
              <p className="notice notice--info">
                Removes watermarks added as PDF <strong>annotations</strong>{' '}
                (stamps, freetext, watermark layers) — lossless and instant. For
                watermarks painted into the page itself, use{' '}
                <strong>Redact regions</strong>.
              </p>
              {error && <p className="notice notice--error">{error}</p>}
              {result && <p className="notice notice--success">{result}</p>}
              <div className="toolbar">
                <button
                  className="btn btn-primary"
                  onClick={handleStripAnnotations}
                  disabled={busy}
                >
                  {busy ? 'Processing…' : 'Strip watermark annotations'}
                </button>
              </div>
            </div>
          ) : (
            <div className="editor">
              <div className="card editor__tools">
                <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                  Drag over the watermark to mark areas to cover. Boxes are
                  painted opaque white on the server.
                </p>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setRegions([])}
                  disabled={regions.length === 0}
                >
                  Clear boxes ({regions.length})
                </button>

                {!serverUp && (
                  <p className="notice notice--warning" style={{ fontSize: 12 }}>
                    Redaction needs the backend (currently offline).
                  </p>
                )}
                {error && <p className="notice notice--error">{error}</p>}
                {result && <p className="notice notice--success">{result}</p>}

                <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--color-border)' }} />
                <button
                  className="btn btn-primary"
                  onClick={handleRedact}
                  disabled={busy || regions.length === 0 || !serverUp}
                >
                  {busy ? 'Redacting…' : 'Redact & download'}
                </button>
              </div>

              <div className="editor__stage">
                {doc && (
                  <div className="page-nav">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
                      disabled={pageIndex === 0}
                    >
                      ‹ Prev
                    </button>
                    <span className="muted">
                      Page {pageIndex + 1} of {doc.numPages}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        setPageIndex((i) => Math.min(doc.numPages - 1, i + 1))
                      }
                      disabled={pageIndex >= doc.numPages - 1}
                    >
                      Next ›
                    </button>
                  </div>
                )}
                {doc && (
                  <div className="editor__page" style={{ width: PAGE_WIDTH }}>
                    <PageCanvas
                      key={pageIndex}
                      doc={doc}
                      pageNumber={pageIndex + 1}
                      width={PAGE_WIDTH}
                    />
                    <div
                      ref={overlayRef}
                      className="editor__overlay"
                      onMouseDown={down}
                      onMouseMove={move}
                      onMouseUp={up}
                      onMouseLeave={up}
                    >
                      {[...pageRegions, ...(draftRect ? [draftRect] : [])].map(
                        (r, i) => (
                          <div
                            key={i}
                            style={{
                              position: 'absolute',
                              left: `${r.x * 100}%`,
                              top: `${r.y * 100}%`,
                              width: `${r.w * 100}%`,
                              height: `${r.h * 100}%`,
                              background: 'rgba(220,38,38,0.25)',
                              border: '1.5px solid var(--color-primary)',
                              pointerEvents: 'none',
                            }}
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </ToolShell>
  );
}
