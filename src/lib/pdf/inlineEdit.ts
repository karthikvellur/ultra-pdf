/**
 * Inline text editing — shared types and the client-side fallback applier.
 *
 * The server path (lib/api/textOps.ts) is preferred for fidelity: it can reuse
 * fully-embedded fonts. This client fallback runs entirely in the browser when
 * the backend is offline: it whiteouts each edited run's box and redraws the
 * new text with the closest Standard (Base-14) font.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from 'pdf-lib';
import type { RGBColor } from './edit';

/** Normalized bounding box, top-left origin, values 0..1 relative to the page. */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FontInfo {
  /** pdf.js resource font name (e.g. "F1", "g_d0_f1"). */
  name: string;
  /** Font size in PDF points. */
  size: number;
  isSerif: boolean;
  mono: boolean;
  bold: boolean;
  italic: boolean;
  /** Text color sampled/derived; 0..1 RGB. Defaults to black. */
  color: RGBColor;
}

/** A logical, editable line of text reconstructed from pdf.js text items. */
export interface TextRun {
  /** Stable id for React keys + tracking. */
  id: string;
  pageIndex: number;
  /** The original text content of the line. */
  original: string;
  /** Current edited value (starts equal to `original`). */
  edited: string;
  bbox: BBox;
  font: FontInfo;
  /** Vertical/RTL/composite runs we can't safely edit inline (v1). */
  editable: boolean;
}

/** One replacement operation sent to the applier (client or server). */
export interface TextEditOp {
  pageIndex: number;
  originalText: string;
  newText: string;
  bbox: BBox;
  fontInfo: {
    name: string;
    size: number;
    isSerif: boolean;
    mono: boolean;
    bold: boolean;
    italic: boolean;
  };
}

/** Collect edit ops from runs whose text the user actually changed. */
export function getEditOps(runs: TextRun[]): TextEditOp[] {
  return runs
    .filter((r) => r.editable && r.edited !== r.original)
    .map((r) => ({
      pageIndex: r.pageIndex,
      originalText: r.original,
      newText: r.edited,
      bbox: r.bbox,
      fontInfo: {
        name: r.font.name,
        size: r.font.size,
        isSerif: r.font.isSerif,
        mono: r.font.mono,
        bold: r.font.bold,
        italic: r.font.italic,
      },
    }));
}

/**
 * Client-side fallback: whiteout each edited run and redraw with a Standard
 * font. Lower fidelity than the server path (no embedded-font reuse), but fully
 * offline and good enough for the common light-background case.
 */
export async function applyInlineTextEdits(
  bytes: Uint8Array,
  ops: TextEditOp[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const fontCache = new Map<string, PDFFont>();

  async function pick(op: TextEditOp): Promise<PDFFont> {
    const key = standardFontKey(op.fontInfo);
    let f = fontCache.get(key);
    if (!f) {
      f = await doc.embedFont(key as StandardFonts);
      fontCache.set(key, f);
    }
    return f;
  }

  for (const op of ops) {
    const page = pages[op.pageIndex];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();

    // 1. Whiteout the original box (normalized top-left → PDF points).
    const rx = op.bbox.x * pw;
    const rw = op.bbox.width * pw;
    const rh = op.bbox.height * ph;
    const ry = ph - op.bbox.y * ph - rh;
    page.drawRectangle({
      x: rx,
      y: ry,
      width: rw,
      height: rh,
      color: rgb(1, 1, 1),
    });

    // 2. Redraw new text at the run baseline (~18% of size above box bottom).
    const font = await pick(op);
    page.drawText(op.newText, {
      x: rx,
      y: ry + op.fontInfo.size * 0.18,
      size: op.fontInfo.size,
      font,
      color: rgb(0, 0, 0),
    });
  }

  return doc.save();
}

function standardFontKey(f: TextEditOp['fontInfo']): StandardFonts {
  if (f.mono) {
    if (f.bold && f.italic) return StandardFonts.CourierBoldOblique;
    if (f.bold) return StandardFonts.CourierBold;
    if (f.italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }
  if (f.isSerif) {
    if (f.bold && f.italic) return StandardFonts.TimesRomanBoldItalic;
    if (f.bold) return StandardFonts.TimesRomanBold;
    if (f.italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }
  if (f.bold && f.italic) return StandardFonts.HelveticaBoldOblique;
  if (f.bold) return StandardFonts.HelveticaBold;
  if (f.italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}
