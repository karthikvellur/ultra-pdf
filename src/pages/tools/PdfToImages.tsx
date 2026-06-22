import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { serverPdfToImages } from '@/lib/api/operations';
import { openForRender } from '@/lib/pdf/render';
import { downloadBlob, downloadBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('pdf-to-image')!;

export function PdfToImages() {
  const { status } = useBackend();
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [fmt, setFmt] = useState<'png' | 'jpeg'>('png');
  const [dpi, setDpi] = useState(150);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const serverUp = status === 'online';

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setError(null);
    setDone(null);
  }

  async function handleExport() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (serverUp) {
        // High-fidelity poppler render, returns a ZIP.
        const res = await serverPdfToImages(file.bytes, `${file.name}.pdf`, fmt, dpi);
        downloadBytes(res.bytes, res.filename, 'application/zip');
        setDone(`Exported via server (${fmt.toUpperCase()}, ${dpi} dpi).`);
      } else {
        // Client fallback: render pages to canvas and zip them ourselves.
        await clientExport(file.name, file.bytes, fmt);
        setDone(`Exported in your browser (${fmt.toUpperCase()}).`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to export as images" onFiles={handleFiles} />
      ) : (
        <div className="card panel">
          <div className="file-chip">
            <div className="file-chip__meta">
              <span className="file-chip__name">{file.name}.pdf</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Change file
            </button>
          </div>

          <div className="field-row" style={{ marginTop: 'var(--space-4)' }}>
            <div className="field">
              <label htmlFor="img-fmt">Format</label>
              <select
                id="img-fmt"
                value={fmt}
                onChange={(e) => setFmt(e.target.value as 'png' | 'jpeg')}
              >
                <option value="png">PNG (lossless)</option>
                <option value="jpeg">JPG (smaller)</option>
              </select>
            </div>
            {serverUp && (
              <div className="field">
                <label htmlFor="img-dpi">Resolution: {dpi} dpi</label>
                <input
                  id="img-dpi"
                  type="range"
                  min={72}
                  max={300}
                  step={6}
                  value={dpi}
                  onChange={(e) => setDpi(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <p className={`notice ${serverUp ? 'notice--success' : 'notice--info'}`}>
            {serverUp
              ? 'The server will render pages at full fidelity and return a ZIP.'
              : 'Server offline — exporting in your browser instead. A single page downloads directly; multiple pages download one by one.'}
          </p>

          {error && <p className="notice notice--error">{error}</p>}
          {done && <p className="notice notice--success">{done}</p>}

          <div className="toolbar">
            <button className="btn btn-primary" onClick={handleExport} disabled={busy}>
              {busy ? 'Exporting…' : 'Export images'}
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

/** Browser fallback: render each page to a canvas and download as images. */
async function clientExport(
  name: string,
  bytes: Uint8Array,
  fmt: 'png' | 'jpeg',
): Promise<void> {
  const doc = await openForRender(bytes);
  try {
    const ext = fmt === 'jpeg' ? 'jpg' : 'png';
    const mime = fmt === 'jpeg' ? 'image/jpeg' : 'image/png';
    for (let i = 1; i <= doc.numPages; i++) {
      const canvas = await doc.renderPage(i, 1240); // ~150 dpi at A4 width
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), mime, 0.92),
      );
      if (blob) downloadBlob(blob, `${name}-page-${String(i).padStart(3, '0')}.${ext}`);
    }
  } finally {
    doc.destroy();
  }
}
