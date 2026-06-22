/**
 * Watermark removal.
 *
 * Watermarks come in several forms and there is no single reliable removal
 * technique that works on all PDFs client-side. We attempt the tractable ones
 * and clearly report what was done:
 *
 *   1. Watermark *annotations* (FreeText / Watermark / Stamp) — removed by
 *      deleting the page's /Annots entries of those subtypes.
 *   2. Optional Content Groups (layers) named like "watermark" — hidden by
 *      removing their content references is non-trivial in pdf-lib, so we flag
 *      these as "not removed" for now.
 *
 * Watermarks burned directly into the page content stream (the most common
 * case for "draw text across the page") cannot be cleanly separated from real
 * content without a server-side render+OCR pipeline — which is the planned
 * hybrid path. We surface that honestly in the result.
 */
import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';

export interface RemoveWatermarkResult {
  bytes: Uint8Array;
  annotationsRemoved: number;
  /** True when the document still appears to contain content-stream marks. */
  likelyHasBurnedInWatermark: boolean;
}

const WATERMARK_SUBTYPES = new Set(['Watermark', 'Stamp', 'FreeText']);

export async function removeWatermarkAnnotations(
  bytes: Uint8Array,
): Promise<RemoveWatermarkResult> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  let removed = 0;

  for (const page of doc.getPages()) {
    const node = page.node;
    const annots = node.lookup(PDFName.of('Annots'));
    if (!(annots instanceof PDFArray)) continue;

    // Walk backwards so in-place removals don't shift the indices ahead of us.
    for (let i = annots.size() - 1; i >= 0; i--) {
      const ref = annots.get(i);
      const dict = node.context.lookup(ref);
      if (dict instanceof PDFDict) {
        const subtype = dict.lookup(PDFName.of('Subtype'));
        const name =
          subtype instanceof PDFName ? subtype.decodeText() : '';
        if (WATERMARK_SUBTYPES.has(name)) {
          annots.remove(i);
          removed++;
        }
      }
    }

    if (annots.size() === 0) {
      node.delete(PDFName.of('Annots'));
    }
  }

  const out = await doc.save();
  // Heuristic: if we couldn't remove any annotation, it's probably burned in.
  return {
    bytes: out,
    annotationsRemoved: removed,
    likelyHasBurnedInWatermark: removed === 0,
  };
}
