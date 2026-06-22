/** Shared types for the PDF engine. */

export interface LoadedPdf {
  /** Original file name (without forcing .pdf). */
  name: string;
  /** Raw bytes of the source file. */
  bytes: Uint8Array;
  /** Number of pages. */
  pageCount: number;
  /** Whether the source needed a password to open. */
  encrypted: boolean;
}

export interface PageSize {
  width: number;
  height: number;
}

export class PdfPasswordError extends Error {
  constructor(message = 'This PDF is password protected.') {
    super(message);
    this.name = 'PdfPasswordError';
  }
}

export class PdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfError';
  }
}
