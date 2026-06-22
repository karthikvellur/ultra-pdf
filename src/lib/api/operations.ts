/** Typed wrappers around each backend endpoint. */
import { postForBytes, postForJson } from './client';

function fileFrom(bytes: Uint8Array, name: string): File {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new File([copy.buffer], name, { type: 'application/pdf' });
}

export interface ServerResult {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

export async function serverUnlock(
  bytes: Uint8Array,
  name: string,
  password: string,
): Promise<ServerResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('password', password);
  return postForBytes('/api/security/unlock', form);
}

export interface ProtectOptions {
  userPassword: string;
  ownerPassword?: string;
  allowPrinting: boolean;
  allowCopying: boolean;
}

export async function serverProtect(
  bytes: Uint8Array,
  name: string,
  opts: ProtectOptions,
): Promise<ServerResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('user_password', opts.userPassword);
  form.append('owner_password', opts.ownerPassword ?? '');
  form.append('allow_printing', String(opts.allowPrinting));
  form.append('allow_copying', String(opts.allowCopying));
  return postForBytes('/api/security/protect', form);
}

export async function serverCompress(
  bytes: Uint8Array,
  name: string,
  level: 'low' | 'medium' | 'high',
): Promise<ServerResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('level', level);
  return postForBytes('/api/transform/compress', form);
}

export interface RedactRegion {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function serverRedactRegions(
  bytes: Uint8Array,
  name: string,
  regions: RedactRegion[],
): Promise<ServerResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('regions', JSON.stringify(regions));
  return postForBytes('/api/transform/redact-regions', form);
}

export async function serverPdfToImages(
  bytes: Uint8Array,
  name: string,
  fmt: 'png' | 'jpeg',
  dpi: number,
): Promise<ServerResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('fmt', fmt);
  form.append('dpi', String(dpi));
  return postForBytes('/api/convert/pdf-to-images', form);
}

export interface ExtractTextResult {
  text: string;
  method: 'embedded' | 'ocr';
  pages: number;
}

export async function serverExtractText(
  bytes: Uint8Array,
  name: string,
  forceOcr: boolean,
): Promise<ExtractTextResult> {
  const form = new FormData();
  form.append('file', fileFrom(bytes, name));
  form.append('force_ocr', String(forceOcr));
  return postForJson<ExtractTextResult>('/api/ocr/extract-text', form);
}
