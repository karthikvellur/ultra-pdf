import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { removePassword } from '@/lib/pdf/security';
import { serverUnlock } from '@/lib/api/operations';
import { ApiError } from '@/lib/api/client';
import { downloadBytes, ensurePdfName, formatBytes } from '@/lib/pdf/download';
import { PdfPasswordError } from '@/lib/pdf/types';

const TOOL = getTool('remove-password')!;

export function RemovePassword() {
  const { status } = useBackend();
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const serverUp = status === 'online';

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setError(null);
    setDone(null);
  }

  async function handleRemove() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (serverUp) {
        // Preferred path: true decryption, keeps selectable text.
        const res = await serverUnlock(file.bytes, `${file.name}.pdf`, password);
        downloadBytes(res.bytes, ensurePdfName(`${file.name}-unlocked`));
        setDone('Unlocked with selectable text preserved.');
      } else {
        // Fallback: client-side rasterize (text becomes images).
        setProgress({ done: 0, total: 1 });
        const res = await removePassword(file.bytes, password, 1654, (d, t) =>
          setProgress({ done: d, total: t }),
        );
        downloadBytes(res.bytes, ensurePdfName(`${file.name}-unlocked`));
        setDone('Unlocked in your browser (pages rasterized — text not selectable).');
      }
    } catch (err) {
      if (
        err instanceof PdfPasswordError ||
        (err instanceof ApiError && err.code === 'wrong_password')
      ) {
        setError('Incorrect password. Please check it and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not unlock this PDF.');
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <ToolShell tool={TOOL}>
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
                setDone(null);
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

          <p className={`notice ${serverUp ? 'notice--success' : 'notice--warning'}`}>
            {serverUp ? (
              <>
                The server will truly decrypt this PDF, keeping{' '}
                <strong>selectable text</strong> and structure intact.
              </>
            ) : (
              <>
                Server offline — unlocking in your browser instead. Pages are
                re-rendered as images, so text won’t be selectable. Start the
                backend for a text-preserving unlock.
              </>
            )}
          </p>

          {error && <p className="notice notice--error">{error}</p>}
          {done && !error && <p className="notice notice--success">{done}</p>}

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
