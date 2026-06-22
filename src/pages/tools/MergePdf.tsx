import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { getTool } from '@/tools/registry';
import { fileToBytes } from '@/lib/pdf/load';
import { mergePdfs } from '@/lib/pdf/organize';
import { downloadBytes, formatBytes } from '@/lib/pdf/download';
import './tools.css';

const TOOL = getTool('merge')!;

interface Item {
  id: string;
  name: string;
  bytes: Uint8Array;
}

export function MergePdf() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [seq, setSeq] = useState(0);

  async function handleFiles(files: File[]) {
    const loaded: Item[] = [];
    let n = seq;
    for (const f of files) {
      loaded.push({
        id: `${Date.now()}-${n++}`,
        name: f.name,
        bytes: await fileToBytes(f),
      });
    }
    setSeq(n);
    setItems((prev) => [...prev, ...loaded]);
  }

  function move(index: number, dir: -1 | 1) {
    setItems((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function remove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function handleMerge() {
    if (items.length < 2) return;
    setBusy(true);
    try {
      const out = await mergePdfs(items.map((i) => i.bytes));
      downloadBytes(out, 'merged.pdf');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell tool={TOOL}>
      <Dropzone
        multiple
        label="Drop PDFs to merge"
        hint="add as many as you like — drop again to append"
        onFiles={handleFiles}
      />

      {items.length > 0 && (
        <div className="card panel" style={{ marginTop: 'var(--space-4)' }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Files merge top-to-bottom. Reorder with the arrows.
          </p>
          <div className="page-list">
            {items.map((item, i) => (
              <div key={item.id} className="page-list__item">
                <span className="page-list__index">{i + 1}</span>
                <span className="page-list__name">{item.name}</span>
                <span className="muted" style={{ fontSize: 13 }}>
                  {formatBytes(item.bytes.length)}
                </span>
                <div className="page-list__actions">
                  <button
                    className="icon-btn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move down"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <button
                    className="icon-btn"
                    onClick={() => remove(item.id)}
                    aria-label="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="toolbar">
            <button
              className="btn btn-primary"
              onClick={handleMerge}
              disabled={busy || items.length < 2}
            >
              {busy ? 'Merging…' : `Merge ${items.length} files & download`}
            </button>
            <button className="btn btn-ghost" onClick={() => setItems([])}>
              Clear all
            </button>
          </div>
        </div>
      )}
    </ToolShell>
  );
}
