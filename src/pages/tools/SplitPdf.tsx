import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { fileToBytes, loadPdf } from '@/lib/pdf/load';
import { extractPages, parsePageRanges } from '@/lib/pdf/organize';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('split')!;

export function SplitPdf() {
  const [file, setFile] = useState<{
    name: string;
    bytes: Uint8Array;
    pages: number;
  } | null>(null);
  const [ranges, setRanges] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    const meta = await loadPdf(files[0]);
    setFile({ name: meta.name, bytes: await fileToBytes(files[0]), pages: meta.pageCount });
    setRanges(`1-${meta.pageCount}`);
    setError(null);
  }

  const selected = file ? parsePageRanges(ranges, file.pages) : [];

  async function handleExtract() {
    if (!file) return;
    if (selected.length === 0) {
      setError('No valid pages selected. Try something like "1-3, 5".');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const out = await extractPages(file.bytes, selected);
      downloadBytes(out, ensurePdfName(`${file.name}-pages`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      {!file ? (
        <Dropzone label="Drop a PDF to split" onFiles={handleFiles} />
      ) : (
        <div className="card panel">
          <div className="file-chip">
            <div className="file-chip__meta">
              <span className="file-chip__name">{file.name}.pdf</span>
              <span className="muted">{file.pages} pages</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Change file
            </button>
          </div>

          <div className="field" style={{ marginTop: 'var(--space-4)' }}>
            <label htmlFor="sp-ranges">
              Pages to extract — ranges and lists, e.g. <code>1-3, 5, 8-10</code>
            </label>
            <input
              id="sp-ranges"
              type="text"
              value={ranges}
              onChange={(e) => {
                setRanges(e.target.value);
                setError(null);
              }}
            />
          </div>

          {selected.length > 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              {selected.length} page{selected.length === 1 ? '' : 's'} selected.
            </p>
          )}
          {error && <p className="notice notice--error">{error}</p>}

          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={handleExtract}
              disabled={busy || selected.length === 0}
            >
              {busy ? 'Extracting…' : 'Extract & download'}
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
