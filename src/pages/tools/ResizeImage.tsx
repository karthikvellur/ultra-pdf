import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { downloadBytes, formatBytes } from '@/lib/pdf/download';
import {
  readImageDimensions,
  resizeImage,
  scaledDimension,
  type ImageDimensions,
} from '@/lib/image/resize';
import './tools.css';

const TOOL = getTool('resize-image')!;

export function ResizeImage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [original, setOriginal] = useState<ImageDimensions | null>(null);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [lockRatio, setLockRatio] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    if (!f) return;
    setError(null);
    try {
      const dims = await readImageDimensions(f);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setOriginal(dims);
      setWidth(String(dims.width));
      setHeight(String(dims.height));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read this image.');
    }
  }

  function onWidthChange(value: string) {
    setWidth(value);
    const n = Number(value);
    if (lockRatio && original && n > 0) {
      setHeight(String(scaledDimension(original, 'width', n).height));
    }
  }

  function onHeightChange(value: string) {
    setHeight(value);
    const n = Number(value);
    if (lockRatio && original && n > 0) {
      setWidth(String(scaledDimension(original, 'height', n).width));
    }
  }

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setOriginal(null);
    setWidth('');
    setHeight('');
    setError(null);
  }

  async function handleResize() {
    if (!file) return;
    const w = Number(width);
    const h = Number(height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
      setError('Enter a width and height of at least 1 pixel.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const isPng = /\.png$/i.test(file.name) || file.type === 'image/png';
      const mimeType = isPng ? 'image/png' : 'image/jpeg';
      const bytes = await resizeImage(file, { width: w, height: h }, mimeType);
      const outName = file.name.replace(/\.\w+$/, isPng ? '.png' : '.jpg');
      downloadBytes(bytes, outName, mimeType);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resize this image.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      {!file && (
        <Dropzone
          pdfOnly={false}
          label="Drop a JPG or PNG image"
          hint="check its pixel size, then resize it"
          onFiles={handleFiles}
        />
      )}

      {error && <p className="notice notice--error">{error}</p>}

      {file && original && (
        <div className="split-layout" style={{ marginTop: 'var(--space-4)' }}>
          <div className="card panel split-layout__controls">
            <div className="file-chip">
              <div className="file-chip__meta">
                <span className="file-chip__name" title={file.name}>
                  {file.name}
                </span>
                <span className="muted">{formatBytes(file.size)}</span>
              </div>
              <button className="icon-btn" onClick={reset} aria-label="Remove image" title="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <p className="muted" style={{ marginTop: 0 }}>
              Current size: <strong>{original.width} × {original.height} px</strong>
            </p>

            <div className="field-row">
              <div className="field">
                <label htmlFor="resize-width">Width (px)</label>
                <input
                  id="resize-width"
                  type="number"
                  min={1}
                  value={width}
                  onChange={(e) => onWidthChange(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="resize-height">Height (px)</label>
                <input
                  id="resize-height"
                  type="number"
                  min={1}
                  value={height}
                  onChange={(e) => onHeightChange(e.target.value)}
                />
              </div>
            </div>

            <label className="suffix-toggle">
              <input
                type="checkbox"
                checked={lockRatio}
                onChange={(e) => setLockRatio(e.target.checked)}
              />
              Keep aspect ratio locked
            </label>

            <div className="toolbar">
              <button className="btn btn-primary" onClick={handleResize} disabled={busy}>
                {busy ? 'Resizing…' : 'Resize & download'}
              </button>
              <button className="btn btn-ghost" onClick={reset}>
                Choose a different image
              </button>
            </div>
          </div>

          <div className="split-layout__preview">
            <div className="preview-stage">
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt={file.name}
                  style={{ maxWidth: '100%', maxHeight: 400, objectFit: 'contain' }}
                />
              )}
            </div>
            <p className="preview-note muted">Live preview of the original image</p>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
