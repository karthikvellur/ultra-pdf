import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { reorderPages } from '@/lib/pdf/organize';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('organize-pages')!;

interface Slot {
  /** Stable key for React. */
  key: string;
  /** Zero-based index into the source document. */
  src: number;
}

export function OrganizePages() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [slots, setSlots] = useState<Slot[]>([]);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0);

  const { doc } = usePdfRenderer(file?.bytes ?? null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    const bytes = await fileToBytes(f);
    setFile({ name: stripPdfExtension(f.name), bytes });
    setSlots([]);
    setSeq(0);
  }

  // Build the initial slot list once we know the page count.
  if (doc && slots.length === 0) {
    setSlots(
      Array.from({ length: doc.numPages }, (_, i) => ({
        key: `init-${i}`,
        src: i,
      })),
    );
    setSeq(doc.numPages);
  }

  function move(index: number, dir: -1 | 1) {
    setSlots((prev) => {
      const next = [...prev];
      const t = index + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
  }

  function duplicate(index: number) {
    setSlots((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, { key: `dup-${seq}`, src: prev[index].src });
      return next;
    });
    setSeq((s) => s + 1);
  }

  function remove(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleApply() {
    if (!file) return;
    setBusy(true);
    try {
      const out = await reorderPages(
        file.bytes,
        slots.map((s) => s.src),
      );
      downloadBytes(out, ensurePdfName(`${file.name}-organized`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to organize" onFiles={handleFiles} />
      ) : (
        <>
          <div
            className="toolbar"
            style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}
          >
            <span className="muted" style={{ fontSize: 13 }}>
              {slots.length} page{slots.length === 1 ? '' : 's'} · use the
              controls on each page to reorder, duplicate, or delete.
            </span>
            <div
              style={{
                marginLeft: 'auto',
                display: 'flex',
                gap: 'var(--space-3)',
              }}
            >
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={busy || slots.length === 0}
              >
                {busy ? 'Saving…' : 'Apply & download'}
              </button>
              <button className="btn btn-ghost" onClick={() => setFile(null)}>
                Change file
              </button>
            </div>
          </div>

          {doc && slots.length > 0 ? (
            <div className="thumb-grid">
              {slots.map((slot, i) => (
                <div key={slot.key} className="thumb thumb--organize">
                  <span className="thumb__badge thumb__badge--muted">
                    {i + 1}
                  </span>
                  <PageCanvas doc={doc} pageNumber={slot.src + 1} width={120} />
                  <span className="thumb__caption">
                    source p.{slot.src + 1}
                  </span>
                  <div className="thumb__controls">
                    <button
                      className="icon-btn"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      aria-label="Move left"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => duplicate(i)}
                      aria-label="Duplicate"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => remove(i)}
                      aria-label="Delete"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => move(i, 1)}
                      disabled={i === slots.length - 1}
                      aria-label="Move right"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </div>
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
