import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { extractPages } from '@/lib/pdf/organize';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('extract-pages')!;

export function ExtractPages() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const { doc } = usePdfRenderer(file?.bytes ?? null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
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

  function selectAll() {
    if (!doc) return;
    setSelected(new Set(Array.from({ length: doc.numPages }, (_, i) => i)));
  }

  async function handleExtract() {
    if (!file || selected.size === 0) return;
    setBusy(true);
    try {
      // Preserve ascending page order in the output.
      const indices = [...selected].sort((a, b) => a - b);
      const out = await extractPages(file.bytes, indices);
      downloadBytes(out, ensurePdfName(`${file.name}-extracted`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to extract from" onFiles={handleFiles} />
      ) : (
        <>
          <div
            className="toolbar"
            style={{ marginTop: 0, marginBottom: 'var(--space-4)' }}
          >
            <button className="btn btn-secondary btn-sm" onClick={selectAll}>
              Select all
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
            >
              Clear
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              {selected.size} selected
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
                onClick={handleExtract}
                disabled={busy || selected.size === 0}
              >
                {busy
                  ? 'Extracting…'
                  : `Extract ${selected.size || ''} & download`}
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
                  {selected.has(i) && <span className="thumb__badge">✓</span>}
                  <PageCanvas doc={doc} pageNumber={i + 1} width={120} />
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
