import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { removePassword } from '@/lib/pdf/security';
import { downloadBytes, ensurePdfName, formatBytes } from '@/lib/pdf/download';
import { PdfPasswordError } from '@/lib/pdf/types';

const TOOL = getTool('remove-password')!;

export function RemovePassword() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setError(null);
    setDone(false);
  }

  async function handleRemove() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(false);
    setProgress({ done: 0, total: 1 });
    try {
      const result = await removePassword(
        file.bytes,
        password,
        1654,
        (d, t) => setProgress({ done: d, total: t }),
      );
      downloadBytes(result.bytes, ensurePdfName(`${file.name}-unlocked`));
      setDone(true);
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        setError('Incorrect password. Please check it and try again.');
      } else {
        setError(
          err instanceof Error ? err.message : 'Could not unlock this PDF.',
        );
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ToolShell title={TOOL.title} description={TOOL.description} icon={TOOL.icon}>
      {!file ? (
        <Dropzone
          label="Drop a password-protected PDF"
          hint="or click to browse"
          onFiles={handleFiles}
        />
      ) : (
        <div className="card panel">
          <div className="file-chip">
            <div className="file-chip__meta">
              <span className="file-chip__name">{file.name}.pdf</span>
              <span className="muted">{formatBytes(file.bytes.length)}</span>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setFile(null);
                setPassword('');
                setError(null);
                setDone(false);
              }}
            >
              Change file
            </button>
          </div>

          <div className="field" style={{ marginTop: 'var(--space-4)' }}>
            <label htmlFor="pwd">Password</label>
            <input
              id="pwd"
              type="password"
              placeholder="Enter the document's open password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>

          <p className="notice notice--info">
            Decryption happens entirely in your browser. The unlocked pages are
            re-rendered as images, so text in the result won't be selectable —
            a high-fidelity, text-preserving path is planned via an optional
            backend.
          </p>

          {error && <p className="notice notice--error">{error}</p>}
          {done && !error && (
            <p className="notice notice--success">
              Done — your unlocked PDF has been downloaded.
            </p>
          )}

          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={handleRemove}
              disabled={busy || password.length === 0}
            >
              {busy
                ? progress
                  ? `Unlocking… (${progress.done}/${progress.total})`
                  : 'Unlocking…'
                : 'Unlock & download'}
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
