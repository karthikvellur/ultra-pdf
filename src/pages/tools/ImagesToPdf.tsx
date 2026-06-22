import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { fileToBytes } from '@/lib/pdf/load';
import { imagesToPdf } from '@/lib/pdf/organize';
import { downloadBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('image-to-pdf')!;

interface ImageItem {
  id: string;
  name: string;
  url: string;
  bytes: Uint8Array;
  type: 'png' | 'jpg';
}

export function ImagesToPdf() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0);

  async function handleFiles(files: File[]) {
    const loaded: ImageItem[] = [];
    let n = seq;
    for (const f of files) {
      const isPng = /png$/i.test(f.type) || /\.png$/i.test(f.name);
      const isJpg =
        /jpe?g$/i.test(f.type) || /\.jpe?g$/i.test(f.name);
      if (!isPng && !isJpg) continue;
      const bytes = await fileToBytes(f);
      loaded.push({
        id: `${Date.now()}-${n++}`,
        name: f.name,
        url: URL.createObjectURL(f),
        bytes,
        type: isPng ? 'png' : 'jpg',
      });
    }
    setSeq(n);
    setItems((prev) => [...prev, ...loaded]);
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const t = index + dir;
      if (t < 0 || t >= next.length) return prev;
      [next[index], next[t]] = [next[t], next[index]];
      return next;
    });
  }

  function remove(id: string) {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleConvert() {
    if (items.length === 0) return;
    setBusy(true);
    try {
      const out = await imagesToPdf(
        items.map((i) => ({ bytes: i.bytes, type: i.type })),
      );
      downloadBytes(out, 'images.pdf');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      <Dropzone
        multiple
        pdfOnly={false}
        label="Drop PNG or JPG images"
        hint="add as many as you like — they become one page each"
        onFiles={handleFiles}
      />

      {items.length > 0 && (
        <div className="card panel" style={{ marginTop: 'var(--space-4)' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Pages are created in this order. Reorder with the arrows.
          </p>
          <div className="thumb-grid">
            {items.map((item, i) => (
              <div key={item.id} className="thumb thumb--organize">
                <span className="thumb__badge thumb__badge--muted">
                  {i + 1}
                </span>
                <img
                  src={item.url}
                  alt={item.name}
                  style={{
                    width: 120,
                    maxHeight: 160,
                    objectFit: 'contain',
                    background: '#fff',
                    boxShadow: 'var(--shadow-md)',
                    borderRadius: 4,
                  }}
                />
                <span className="thumb__caption" title={item.name}>
                  {item.name.length > 16
                    ? item.name.slice(0, 14) + '…'
                    : item.name}
                </span>
                <div className="thumb__controls">
                  <button
                    className="icon-btn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move left"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => remove(item.id)}
                    aria-label="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move right"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={handleConvert}
              disabled={busy}
            >
              {busy ? 'Building…' : `Create PDF from ${items.length} image(s)`}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                items.forEach((i) => URL.revokeObjectURL(i.url));
                setItems([]);
              }}
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
