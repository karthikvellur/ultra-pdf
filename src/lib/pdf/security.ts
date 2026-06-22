/**
 * Password / encryption operations.
 *
 * pdf-lib cannot decrypt content streams, and pdf.js cannot re-serialize a
 * PDF. So to "remove a password" we:
 *   1. Open the encrypted document with pdf.js using the user's password.
 *   2. Re-render every page to a high-resolution canvas.
 *   3. Embed those page images into a brand-new, unencrypted PDF via pdf-lib.
 *
 * This reliably produces an openable, password-free PDF for any file the user
 * can legitimately unlock. The trade-off is that text becomes rasterized
 * (non-selectable). This is the standard limitation of fully client-side
 * decryption; a future server-side path can preserve the text layer.
 */
import { PDFDocument } from 'pdf-lib';
import { openForRender } from './render';

export interface RemovePasswordResult {
  bytes: Uint8Array;
  pageCount: number;
  /** True because the client-side path rasterizes pages (see module note). */
  rasterized: boolean;
}

export async function removePassword(
  bytes: Uint8Array,
  password: string,
  // Higher = crisper output but larger files. 2 ≈ 144 DPI for a typical page.
  renderScaleWidth = 1654, // ~A4 width at 200 DPI
  onProgress?: (done: number, total: number) => void,
): Promise<RemovePasswordResult> {
  const doc = await openForRender(bytes, password);
  const out = await PDFDocument.create();

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const canvas = await doc.renderPage(i, renderScaleWidth);
      const pngBytes = await canvasToPngBytes(canvas);
      const img = await out.embedPng(pngBytes);
      // Preserve aspect ratio; size the page to the rendered image.
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, {
        x: 0,
        y: 0,
        width: img.width,
        height: img.height,
      });
      onProgress?.(i, doc.numPages);
    }
  } finally {
    doc.destroy();
  }

  const saved = await out.save();
  return { bytes: saved, pageCount: out.getPageCount(), rasterized: true };
}

async function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png'),
  );
  if (!blob) throw new Error('Failed to rasterize page.');
  return new Uint8Array(await blob.arrayBuffer());
}
