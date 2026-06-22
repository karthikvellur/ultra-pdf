/** Server-backed inline text editing (fidelity path). */
import { postForBytesWithHeaders } from './client';
import type { TextEditOp } from '@/lib/pdf/inlineEdit';

function fileFrom(bytes: Uint8Array, name: string): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type: 'application/pdf' });
}

export interface ServerEditResult {
  bytes: Uint8Array;
  filename: string;
  /** True when the server had to substitute a Base-14 font for any edit. */
  fontFallback: boolean;
}

export async function serverEditText(
  bytes: Uint8Array,
  name: string,
  ops: TextEditOp[],
): Promise<ServerEditResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('edits', JSON.stringify(ops));
  const res = await postForBytesWithHeaders('/api/edit/text', form);
  return {
    bytes: res.bytes,
    filename: res.filename,
    fontFallback: res.headers.get('X-Font-Fallback') === 'true',
  };
}
