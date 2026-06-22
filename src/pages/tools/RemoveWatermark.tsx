import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { removeWatermarkAnnotations } from '@/lib/pdf/watermark';
import { downloadBytes, ensurePdfName, formatBytes } from '@/lib/pdf/download';

const TOOL = getTool('remove-watermark')!;

export function RemoveWatermark() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    removed: number;
    burnedIn: boolean;
  } | null>(null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
    setError(null);
    setResult(null);
  }

  async function handleRemove() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await removeWatermarkAnnotations(file.bytes);
      setResult({
        removed: res.annotationsRemoved,
        burnedIn: res.likelyHasBurnedInWatermark,
      });
      if (res.annotationsRemoved > 0) {
        downloadBytes(res.bytes, ensurePdfName(`${file.name}-no-watermark`));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not process this PDF.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell title={TOOL.title} description={TOOL.description} icon={TOOL.icon}>
      {!file ? (
        <Dropzone
          label="Drop a watermarked PDF"
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
                setResult(null);
                setError(null);
              }}
            >
              Change file
            </button>
          </div>

          <p className="notice notice--info">
            This removes watermarks added as PDF <strong>annotations</strong>{' '}
            (stamps, freetext, watermark layers). Watermarks painted directly
            into the page can't be reliably separated from real content in the
            browser — that needs the planned server-side render pipeline.
          </p>

          {error && <p className="notice notice--error">{error}</p>}

          {result && (
            <>
              {result.removed > 0 ? (
                <p className="notice notice--success">
                  Removed {result.removed} watermark annotation
                  {result.removed === 1 ? '' : 's'}. Your cleaned PDF has been
                  downloaded.
                </p>
              ) : (
                <p className="notice notice--warning">
                  No removable watermark annotations were found. This PDF's
                  watermark is likely burned into the page content, which we
                  can't strip client-side yet.
                </p>
              )}
            </>
          )}

          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={handleRemove}
              disabled={busy}
            >
              {busy ? 'Processing…' : 'Remove watermark'}
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
