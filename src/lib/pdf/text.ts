/** Client-side text extraction via pdf.js (embedded text layer only). */
import * as pdfjsLib from 'pdfjs-dist';

export interface ClientTextResult {
  text: string;
  pages: number;
  /** True when the embedded text layer is essentially empty (likely a scan). */
  looksScanned: boolean;
}

export async function extractTextClient(
  bytes: Uint8Array,
): Promise<ClientTextResult> {
  const data = bytes.slice();
  const doc = await pdfjsLib.getDocument({ data }).promise;
  try {
    const chunks: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      chunks.push(text);
      page.cleanup();
    }
    const joined = chunks.join('\n\n').trim();
    return {
      text: joined,
      pages: doc.numPages,
      // <20 chars/page average → almost certainly an image-only scan.
      looksScanned: joined.length < doc.numPages * 20,
    };
  } finally {
    void doc.destroy();
  }
}
