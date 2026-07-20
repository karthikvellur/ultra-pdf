import { useCallback, useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { useBackend } from '@/hooks/useBackend';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { removePassword } from '@/lib/pdf/security';
import { serverUnlock } from '@/lib/api/operations';
import { ApiError } from '@/lib/api/client';
import {
  downloadAsZip,
  downloadBytes,
  ensurePdfName,
  formatBytes,
} from '@/lib/pdf/download';
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
  /** This entry's own password, if the user typed one directly into its row. */
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

/** The password actually used for an entry: its own field wins if set,
 * otherwise it falls back to the shared "same password for all" field. */
function effectivePassword(entry: Entry, globalPassword: string): string {
  return entry.password || globalPassword;
}

export function RemovePassword() {
  const { status } = useBackend();
  const serverUp = status === 'online';

  const [entries, setEntries] = useState<Entry[]>([]);
  const [seq, setSeq] = useState(0);
  const [globalPassword, setGlobalPassword] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);

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

  /** Unlock one entry using an explicit password (its own, or the inherited
   * global one). Returns true on success so batch callers can tally results. */
  async function unlockWith(id: string, password: string): Promise<boolean> {
    if (!password) return false;
    patch(id, { status: 'unlocking', message: null, result: null, progress: null });

    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;

    try {
      let unlocked: Uint8Array;
      let message: string;
      if (serverUp) {
        // Preferred path: true decryption, keeps selectable text.
        const res = await serverUnlock(entry.bytes, `${entry.name}.pdf`, password);
        unlocked = res.bytes;
        message = 'Unlocked with selectable text preserved — click Download.';
      } else {
        // Fallback: client-side rasterize (text becomes images).
        patch(id, { progress: { done: 0, total: 1 } });
        const res = await removePassword(entry.bytes, password, 1654, (done, total) =>
          patch(id, { progress: { done, total } }),
        );
        unlocked = res.bytes;
        message =
          'Unlocked in your browser (pages rasterized — text not selectable). Click Download.';
      }

      patch(id, { status: 'ready', result: unlocked, message, progress: null });
      return true;
    } catch (err) {
      const message =
        err instanceof PdfPasswordError ||
        (err instanceof ApiError && err.code === 'wrong_password')
          ? 'Incorrect password. Please check it and try again.'
          : err instanceof Error
            ? err.message
            : 'Could not unlock this PDF.';
      patch(id, { status: 'error', message, progress: null });
      return false;
    }
  }

  async function unlock(id: string) {
    // `entries` is the current render's state; React commits password edits
    // (onChange) before the next event (Enter/click) fires, so this is fresh.
    const entry = entries.find((e) => e.id === id);
    if (!entry || entry.status === 'unlocking') return;
    await unlockWith(id, effectivePassword(entry, globalPassword));
  }

  /** Unlock every entry that isn't already unlocked, sequentially (kinder to
   * the backend than firing them all in parallel, and keeps progress legible). */
  async function unlockAll() {
    if (batchBusy) return;
    setBatchBusy(true);
    try {
      // Snapshot the ids + passwords up front; `entries` state mutates as we go.
      const queue = entries
        .filter((e) => e.status !== 'ready' && e.status !== 'unlocking')
        .map((e) => ({ id: e.id, password: effectivePassword(e, globalPassword) }))
        .filter((e) => e.password.length > 0);
      for (const { id, password } of queue) {
        await unlockWith(id, password);
      }
    } finally {
      setBatchBusy(false);
    }
  }

  function download(entry: Entry) {
    if (!entry.result) return;
    downloadBytes(entry.result, ensurePdfName(`${entry.name}-unlocked`));
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id ? { ...e, downloadCount: e.downloadCount + 1 } : e,
      ),
    );
  }

  /** Zip every unlocked entry's result into a single download. */
  async function downloadAll() {
    const ready = entries.filter((e) => e.status === 'ready' && e.result);
    if (ready.length === 0) return;
    setBatchDownloading(true);
    try {
      await downloadAsZip(
        ready.map((e) => ({ name: `${e.name}-unlocked`, bytes: e.result! })),
        'unlocked-pdfs.zip',
      );
      setEntries((prev) =>
        prev.map((e) =>
          e.status === 'ready' && e.result
            ? { ...e, downloadCount: e.downloadCount + 1 }
            : e,
        ),
      );
    } finally {
      setBatchDownloading(false);
    }
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const readyCount = entries.filter((e) => e.status === 'ready').length;
  const unlockableCount = entries.filter(
    (e) =>
      e.status !== 'ready' &&
      e.status !== 'unlocking' &&
      effectivePassword(e, globalPassword).length > 0,
  ).length;

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
          {entries.length > 1 && (
            <div className="global-password-bar">
              <div className="field" style={{ marginBottom: 0, flex: 1 }}>
                <label htmlFor="global-pwd">
                  Same password for all files
                </label>
                <input
                  id="global-pwd"
                  type="password"
                  placeholder="Applied to any file without its own password"
                  value={globalPassword}
                  onChange={(e) => setGlobalPassword(e.target.value)}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={unlockAll}
                disabled={batchBusy || unlockableCount === 0}
              >
                {batchBusy
                  ? 'Unlocking all…'
                  : `Unlock all${unlockableCount > 0 ? ` (${unlockableCount})` : ''}`}
              </button>
            </div>
          )}
          {entries.length > 1 && (
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              A file's own password field (if you've typed one) is used
              instead of this one. Leave a row blank to use the shared
              password above.
            </p>
          )}

          <div className="unlock-list">
            {entries.map((entry) => (
              <UnlockRow
                key={entry.id}
                entry={entry}
                usingGlobal={!entry.password && globalPassword.length > 0}
                onPassword={(v) => setPassword(entry.id, v)}
                onUnlock={() => unlock(entry.id)}
                onDownload={() => download(entry)}
                onRemove={() => removeEntry(entry.id)}
              />
            ))}
          </div>

          <div className="toolbar">
            {readyCount > 1 && (
              <button
                className="btn btn-secondary"
                onClick={downloadAll}
                disabled={batchDownloading}
              >
                {batchDownloading
                  ? 'Zipping…'
                  : `Download all ${readyCount} as .zip`}
              </button>
            )}
            {entries.length > 1 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEntries([]);
                  setGlobalPassword('');
                }}
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </ToolShell>
  );
}

function UnlockRow({
  entry,
  usingGlobal,
  onPassword,
  onUnlock,
  onDownload,
  onRemove,
}: {
  entry: Entry;
  /** True when this row has no password of its own and will use the shared one. */
  usingGlobal: boolean;
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
          placeholder={usingGlobal ? 'Using shared password above' : 'Password'}
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
            disabled={busy || (!entry.password && !usingGlobal)}
          >
            {busy
              ? entry.progress
                ? `Unlocking… (${entry.progress.done}/${entry.progress.total})`
                : 'Unlocking…'
              : 'Unlock'}
          </button>
        )}
      </div>

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

      {usingGlobal && !entry.password && entry.status === 'idle' && (
        <p className="muted unlock-row__hint">Will use the shared password</p>
      )}

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
