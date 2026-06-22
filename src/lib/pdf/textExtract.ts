/**
 * Turn a page's pdf.js text geometry into editable {@link TextRun}s.
 *
 * The coordinate math here is the verified core of the inline editor:
 *   - font size / rotation come from the text item's transform matrix
 *   - the run's PDF-space bbox is the min/max of its transformed corners
 *   - we convert to a normalized (0..1, top-left) bbox using the scale-1
 *     viewport's own converter, so page rotation/flip is handled correctly
 *
 * Items are grouped into logical lines by shared baseline (within a tolerance)
 * and broken on pdf.js EOL markers. Empty/spacer items are skipped.
 */
import type {
  TextItem,
  TextStyle,
} from 'pdfjs-dist/types/src/display/api';
import type { RenderableDoc, PageTextGeometry } from './render';
import type { BBox, FontInfo, TextRun } from './inlineEdit';

const BASELINE_TOLERANCE = 2; // PDF points

interface ItemGeom {
  item: TextItem;
  /** PDF-space bbox. */
  pdf: { xMin: number; yMin: number; xMax: number; yMax: number };
  fontSize: number;
  baseline: number; // transform[5]
  rotated: boolean;
  vertical: boolean;
}

export async function extractTextRuns(
  doc: RenderableDoc,
  pageNumber: number,
): Promise<TextRun[]> {
  const geom = await doc.getTextGeometry(pageNumber);
  return buildRuns(geom, pageNumber - 1);
}

/** Exposed for unit testing without a live pdf.js document. */
export function buildRuns(
  geom: PageTextGeometry,
  pageIndex: number,
): TextRun[] {
  const { items, styles, viewport } = geom;

  const geoms: ItemGeom[] = [];
  for (const item of items) {
    if (!item.str || item.str.trim() === '') continue; // skip spacers
    const [a, b, c, d, e, f] = item.transform;
    const width = item.width;
    const height = item.height || Math.hypot(c, d);

    // Four transformed corners → PDF-space bbox (handles rotation/shear).
    const xs = [e, e + a * width, e + c * height, e + a * width + c * height];
    const ys = [f, f + b * width, f + d * height, f + b * width + d * height];

    geoms.push({
      item,
      pdf: {
        xMin: Math.min(...xs),
        yMin: Math.min(...ys),
        xMax: Math.max(...xs),
        yMax: Math.max(...ys),
      },
      fontSize: Math.abs(Math.hypot(c, d)) || Math.abs(d) || 10,
      baseline: f,
      rotated: Math.abs(b) > 0.01 || Math.abs(c) > 0.01,
      vertical: styles[item.fontName]?.vertical === true,
    });
  }

  // Group into lines by descending baseline; new line when baseline jumps or
  // an EOL marker was seen on the previous item.
  geoms.sort((p, q) => q.baseline - p.baseline || p.pdf.xMin - q.pdf.xMin);

  const lines: ItemGeom[][] = [];
  let current: ItemGeom[] = [];
  let lineBaseline: number | null = null;
  for (const g of geoms) {
    const sameLine =
      lineBaseline !== null &&
      Math.abs(g.baseline - lineBaseline) <= BASELINE_TOLERANCE;
    if (!sameLine && current.length) {
      lines.push(current);
      current = [];
    }
    current.push(g);
    lineBaseline = g.baseline;
    if (g.item.hasEOL) {
      lines.push(current);
      current = [];
      lineBaseline = null;
    }
  }
  if (current.length) lines.push(current);

  return lines.map((line, i) =>
    lineToRun(line, styles, viewport, pageIndex, i),
  );
}

function lineToRun(
  line: ItemGeom[],
  styles: Record<string, TextStyle>,
  viewport: PageTextGeometry['viewport'],
  pageIndex: number,
  lineIndex: number,
): TextRun {
  // Order left-to-right and join the text.
  line.sort((p, q) => p.pdf.xMin - q.pdf.xMin);
  const original = line.map((g) => g.item.str).join('');

  // Union PDF-space bbox over the line.
  const xMin = Math.min(...line.map((g) => g.pdf.xMin));
  const yMin = Math.min(...line.map((g) => g.pdf.yMin));
  const xMax = Math.max(...line.map((g) => g.pdf.xMax));
  const yMax = Math.max(...line.map((g) => g.pdf.yMax));

  // PDF-space → viewport (screen, top-left) via pdf.js's own converter.
  const [sx0, sy0] = viewport.convertToViewportPoint(xMin, yMin);
  const [sx1, sy1] = viewport.convertToViewportPoint(xMax, yMax);
  const sx = Math.min(sx0, sx1);
  const sy = Math.min(sy0, sy1);
  const sw = Math.abs(sx1 - sx0);
  const sh = Math.abs(sy1 - sy0);

  const bbox: BBox = {
    x: sx / viewport.width,
    y: sy / viewport.height,
    width: sw / viewport.width,
    height: sh / viewport.height,
  };

  const dominant = line[0];
  const style = styles[dominant.item.fontName];
  const font = deriveFontInfo(dominant, style);

  const editable =
    !dominant.vertical && !dominant.rotated && original.length > 0;

  return {
    id: `p${pageIndex}-l${lineIndex}`,
    pageIndex,
    original,
    edited: original,
    bbox,
    font,
    editable,
  };
}

function deriveFontInfo(g: ItemGeom, style: TextStyle | undefined): FontInfo {
  const family = (style?.fontFamily ?? '').toLowerCase();
  const isSerif = /serif|times|georgia|roman|garamond|min|song/.test(family) &&
    !/sans/.test(family);
  const mono = /mono|courier|consol/.test(family);
  // pdf.js doesn't expose weight/italic reliably; infer from the font name.
  const name = (g.item.fontName ?? '').toLowerCase();
  const bold = /bold|black|heavy|semibold/.test(name);
  const italic = /italic|oblique/.test(name);

  return {
    name: g.item.fontName,
    size: Math.round(g.fontSize * 10) / 10,
    isSerif,
    mono,
    bold,
    italic,
    color: { r: 0, g: 0, b: 0 },
  };
}
