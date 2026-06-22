/** Structural PDF operations: merge, split, rotate. Built on pdf-lib. */
import { PDFDocument, degrees } from 'pdf-lib';

/** Merge several PDFs (given as byte arrays) into one, in order. */
export async function mergePdfs(sources: Uint8Array[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  for (const bytes of sources) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p) => out.addPage(p));
  }
  return out.save();
}

/**
 * Extract a set of page ranges into a new PDF.
 * `pageIndices` is zero-based and may repeat / reorder pages.
 */
export async function extractPages(
  bytes: Uint8Array,
  pageIndices: number[],
): Promise<Uint8Array> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  const valid = pageIndices.filter(
    (i) => i >= 0 && i < src.getPageCount(),
  );
  const pages = await out.copyPages(src, valid);
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

/**
 * Rotate the given pages (zero-based) by `quarterTurns` * 90° clockwise.
 * Pass `null` for `pageIndices` to rotate every page.
 */
export async function rotatePages(
  bytes: Uint8Array,
  quarterTurns: number,
  pageIndices: number[] | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const targetSet =
    pageIndices === null ? null : new Set(pageIndices);

  pages.forEach((page, i) => {
    if (targetSet && !targetSet.has(i)) return;
    const current = page.getRotation().angle;
    const next = (((current + quarterTurns * 90) % 360) + 360) % 360;
    page.setRotation(degrees(next));
  });

  return doc.save();
}

/**
 * Parse a human range string like "1-3, 5, 8-10" into zero-based indices,
 * clamped to [0, pageCount). Order and duplicates are preserved.
 */
export function parsePageRanges(
  input: string,
  pageCount: number,
): number[] {
  const result: number[] = [];
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let start = parseInt(rangeMatch[1], 10);
      let end = parseInt(rangeMatch[2], 10);
      if (start > end) [start, end] = [end, start];
      for (let n = start; n <= end; n++) {
        if (n >= 1 && n <= pageCount) result.push(n - 1);
      }
    } else {
      const n = parseInt(part, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= pageCount) result.push(n - 1);
    }
  }
  return result;
}
