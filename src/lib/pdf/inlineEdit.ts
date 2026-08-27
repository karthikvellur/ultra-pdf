/**
 * Inline text editing — shared types and the client-side fallback applier.
 *
 * The server path (lib/api/textOps.ts) is preferred for fidelity: it can reuse
 * fully-embedded fonts. This client fallback runs entirely in the browser when
 * the backend is offline: it whiteouts each edited run's box and redraws the
 * new text with either a Standard (Base-14) font or one of the bundled
 * families (embedded on the fly via fontkit) — same font catalog as the
 * server path, so formatting is available offline too.
 */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { RGBColor } from './edit';
import {
  bundledFontFileName,
  isBundledFontFamily,
  type BundledFontFamily,
} from './bundledFonts';

/** Normalized bounding box, top-left origin, values 0..1 relative to the page. */
export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Which font family to draw with. `'original'` reuses/matches the run's
 * detected font (today's behavior); everything else forces a specific
 * family — either a Base-14 or one of the bundled webfonts.
 */
export type FontFamilyChoice = 'original' | 'helvetica' | 'times' | 'courier' | BundledFontFamily;

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

/** User-controlled formatting overrides, layered on top of the detected FontInfo. */
export interface FormattingOverrides {
  family: FontFamilyChoice;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  /** Font size in PDF points; falls back to the detected size when unset. */
  size: number | null;
  /** 0..1 RGB; falls back to the detected color (default black) when unset. */
  color: RGBColor | null;
}

export function defaultFormatting(font: FontInfo): FormattingOverrides {
  return {
    family: 'original',
    bold: font.bold,
    italic: font.italic,
    underline: false,
    strikethrough: false,
    size: null,
    color: null,
  };
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
  /** User formatting choices for this run; starts matching the detected font. */
  formatting: FormattingOverrides;
  /** Vertical/RTL/composite runs we can't safely edit inline (v1). */
  editable: boolean;
}

/** True if the user changed any formatting away from the detected original —
 * such runs must use a fresh font (Base-14 or bundled), never the reused
 * original embedded font, since only fresh fonts support arbitrary styling. */
export function hasFormattingOverride(run: TextRun): boolean {
  const f = run.formatting;
  return (
    f.family !== 'original' ||
    f.bold !== run.font.bold ||
    f.italic !== run.font.italic ||
    f.underline ||
    f.strikethrough ||
    (f.size !== null && f.size !== run.font.size) ||
    f.color !== null
  );
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
  formatting: FormattingOverrides;
}

/** Same check as {@link hasFormattingOverride}, for an already-built op —
 * used after the run is gone (e.g. once ops have been sent to the server). */
export function opHasFormattingOverride(op: TextEditOp): boolean {
  const f = op.formatting;
  return (
    f.family !== 'original' ||
    f.bold !== op.fontInfo.bold ||
    f.italic !== op.fontInfo.italic ||
    f.underline ||
    f.strikethrough ||
    (f.size !== null && f.size !== op.fontInfo.size) ||
    f.color !== null
  );
}

/** Collect edit ops from runs whose text OR formatting the user changed. */
export function getEditOps(runs: TextRun[]): TextEditOp[] {
  return runs
    .filter((r) => r.editable && (r.edited !== r.original || hasFormattingOverride(r)))
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
      formatting: r.formatting,
    }));
}

/**
 * Client-side fallback: whiteout each edited run and redraw it. Supports the
 * same font catalog as the server path (Base-14 + the 8 bundled webfonts,
 * embedded on the fly via fontkit) so formatting works offline too. Lower
 * fidelity than the server path only in that it can't reuse the PDF's own
 * original embedded fonts — an unformatted edit always redraws with
 * Helvetica/Times/Courier rather than matching the source font exactly.
 */
export async function applyInlineTextEdits(
  bytes: Uint8Array,
  ops: TextEditOp[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  doc.registerFontkit(fontkit);
  const pages = doc.getPages();
  const fontCache = new Map<string, PDFFont>();

  async function pick(op: TextEditOp): Promise<PDFFont> {
    const effectiveBold = op.formatting.bold;
    const effectiveItalic = op.formatting.italic;
    const family = op.formatting.family;

    if (family !== 'original' && isBundledFontFamily(family)) {
      const fileName = bundledFontFileName(family, effectiveBold, effectiveItalic);
      let f = fontCache.get(fileName);
      if (!f) {
        const res = await fetch(`/fonts/${fileName}`);
        const fontBytes = await res.arrayBuffer();
        f = await doc.embedFont(fontBytes);
        fontCache.set(fileName, f);
      }
      return f;
    }

    const key = standardFontKey({
      mono: family === 'courier' || (family === 'original' && op.fontInfo.mono),
      isSerif: family === 'times' || (family === 'original' && op.fontInfo.isSerif),
      bold: effectiveBold,
      italic: effectiveItalic,
    });
    let f = fontCache.get(key);
    if (!f) {
      f = await doc.embedFont(key);
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
    const size = op.formatting.size ?? op.fontInfo.size;
    const color = op.formatting.color ?? { r: 0, g: 0, b: 0 };
    const baselineY = ry + size * 0.18;
    page.drawText(op.newText, {
      x: rx,
      y: baselineY,
      size,
      font,
      color: rgb(color.r, color.g, color.b),
    });

    // 3. Underline / strikethrough — drawn as plain lines since pdf-lib has
    //    no built-in text-decoration support.
    const textWidth = font.widthOfTextAtSize(op.newText, size);
    if (op.formatting.underline) {
      const underlineY = baselineY - size * 0.08;
      page.drawLine({
        start: { x: rx, y: underlineY },
        end: { x: rx + textWidth, y: underlineY },
        thickness: Math.max(0.75, size * 0.05),
        color: rgb(color.r, color.g, color.b),
      });
    }
    if (op.formatting.strikethrough) {
      const strikeY = baselineY + size * 0.3;
      page.drawLine({
        start: { x: rx, y: strikeY },
        end: { x: rx + textWidth, y: strikeY },
        thickness: Math.max(0.75, size * 0.05),
        color: rgb(color.r, color.g, color.b),
      });
    }
  }

  return doc.save();
}

function standardFontKey(f: {
  mono: boolean;
  isSerif: boolean;
  bold: boolean;
  italic: boolean;
}): StandardFonts {
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
