import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { ServerGate } from '@/components/ServerGate';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { serverCompress } from '@/lib/api/operations';
import { downloadBytes, ensurePdfName, formatBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('compress')!;

type Level = 'low' | 'medium' | 'high';
const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: 'high', label: 'Light', hint: 'Best quality (≈300 dpi)' },
  { value: 'medium', label: 'Balanced', hint: 'Good size & quality (≈150 dpi)' },
  { value: 'low', label: 'Strong', hint: 'Smallest file (≈72 dpi)' },
];

export function CompressPdf() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [level, setLevel] = useState<Level>('medium');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ before: number; after: number } | null>(
    null,
  );

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setError(null);
    setResult(null);
  }

  async function handleCompress() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await serverCompress(file.bytes, `${file.name}.pdf`, level);
      setResult({ before: file.bytes.length, after: res.bytes.length });
      downloadBytes(res.bytes, ensurePdfName(`${file.name}-compressed`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not compress PDF.');
    } finally {
      setBusy(false);
    }
  }

  const saved =
    result && result.before > 0
      ? Math.max(0, Math.round((1 - result.after / result.before) * 100))
      : 0;

  return (
    <ToolShell tool={TOOL}>
      <ServerGate requiredTool="ghostscript">
        {!file ? (
          <Dropzone label="Drop a PDF to compress" onFiles={handleFiles} />
        ) : (
          <div className="card panel">
            <div className="file-chip">
              <div className="file-chip__meta">
                <span className="file-chip__name">{file.name}.pdf</span>
                <span className="muted">{formatBytes(file.bytes.length)}</span>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setFile(null)}
              >
                Change file
              </button>
            </div>

            <div className="field" style={{ marginTop: 'var(--space-4)' }}>
              <label>Compression level</label>
              <div className="level-pick">
                {LEVELS.map((l) => (
                  <button
                    key={l.value}
                    className={`level-option ${level === l.value ? 'level-option--active' : ''}`}
                    onClick={() => setLevel(l.value)}
                  >
                    <span className="level-option__label">{l.label}</span>
                    <span className="level-option__hint">{l.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="notice notice--error">{error}</p>}
            {result && (
              <p className="notice notice--success">
                {saved > 0 ? (
                  <>
                    Reduced by {saved}% — {formatBytes(result.before)} →{' '}
                    {formatBytes(result.after)}. Downloaded.
                  </>
                ) : (
                  <>
                    This PDF was already well-optimized, so we kept the original
                    ({formatBytes(result.after)}).
                  </>
                )}
              </p>
            )}

            <div className="toolbar">
              <button
                className="btn btn-primary"
                onClick={handleCompress}
                disabled={busy}
              >
                {busy ? 'Compressing…' : 'Compress & download'}
              </button>
            </div>
          </div>
        )}
      </ServerGate>
    </ToolShell>
  );
}
