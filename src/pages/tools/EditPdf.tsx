import { useEffect, useRef, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { TextLayerOverlay } from '@/components/TextLayerOverlay';
import { getTool } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { applyAnnotations, hexToRgb, type Annotation } from '@/lib/pdf/edit';
import {
  getEditOps,
  applyInlineTextEdits,
  type TextRun,
} from '@/lib/pdf/inlineEdit';
import { extractTextRuns } from '@/lib/pdf/textExtract';
import { serverEditText } from '@/lib/api/textOps';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('edit')!;
const PAGE_WIDTH = 560;

type Mode = 'inline' | 'text' | 'draw';

export function EditPdf() {
  const { status } = useBackend();
  const serverUp = status === 'online';

  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('inline');
  const [color, setColor] = useState('#dc2626');
  const [fontSize, setFontSize] = useState(16);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    kind: 'info' | 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // --- inline text editing state: runs per page, keyed by pageIndex ---
  const [runsByPage, setRunsByPage] = useState<Record<number, TextRun[]>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);

  // In-progress freehand stroke (normalized points).
  const drawing = useRef<{ x: number; y: number }[] | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  const { doc, loading } = usePdfRenderer(file?.bytes ?? null);

  // Extract editable text runs for the current page when in inline mode.
  useEffect(() => {
    if (!doc || mode !== 'inline') return;
    if (runsByPage[pageIndex]) return; // already extracted
    let cancelled = false;
    setLoadingRuns(true);
    extractTextRuns(doc, pageIndex + 1)
      .then((runs) => {
        if (!cancelled) setRunsByPage((prev) => ({ ...prev, [pageIndex]: runs }));
      })
      .catch(() => {
        /* leave page without runs; user can still use text/draw */
      })
      .finally(() => {
        if (!cancelled) setLoadingRuns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, mode, pageIndex, runsByPage]);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setAnnotations([]);
    setRunsByPage({});
    setActiveRunId(null);
    setPageIndex(0);
    setNotice(null);
  }

  // ---- inline edit handlers ----
  const currentRuns = runsByPage[pageIndex] ?? [];

  function editRun(id: string, value: string) {
    setRunsByPage((prev) => ({
      ...prev,
      [pageIndex]: (prev[pageIndex] ?? []).map((r) =>
        r.id === id ? { ...r, edited: value } : r,
      ),
    }));
  }

  const allRuns = Object.values(runsByPage).flat();
  const pendingEdits = getEditOps(allRuns);

  // ---- freeform (text/draw) handlers ----
  function normFromEvent(e: React.MouseEvent): { x: number; y: number } {
    const rect = overlayRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function handleOverlayClick(e: React.MouseEvent) {
    if (mode !== 'text') return;
    const { x, y } = normFromEvent(e);
    const text = window.prompt('Enter text to place:');
    if (!text) return;
    setAnnotations((prev) => [
      ...prev,
      { type: 'text', pageIndex, x, y, text, fontSize, color: hexToRgb(color) },
    ]);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (mode !== 'draw') return;
    drawing.current = [normFromEvent(e)];
    force((n) => n + 1);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (mode !== 'draw' || !drawing.current) return;
    drawing.current.push(normFromEvent(e));
    force((n) => n + 1);
  }

  function handleMouseUp() {
    if (mode !== 'draw' || !drawing.current) return;
    const pts = drawing.current;
    drawing.current = null;
    if (pts.length > 1) {
      setAnnotations((prev) => [
        ...prev,
        {
          type: 'stroke',
          pageIndex,
          points: pts,
          color: hexToRgb(color),
          width: strokeWidth,
        },
      ]);
    }
    force((n) => n + 1);
  }

  function undo() {
    setAnnotations((prev) => prev.slice(0, -1));
  }

  const hasChanges = annotations.length > 0 || pendingEdits.length > 0;

  async function handleSave() {
    if (!file || !hasChanges) return;
    setBusy(true);
    setNotice(null);
    try {
      let working = file.bytes;
      // A fidelity caveat to surface alongside the success message, if any.
      let caveat: string | null = null;

      // 1. Apply inline text edits (server preferred, client fallback).
      if (pendingEdits.length > 0) {
        if (serverUp) {
          const res = await serverEditText(
            working,
            `${file.name}.pdf`,
            pendingEdits,
          );
          working = res.bytes;
          if (res.fontFallback) {
            caveat =
              'Some original fonts couldn’t be reused (subset/embedded), so a close-matching standard font was used for the edited text.';
          }
        } else {
          working = await applyInlineTextEdits(working, pendingEdits);
          caveat =
            'Server offline — edited text was redrawn with a standard font (lower fidelity). Start the backend for embedded-font matching.';
        }
      }

      // 2. Apply freeform annotations (always client-side).
      if (annotations.length > 0) {
        working = await applyAnnotations(working, annotations);
      }

      downloadBytes(working, ensurePdfName(`${file.name}-edited`));
      setNotice(
        caveat
          ? { kind: 'warning', text: `Edited PDF downloaded. ${caveat}` }
          : { kind: 'success', text: 'Edited PDF downloaded.' },
      );
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Could not save edits.',
      });
    } finally {
      setBusy(false);
    }
  }

  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to edit" onFiles={handleFiles} />
      ) : (
        <div className="editor">
          <div className="card editor__tools">
            <div className="field">
              <label>Tool</label>
              <div className="tool-pick tool-pick--col">
                <button
                  className={`btn btn-secondary btn-sm ${mode === 'inline' ? 'active' : ''}`}
                  onClick={() => setMode('inline')}
                >
                  Edit text
                </button>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    className={`btn btn-secondary btn-sm ${mode === 'text' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setMode('text')}
                  >
                    Add text
                  </button>
                  <button
                    className={`btn btn-secondary btn-sm ${mode === 'draw' ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setMode('draw')}
                  >
                    Draw
                  </button>
                </div>
              </div>
            </div>

            {mode === 'inline' && (
              <p className="muted" style={{ fontSize: 12 }}>
                Click any line of existing text to edit it in place.
                {pendingEdits.length > 0 && (
                  <>
                    {' '}
                    <strong>{pendingEdits.length}</strong> edit
                    {pendingEdits.length === 1 ? '' : 's'} pending.
                  </>
                )}
              </p>
            )}

            {mode !== 'inline' && (
              <div className="field" style={{ flex: '0 0 auto' }}>
                <label htmlFor="ed-color">Color</label>
                <input
                  id="ed-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: '100%', height: 38, padding: 2 }}
                />
              </div>
            )}

            {mode === 'text' && (
              <div className="field">
                <label htmlFor="ed-size">Text size: {fontSize}pt</label>
                <input
                  id="ed-size"
                  type="range"
                  min={8}
                  max={48}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </div>
            )}
            {mode === 'draw' && (
              <div className="field">
                <label htmlFor="ed-stroke">Stroke: {strokeWidth}px</label>
                <input
                  id="ed-stroke"
                  type="range"
                  min={1}
                  max={12}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                />
              </div>
            )}

            {mode === 'draw' || mode === 'text' ? (
              <>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={undo}
                  disabled={annotations.length === 0}
                >
                  Undo last
                </button>
                <p className="muted" style={{ fontSize: 12 }}>
                  {mode === 'text'
                    ? 'Click on the page to place text.'
                    : 'Click and drag to draw.'}
                </p>
              </>
            ) : null}

            <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--color-border)' }} />

            <p
              className="muted"
              style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span
                className="backend-status__dot"
                style={{
                  background: serverUp
                    ? 'var(--color-success)'
                    : 'var(--color-text-subtle)',
                }}
              />
              {serverUp
                ? 'Text edits use the server (best font fidelity).'
                : 'Server offline — text edits use a standard-font fallback.'}
            </p>

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={busy || !hasChanges}
            >
              {busy ? 'Saving…' : 'Save & download'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Change file
            </button>

            {notice && (
              <p className={`notice notice--${notice.kind}`} style={{ marginBottom: 0 }}>
                {notice.text}
              </p>
            )}
          </div>

          <div className="editor__stage">
            {doc && (
              <div className="page-nav">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPageIndex((i) => Math.max(0, i - 1));
                    setActiveRunId(null);
                  }}
                  disabled={pageIndex === 0}
                >
                  ‹ Prev
                </button>
                <span className="muted">
                  Page {pageIndex + 1} of {doc.numPages}
                  {mode === 'inline' && loadingRuns ? ' · scanning text…' : ''}
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setPageIndex((i) => Math.min(doc.numPages - 1, i + 1));
                    setActiveRunId(null);
                  }}
                  disabled={pageIndex >= doc.numPages - 1}
                >
                  Next ›
                </button>
              </div>
            )}

            {loading && <span className="muted">Loading…</span>}

            {doc && (
              <div className="editor__page" style={{ width: PAGE_WIDTH }}>
                <PageCanvas
                  key={pageIndex}
                  doc={doc}
                  pageNumber={pageIndex + 1}
                  width={PAGE_WIDTH}
                />

                {mode === 'inline' ? (
                  <TextLayerOverlay
                    runs={currentRuns}
                    width={PAGE_WIDTH}
                    height={PAGE_WIDTH * 1.3}
                    activeRunId={activeRunId}
                    onActivate={setActiveRunId}
                    onEdit={editRun}
                    onCommit={() => setActiveRunId(null)}
                    onCancel={() => setActiveRunId(null)}
                  />
                ) : (
                  <div
                    ref={overlayRef}
                    className="editor__overlay"
                    onClick={handleOverlayClick}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  >
                    <AnnotationLayer
                      annotations={pageAnnotations}
                      liveStroke={drawing.current}
                      liveColor={color}
                      liveWidth={strokeWidth}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}

function AnnotationLayer({
  annotations,
  liveStroke,
  liveColor,
  liveWidth,
}: {
  annotations: Annotation[];
  liveStroke: { x: number; y: number }[] | null;
  liveColor: string;
  liveWidth: number;
}) {
  const toPct = (n: number) => `${n * 100}%`;
  return (
    <>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      >
        {annotations
          .filter((a): a is Extract<Annotation, { type: 'stroke' }> => a.type === 'stroke')
          .map((s, i) => (
            <polyline
              key={i}
              points={s.points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
              fill="none"
              stroke={`rgb(${s.color.r * 255},${s.color.g * 255},${s.color.b * 255})`}
              strokeWidth={s.width / 5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        {liveStroke && liveStroke.length > 1 && (
          <polyline
            points={liveStroke.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
            fill="none"
            stroke={liveColor}
            strokeWidth={liveWidth / 5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {annotations
        .filter((a): a is Extract<Annotation, { type: 'text' }> => a.type === 'text')
        .map((t, i) => (
          <span
            key={i}
            className="editor__text-ann"
            style={{
              left: toPct(t.x),
              top: toPct(t.y),
              fontSize: t.fontSize,
              color: `rgb(${t.color.r * 255},${t.color.g * 255},${t.color.b * 255})`,
            }}
          >
            {t.text}
          </span>
        ))}
    </>
  );
}
