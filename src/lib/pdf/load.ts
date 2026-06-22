/** File reading and PDF loading helpers built on pdf-lib. */
import { PDFDocument } from 'pdf-lib';
import { LoadedPdf, PdfError } from './types';

export async function fileToBytes(file: File): Promise<Uint8Array> {
  const buffer = await file.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Load a PDF's metadata. pdf-lib can open many encrypted files for *reading*
 * structure when `ignoreEncryption` is set, but it cannot decrypt content — so
 * we flag encryption and let the dedicated tools (remove-password) handle it.
 */
export async function loadPdf(file: File): Promise<LoadedPdf> {
  const bytes = await fileToBytes(file);
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    return {
      name: stripPdfExtension(file.name),
      bytes,
      pageCount: doc.getPageCount(),
      encrypted: doc.isEncrypted,
    };
  } catch {
    throw new PdfError(
      `Could not read "${file.name}". It may be corrupted or not a valid PDF.`,
    );
  }
}

export function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  );
}
