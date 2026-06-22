import { useRef, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import {
  applyAnnotations,
  hexToRgb,
  type Annotation,
} from '@/lib/pdf/edit';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('edit')!;
const PAGE_WIDTH = 560;

type Mode = 'text' | 'draw';

export function EditPdf() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('text');
  const [color, setColor] = useState('#dc2626');
  const [fontSize, setFontSize] = useState(16);
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [busy, setBusy] = useState(false);

  // In-progress freehand stroke (normalized points).
  const drawing = useRef<{ x: number; y: number }[] | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [, force] = useState(0);

  const { doc, loading } = usePdfRenderer(file?.bytes ?? null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setAnnotations([]);
    setPageIndex(0);
  }

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
      {
        type: 'text',
        pageIndex,
        x,
        y,
        text,
        fontSize,
        color: hexToRgb(color),
      },
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

  async function handleSave() {
    if (!file) return;
    setBusy(true);
    try {
      const out = await applyAnnotations(file.bytes, annotations);
      downloadBytes(out, ensurePdfName(`${file.name}-edited`));
    } finally {
      setBusy(false);
    }
  }

  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);

  return (
    <ToolShell title={TOOL.title} description={TOOL.description} icon={TOOL.icon}>
      {!file ? (
        <Dropzone label="Drop a PDF to edit" onFiles={handleFiles} />
      ) : (
        <div className="editor">
          <div className="card editor__tools">
            <div className="field">
              <label>Tool</label>
              <div className="tool-pick">
                <button
                  className={`btn btn-secondary btn-sm ${mode === 'text' ? 'active' : ''}`}
                  onClick={() => setMode('text')}
                >
                  Text
                </button>
                <button
                  className={`btn btn-secondary btn-sm ${mode === 'draw' ? 'active' : ''}`}
                  onClick={() => setMode('draw')}
                >
                  Draw
                </button>
              </div>
            </div>

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

            {mode === 'text' ? (
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
            ) : (
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

            <hr style={{ width: '100%', border: 0, borderTop: '1px solid var(--color-border)' }} />

            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={busy || annotations.length === 0}
            >
              {busy ? 'Saving…' : 'Save & download'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Change file
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

            {loading && <span className="muted">Loading…</span>}

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
