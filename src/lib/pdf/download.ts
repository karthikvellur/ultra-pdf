/** Helpers for delivering generated PDFs (and other blobs) to the user. */
import JSZip from 'jszip';

// Minimal ambient typing for the File System Access API — not yet in
// TypeScript's built-in DOM lib.
interface SaveFilePickerOptions {
  suggestedName?: string;
}
type ShowSaveFilePicker = (
  options?: SaveFilePickerOptions,
) => Promise<{
  createWritable(): Promise<{
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
  }>;
}>;

function getShowSaveFilePicker(): ShowSaveFilePicker | undefined {
  return (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;
}

export function downloadBytes(
  bytes: Uint8Array,
  fileName: string,
  mimeType = 'application/pdf',
): void {
  // Copy into a fresh ArrayBuffer-backed view so the BlobPart type is
  // unambiguous across TS lib versions (avoids the SharedArrayBuffer union).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mimeType });
  downloadBlob(blob, fileName);
}

/**
 * Save a blob under the exact name the caller asked for. On Chromium
 * browsers this uses the File System Access API's native "Save As" dialog,
 * which writes the file under our filename with no silent OS/browser
 * renaming on collision. Everywhere else (Firefox, Safari, mobile — or if
 * the user cancels the picker) it falls back to the classic `<a download>`
 * approach, where the browser may still append "(1)" etc. on its own.
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const showSaveFilePicker = getShowSaveFilePicker();
  if (showSaveFilePicker) {
    showSaveFilePicker({ suggestedName: fileName })
      .then(async (handle) => {
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
      })
      .catch((err) => {
        // AbortError means the user cancelled the picker — respect that
        // instead of falling back to a surprise second download.
        if (err instanceof Error && err.name === 'AbortError') return;
        downloadViaAnchor(blob, fileName);
      });
    return;
  }
  downloadViaAnchor(blob, fileName);
}

function downloadViaAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after a tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ensurePdfName(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

/** Bundle several PDFs into one .zip and trigger a single download. */
export async function downloadAsZip(
  files: { name: string; bytes: Uint8Array }[],
  zipFileName: string,
): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(ensurePdfName(file.name), file.bytes);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, zipFileName.endsWith('.zip') ? zipFileName : `${zipFileName}.zip`);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
