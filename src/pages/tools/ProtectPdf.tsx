import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { ServerGate } from '@/components/ServerGate';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { serverProtect } from '@/lib/api/operations';
import { ApiError } from '@/lib/api/client';
import { downloadBytes, ensurePdfName, formatBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('protect')!;

export function ProtectPdf() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setError(null);
    setDone(false);
  }

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleProtect() {
    if (!file || !password || mismatch) return;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const res = await serverProtect(file.bytes, `${file.name}.pdf`, {
        userPassword: password,
        allowPrinting,
        allowCopying,
      });
      downloadBytes(res.bytes, ensurePdfName(`${file.name}-protected`));
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_encrypted') {
        setError('This PDF is already encrypted. Unlock it first, then protect.');
      } else {
        setError(err instanceof Error ? err.message : 'Could not protect PDF.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      <ServerGate requiredTool="qpdf">
        {!file ? (
          <Dropzone label="Drop a PDF to protect" onFiles={handleFiles} />
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

            <div className="field-row" style={{ marginTop: 'var(--space-4)' }}>
              <div className="field">
                <label htmlFor="pw">Password</label>
                <input
                  id="pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Set an open password"
                  autoFocus
                />
              </div>
              <div className="field">
                <label htmlFor="pw2">Confirm password</label>
                <input
                  id="pw2"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Re-enter password"
                />
              </div>
            </div>
            {mismatch && (
              <p className="notice notice--error">Passwords don’t match.</p>
            )}

            <div className="field">
              <label>Permissions</label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  fontWeight: 400,
                }}
              >
                <input
                  type="checkbox"
                  checked={allowPrinting}
                  onChange={(e) => setAllowPrinting(e.target.checked)}
                />
                Allow printing
              </label>
              <label
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  fontWeight: 400,
                }}
              >
                <input
                  type="checkbox"
                  checked={allowCopying}
                  onChange={(e) => setAllowCopying(e.target.checked)}
                />
                Allow copying text
              </label>
            </div>

            <p className="notice notice--info">
              Encryption uses AES-256 (qpdf). The original text and structure are
              preserved.
            </p>

            {error && <p className="notice notice--error">{error}</p>}
            {done && !error && (
              <p className="notice notice--success">
                Protected PDF downloaded.
              </p>
            )}

            <div className="toolbar">
              <button
                className="btn btn-primary"
                onClick={handleProtect}
                disabled={busy || !password || mismatch}
              >
                {busy ? 'Encrypting…' : 'Protect & download'}
              </button>
            </div>
          </div>
        )}
      </ServerGate>
    </ToolShell>
  );
}
