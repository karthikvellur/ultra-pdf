/** Content-adding operations: watermarks, page numbers, text & drawings. */
import {
  PDFDocument,
  StandardFonts,
  rgb,
  degrees,
  PDFFont,
  RGB,
} from 'pdf-lib';

export interface RGBColor {
  r: number; // 0..1
  g: number;
  b: number;
}

export function hexToRgb(hex: string): RGBColor {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const num = parseInt(full, 16);
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

function toRgb(c: RGBColor): RGB {
  return rgb(c.r, c.g, c.b);
}

// ---- Watermark ----

export interface WatermarkOptions {
  text: string;
  fontSize: number;
  opacity: number; // 0..1
  rotationDeg: number;
  color: RGBColor;
}

export async function addTextWatermark(
  bytes: Uint8Array,
  opts: WatermarkOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);

  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(opts.text, opts.fontSize);
    page.drawText(opts.text, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size: opts.fontSize,
      font,
      color: toRgb(opts.color),
      opacity: opts.opacity,
      rotate: degrees(opts.rotationDeg),
    });
  }
  return doc.save();
}

// ---- Page numbers ----

export type Corner =
  | 'bottom-center'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'top-right'
  | 'top-left';

export interface PageNumberOptions {
  position: Corner;
  fontSize: number;
  margin: number;
  /** "{n}" → current page, "{total}" → page count. */
  format: string;
  startAt: number;
  color: RGBColor;
}

export async function addPageNumbers(
  bytes: Uint8Array,
  opts: PageNumberOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  pages.forEach((page, i) => {
    const label = opts.format
      .replace('{n}', String(i + opts.startAt))
      .replace('{total}', String(total));
    const { x, y } = numberPosition(
      page.getWidth(),
      page.getHeight(),
      opts,
      font,
      label,
    );
    page.drawText(label, {
      x,
      y,
      size: opts.fontSize,
      font,
      color: toRgb(opts.color),
    });
  });

  return doc.save();
}

function numberPosition(
  pageW: number,
  pageH: number,
  opts: PageNumberOptions,
  font: PDFFont,
  label: string,
): { x: number; y: number } {
  const w = font.widthOfTextAtSize(label, opts.fontSize);
  const m = opts.margin;
  const isTop = opts.position.startsWith('top');
  const y = isTop ? pageH - m - opts.fontSize : m;

  let x: number;
  if (opts.position.endsWith('left')) x = m;
  else if (opts.position.endsWith('right')) x = pageW - m - w;
  else x = pageW / 2 - w / 2;

  return { x, y };
}

// ---- Freeform annotations (text + drawings placed in the editor) ----

export interface TextAnnotation {
  type: 'text';
  pageIndex: number;
  /** Normalized 0..1 coordinates, origin top-left (UI space). */
  x: number;
  y: number;
  text: string;
  fontSize: number; // in PDF points
  color: RGBColor;
}

export interface StrokeAnnotation {
  type: 'stroke';
  pageIndex: number;
  /** Normalized 0..1 points, origin top-left. */
  points: { x: number; y: number }[];
  color: RGBColor;
  width: number;
}

export type Annotation = TextAnnotation | StrokeAnnotation;

/**
 * Bake editor annotations into the PDF. Coordinates arrive normalized with a
 * top-left origin (matching the on-screen canvas); we flip to PDF's
 * bottom-left origin here.
 */
export async function applyAnnotations(
  bytes: Uint8Array,
  annotations: Annotation[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const ann of annotations) {
    const page = pages[ann.pageIndex];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();

    if (ann.type === 'text') {
      page.drawText(ann.text, {
        x: ann.x * pw,
        y: ph - ann.y * ph - ann.fontSize,
        size: ann.fontSize,
        font,
        color: toRgb(ann.color),
      });
    } else {
      const pts = ann.points;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        page.drawLine({
          start: { x: a.x * pw, y: ph - a.y * ph },
          end: { x: b.x * pw, y: ph - b.y * ph },
          thickness: ann.width,
          color: toRgb(ann.color),
        });
      }
    }
  }

  return doc.save();
}
