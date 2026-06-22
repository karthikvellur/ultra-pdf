/**
 * pdf.js-based rendering: thumbnails and full-page canvases.
 *
 * We use pdf.js purely for *display* (it renders faithfully and can decrypt
 * with a password). All *mutation* of PDFs goes through pdf-lib (see edit.ts,
 * organize.ts, etc.).
 */
import * as pdfjsLib from 'pdfjs-dist';
import type {
  TextItem,
  TextStyle,
} from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist';
// Vite resolves the `?url` import to a served/hashed asset URL (dev & build),
// which we hand to pdf.js as its worker source. This is more robust than the
// `?worker` constructor import, which can hang under some dev setups.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PdfPasswordError } from './types';

export interface PageTextGeometry {
  items: TextItem[];
  styles: Record<string, TextStyle>;
  /** Viewport at scale 1 — gives stable PDF-space coordinate conversions. */
  viewport: PageViewport;
}

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export interface RenderableDoc {
  numPages: number;
  /** Render a page into a fresh, detached canvas (used for rasterizing). */
  renderPage: (
    pageNumber: number,
    targetWidth: number,
  ) => Promise<HTMLCanvasElement>;
  /**
   * Render a page into a caller-owned, React-mounted canvas (used for UI).
   * Returns a handle whose `cancel()` aborts the in-flight pdf.js render —
   * the caller MUST invoke it on cleanup to avoid "same canvas" collisions.
   */
  renderPageInto: (
    canvas: HTMLCanvasElement,
    pageNumber: number,
    targetWidth: number,
  ) => { promise: Promise<void>; cancel: () => void };
  /**
   * Extract a page's text items + styles + a scale-1 viewport, for building
   * the inline text-edit overlay. Keeps pdf.js encapsulated in this module.
   */
  getTextGeometry: (pageNumber: number) => Promise<PageTextGeometry>;
  destroy: () => void;
}

/**
 * Open a document for rendering. Throws {@link PdfPasswordError} when the file
 * is encrypted and the supplied password (if any) is wrong or missing.
 */
export async function openForRender(
  bytes: Uint8Array,
  password?: string,
): Promise<RenderableDoc> {
  // pdf.js can detach the buffer; hand it a copy so callers keep their bytes.
  const data = bytes.slice();
  const loadingTask = pdfjsLib.getDocument({ data, password });

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err: unknown) {
    if (isPasswordException(err)) {
      throw new PdfPasswordError();
    }
    throw err;
  }

  function drawInto(
    canvas: HTMLCanvasElement,
    pageNumber: number,
    targetWidth: number,
  ): { promise: Promise<void>; cancel: () => void } {
    let renderTask: pdfjsLib.RenderTask | null = null;
    let cancelled = false;

    const promise = (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;

      const unscaled = page.getViewport({ scale: 1 });
      const scale = targetWidth / unscaled.width;
      const viewport = page.getViewport({ scale });

      const ctx = canvas.getContext('2d')!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;
      page.cleanup();
    })();

    return {
      promise,
      cancel() {
        cancelled = true;
        // Aborts the in-flight pdf.js render so a subsequent render on the
        // same canvas (e.g. React StrictMode's double-invoke) doesn't collide.
        renderTask?.cancel();
      },
    };
  }

  return {
    numPages: doc.numPages,
    async renderPage(pageNumber, targetWidth) {
      const canvas = document.createElement('canvas');
      await drawInto(canvas, pageNumber, targetWidth).promise;
      return canvas;
    },
    renderPageInto: drawInto,
    async getTextGeometry(pageNumber) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      // Only TextItem entries carry geometry; TextMarkedContent has none.
      const items = content.items.filter(
        (it): it is TextItem => 'transform' in it,
      );
      page.cleanup();
      return { items, styles: content.styles, viewport };
    },
    destroy() {
      void doc.destroy();
    },
  };
}

interface PdfJsException {
  name?: string;
  code?: number;
}

function isPasswordException(err: unknown): boolean {
  const e = err as PdfJsException;
  // PasswordException carries name 'PasswordException'; codes 1 (need) / 2 (wrong).
  return e?.name === 'PasswordException';
}
