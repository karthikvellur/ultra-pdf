/**
 * Client for the Ultra PDF backend (heavy operations).
 *
 * The base URL is configurable via `VITE_API_BASE` and defaults to the local
 * dev server. All calls degrade gracefully: callers should first check
 * `useBackendHealth()` and only offer server tools when the backend is up.
 */

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ??
  'http://localhost:8000';

export interface BackendTools {
  ghostscript: boolean;
  qpdf: boolean;
  tesseract: boolean;
  poppler: boolean;
}

export interface BackendHealth {
  status: string;
  version: string;
  tools: BackendTools;
}

/** A structured error the UI can branch on (e.g. wrong_password). */
export class ApiError extends Error {
  code?: string;
  status: number;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function checkHealth(signal?: AbortSignal): Promise<BackendHealth> {
  const res = await fetch(`${API_BASE}/api/health`, { signal });
  if (!res.ok) throw new ApiError(res.status, 'Backend is not healthy.');
  return (await res.json()) as BackendHealth;
}

/** POST multipart form data; return the response as PDF/zip bytes. */
export async function postForBytes(
  path: string,
  form: FormData,
): Promise<{ bytes: Uint8Array; filename: string; contentType: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    filename: filenameFromDisposition(res.headers.get('Content-Disposition')),
    contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
  };
}

/** Like {@link postForBytes} but also returns the raw response headers. */
export async function postForBytesWithHeaders(
  path: string,
  form: FormData,
): Promise<{
  bytes: Uint8Array;
  filename: string;
  contentType: string;
  headers: Headers;
}> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: form });
  if (!res.ok) {
    throw await toApiError(res);
  }
  const buf = await res.arrayBuffer();
  return {
    bytes: new Uint8Array(buf),
    filename: filenameFromDisposition(res.headers.get('Content-Disposition')),
    contentType: res.headers.get('Content-Type') ?? 'application/octet-stream',
    headers: res.headers,
  };
}

/** POST multipart form data; return a parsed JSON body. */
export async function postForJson<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) {
    throw await toApiError(res);
  }
  return (await res.json()) as T;
}

async function toApiError(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status}).`;
  let code: string | undefined;
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (typeof detail === 'string') {
      message = detail;
    } else if (detail && typeof detail === 'object') {
      message = detail.message ?? message;
      code = detail.code;
    }
  } catch {
    /* non-JSON error body; keep default message */
  }
  return new ApiError(res.status, message, code);
}

function filenameFromDisposition(disposition: string | null): string {
  if (!disposition) return 'download';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return match?.[1] ?? 'download';
}
