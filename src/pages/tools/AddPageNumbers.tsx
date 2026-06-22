import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { addPageNumbers, hexToRgb, type Corner } from '@/lib/pdf/edit';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('page-numbers')!;

const POSITIONS: { value: Corner; label: string }[] = [
  { value: 'top-left', label: 'Top left' },
  { value: 'top-center', label: 'Top center' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-center', label: 'Bottom center' },
  { value: 'bottom-right', label: 'Bottom right' },
];

export function AddPageNumbers() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [position, setPosition] = useState<Corner>('bottom-center');
  const [format, setFormat] = useState('{n}');
  const [fontSize, setFontSize] = useState(12);
  const [startAt, setStartAt] = useState(1);
  const [color, setColor] = useState('#1a1d23');
  const [busy, setBusy] = useState(false);

  const { doc } = usePdfRenderer(file?.bytes ?? null);

  async function handleFiles(files: File[]) {
    const f = files[0];
    setFile({ name: stripPdfExtension(f.name), bytes: await fileToBytes(f) });
  }

  async function handleApply() {
    if (!file) return;
    setBusy(true);
    try {
      const out = await addPageNumbers(file.bytes, {
        position,
        fontSize,
        margin: 28,
        format,
        startAt,
        color: hexToRgb(color),
      });
      downloadBytes(out, ensurePdfName(`${file.name}-numbered`));
    } finally {
      setBusy(false);
    }
  }

  const previewLabel = format
    .replace('{n}', String(startAt))
    .replace('{total}', String(doc?.numPages ?? 1));

  return (
    <ToolShell title={TOOL.title} description={TOOL.description} icon={TOOL.icon}>
      {!file ? (
        <Dropzone label="Drop a PDF to number" onFiles={handleFiles} />
      ) : (
        <div className="split-layout">
          <div className="card panel split-layout__controls">
            <div className="field">
              <label htmlFor="pn-pos">Position</label>
              <select
                id="pn-pos"
                value={position}
                onChange={(e) => setPosition(e.target.value as Corner)}
              >
                {POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="pn-format">
                Format — use <code>{'{n}'}</code> for the number,{' '}
                <code>{'{total}'}</code> for the total
              </label>
              <input
                id="pn-format"
                type="text"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                placeholder="e.g. Page {n} of {total}"
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="pn-size">Font size: {fontSize}pt</label>
                <input
                  id="pn-size"
                  type="range"
                  min={8}
                  max={28}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="pn-start">Start at</label>
                <input
                  id="pn-start"
                  type="number"
                  min={0}
                  value={startAt}
                  onChange={(e) => setStartAt(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ flex: '0 0 auto' }}>
                <label htmlFor="pn-color">Color</label>
                <input
                  id="pn-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: 56, height: 38, padding: 2 }}
                />
              </div>
            </div>

            <div className="toolbar">
              <button
                className="btn btn-primary"
                onClick={handleApply}
                disabled={busy}
              >
                {busy ? 'Applying…' : 'Apply & download'}
              </button>
              <button className="btn btn-ghost" onClick={() => setFile(null)}>
                Change file
              </button>
            </div>
          </div>

          <div className="split-layout__preview">
            <div className="preview-stage">
              {doc ? (
                <div className="preview-wrap">
                  <PageCanvas doc={doc} pageNumber={1} width={340} />
                  <span
                    className="preview-pagenum"
                    style={{ color, fontSize, ...numberStyle(position) }}
                  >
                    {previewLabel}
                  </span>
                </div>
              ) : (
                <span className="muted">Loading preview…</span>
              )}
            </div>
            <p className="muted preview-note">Live preview — page 1</p>
          </div>
        </div>
      )}
    </ToolShell>
  );
}

function numberStyle(position: Corner): React.CSSProperties {
  const m = 12;
  const style: React.CSSProperties = {};
  if (position.startsWith('top')) style.top = m;
  else style.bottom = m;
  if (position.endsWith('left')) style.left = m;
  else if (position.endsWith('right')) style.right = m;
  else {
    style.left = '50%';
    style.transform = 'translateX(-50%)';
  }
  return style;
}
