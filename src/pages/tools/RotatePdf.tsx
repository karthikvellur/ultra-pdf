import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { rotatePages } from '@/lib/pdf/organize';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('rotate')!;

export function RotatePdf() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  // Per-page quarter-turn rotation chosen in the UI (0..3).
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const { doc } = usePdfRenderer(file?.bytes ?? null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setRotations({});
    setSelected(new Set());
  }

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function rotateSelected(dir: 1 | -1) {
    const targets = selected.size > 0
      ? [...selected]
      : doc
        ? Array.from({ length: doc.numPages }, (_, i) => i)
        : [];
    setRotations((prev) => {
      const next = { ...prev };
      for (const i of targets) {
        next[i] = (((next[i] ?? 0) + dir) % 4 + 4) % 4;
      }
      return next;
    });
  }

  async function handleApply() {
    if (!file || !doc) return;
    setBusy(true);
    try {
      // Apply per-page rotations in one pass by grouping pages with the same turn.
      let working = file.bytes;
      for (let turns = 1; turns <= 3; turns++) {
        const pages = Object.entries(rotations)
          .filter(([, t]) => t === turns)
          .map(([i]) => Number(i));
        if (pages.length > 0) {
          working = await rotatePages(working, turns, pages);
        }
      }
      downloadBytes(working, ensurePdfName(`${file.name}-rotated`));
    } finally {
      setBusy(false);
    }
  }

  const hasRotations = Object.values(rotations).some((t) => t !== 0);

  return (
    <ToolShell title={TOOL.title} description={TOOL.description} icon={TOOL.icon}>
      {!file ? (
        <Dropzone label="Drop a PDF to rotate" onFiles={handleFiles} />
      ) : (
        <>
          <div className="toolbar" style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}>
            <button className="btn btn-secondary" onClick={() => rotateSelected(-1)}>
              ↺ Rotate left
            </button>
            <button className="btn btn-secondary" onClick={() => rotateSelected(1)}>
              ↻ Rotate right
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              {selected.size > 0
                ? `${selected.size} page(s) selected`
                : 'No selection — rotates all pages'}
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 'var(--space-3)' }}>
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={busy || !hasRotations}
              >
                {busy ? 'Saving…' : 'Apply & download'}
              </button>
              <button className="btn btn-ghost" onClick={() => setFile(null)}>
                Change file
              </button>
            </div>
          </div>

          {doc ? (
            <div className="thumb-grid">
              {Array.from({ length: doc.numPages }, (_, i) => i).map((i) => (
                <div
                  key={i}
                  className={`thumb ${selected.has(i) ? 'thumb--selected' : ''}`}
                  onClick={() => toggle(i)}
                >
                  {(rotations[i] ?? 0) !== 0 && (
                    <span className="thumb__badge">
                      {((rotations[i] ?? 0) * 90)}°
                    </span>
                  )}
                  <div
                    style={{
                      transform: `rotate(${(rotations[i] ?? 0) * 90}deg)`,
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <PageCanvas doc={doc} pageNumber={i + 1} width={110} />
                  </div>
                  <span className="thumb__caption">Page {i + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Loading pages…</p>
          )}
        </>
      )}
    </ToolShell>
  );
}
