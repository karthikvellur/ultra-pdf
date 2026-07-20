import { useCallback, useState } from 'react';
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
import './tools.css';

const TOOL = getTool('remove-password')!;

type EntryStatus = 'idle' | 'unlocking' | 'ready' | 'error';

interface Entry {
  id: string;
  /** File name without the .pdf extension. */
  name: string;
  bytes: Uint8Array;
  size: number;
  password: string;
  status: EntryStatus;
  /** Progress for the client-side rasterize fallback. */
  progress: { done: number; total: number } | null;
  /** Unlocked bytes, available once status === 'ready'. */
  result: Uint8Array | null;
  message: string | null;
  /** How many times this entry's unlocked file has been downloaded this session. */
  downloadCount: number;
}

export function RemovePassword() {
  const { status } = useBackend();
  const serverUp = status === 'online';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [seq, setSeq] = useState(0);

  const patch = useCallback((id: string, changes: Partial<Entry>) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...changes } : e)),
    );
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      const loaded: Entry[] = [];
      let n = seq;
      for (const f of files) {
        const bytes = await fileToBytes(f);
        loaded.push({
          id: `${Date.now()}-${n++}`,
          name: stripPdfExtension(f.name),
          bytes,
          size: bytes.length,
          password: '',
          status: 'idle',
          progress: null,
          result: null,
          message: null,
          downloadCount: 0,
        });
      }
      setSeq(n);
      setEntries((prev) => [...prev, ...loaded]);
    },
    [seq],
  );

  function setPassword(id: string, password: string) {
    // Editing the password after a result/error resets that entry to idle so
    // the CTA shows "Unlock" again.
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              password,
              status: e.status === 'unlocking' ? e.status : 'idle',
              message: null,
              result: null,
            }
          : e,
      ),
    );
  }

  async function unlock(id: string) {
    // `entries` is the current render's state; React commits password edits
    // (onChange) before the next event (Enter/click) fires, so this is fresh.
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.password.length === 0 || entry.status === 'unlocking') {
      return;
    }
    patch(id, { status: 'unlocking', message: null, result: null, progress: null });

    try {
      let unlocked: Uint8Array;
      let message: string;
      if (serverUp) {
        // Preferred path: true decryption, keeps selectable text.
        const res = await serverUnlock(
          entry.bytes,
          `${entry.name}.pdf`,
          entry.password,
        );
        unlocked = res.bytes;
        message = 'Unlocked with selectable text preserved — click Download.';
      } else {
        // Fallback: client-side rasterize (text becomes images).
        patch(id, { progress: { done: 0, total: 1 } });
        const res = await removePassword(
          entry.bytes,
          entry.password,
          1654,
          (done, total) => patch(id, { progress: { done, total } }),
        );
        unlocked = res.bytes;
        message =
          'Unlocked in your browser (pages rasterized — text not selectable). Click Download.';
      }

      patch(id, {
        status: 'ready',
        result: unlocked,
        message,
        progress: null,
      });
      // No auto-download — the user triggers it via the entry's Download CTA.
    } catch (err) {
      const message =
        err instanceof PdfPasswordError ||
        (err instanceof ApiError && err.code === 'wrong_password')
          ? 'Incorrect password. Please check it and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not unlock this PDF.';
      patch(id, { status: 'error', message, progress: null });
    }
  }

  function download(entry: Entry) {
    if (!entry.result) return;
    downloadBytes(entry.result, ensurePdfName(`${entry.name}-unlocked`));
    patch(entry.id, { downloadCount: entry.downloadCount + 1 });
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <ToolShell tool={TOOL}>
      <Dropzone
        multiple
        label={
          entries.length === 0
            ? 'Drop password-protected PDFs'
            : 'Drop more PDFs to add'
        }
        hint="you can add several at once — each unlocks on its own"
        onFiles={addFiles}
      />

      <p className={`notice ${serverUp ? 'notice--success' : 'notice--warning'}`}>
        {serverUp ? (
          <>
            The server truly decrypts each PDF, keeping{' '}
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

      {entries.length > 0 && (
        <div className="card panel" style={{ marginTop: 'var(--space-4)' }}>
          <div className="unlock-list">
            {entries.map((entry) => (
              <UnlockRow
                key={entry.id}
                entry={entry}
                onPassword={(v) => setPassword(entry.id, v)}
                onUnlock={() => unlock(entry.id)}
                onDownload={() => download(entry)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </div>

          {entries.length > 1 && (
            <div className="toolbar">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setEntries([])}
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </ToolShell>
  );
}

function UnlockRow({
  entry,
  onPassword,
  onUnlock,
  onDownload,
  onRemove,
}: {
  entry: Entry;
  onPassword: (value: string) => void;
  onUnlock: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const busy = entry.status === 'unlocking';
  const ready = entry.status === 'ready';

  return (
    <div className="unlock-row">
      <div className="unlock-row__main">
        <div className="file-chip__meta">
          <span className="file-chip__name">{entry.name}.pdf</span>
          <span className="muted">{formatBytes(entry.size)}</span>
          {entry.downloadCount > 0 && (
            <span className="download-count" title="Downloads this session">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="M7 10l5 5 5-5" />
                <path d="M12 15V3" />
              </svg>
              Downloaded {entry.downloadCount}×
            </span>
          )}
        </div>
        <button
          className="icon-btn"
          onClick={onRemove}
          aria-label="Remove file"
          title="Remove"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="unlock-row__controls">
        <input
          type="password"
          className="unlock-row__pwd"
          placeholder="Password"
          value={entry.password}
          disabled={busy}
          onChange={(e) => onPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onUnlock();
            }
          }}
          aria-label={`Password for ${entry.name}.pdf`}
        />

        {ready ? (
          <button className="btn btn-primary btn-sm" onClick={onDownload}>
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M7 10l5 5 5-5" />
              <path d="M12 15V3" />
            </svg>
            Download
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm"
            onClick={onUnlock}
            disabled={busy || entry.password.length === 0}
          >
            {busy
              ? entry.progress
                ? `Unlocking… (${entry.progress.done}/${entry.progress.total})`
                : 'Unlocking…'
              : 'Unlock'}
          </button>
        )}
      </div>

      {entry.message && (
        <p
          className={`notice notice--${entry.status === 'error' ? 'error' : 'success'} unlock-row__msg`}
        >
          {entry.message}
        </p>
      )}
    </div>
  );
}
