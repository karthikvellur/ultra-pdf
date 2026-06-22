import { useState } from 'react';
import { ToolShell } from '@/components/ToolShell';
import { Dropzone } from '@/components/Dropzone';
import { PageCanvas } from '@/components/PageCanvas';
import { getTool } from '@/tools/registry';
import { fileToBytes, stripPdfExtension } from '@/lib/pdf/load';
import { addTextWatermark, hexToRgb } from '@/lib/pdf/edit';
import { downloadBytes, ensurePdfName } from '@/lib/pdf/download';
import { usePdfRenderer } from '@/hooks/usePdfRenderer';
import './tools.css';

const TOOL = getTool('watermark')!;

export function AddWatermark() {
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(
    null,
  );
  const [text, setText] = useState('CONFIDENTIAL');
  const [fontSize, setFontSize] = useState(48);
  const [opacity, setOpacity] = useState(0.25);
  const [rotation, setRotation] = useState(45);
  const [color, setColor] = useState('#dc2626');
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
      const out = await addTextWatermark(file.bytes, {
        text,
        fontSize,
        opacity,
        rotationDeg: rotation,
        color: hexToRgb(color),
      });
      downloadBytes(out, ensurePdfName(`${file.name}-watermarked`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ToolShell title={TOOL.title} description={TOOL.description} icon={TOOL.icon}>
      {!file ? (
        <Dropzone label="Drop a PDF to watermark" onFiles={handleFiles} />
      ) : (
        <div className="split-layout">
          <div className="card panel split-layout__controls">
            <div className="field">
              <label htmlFor="wm-text">Watermark text</label>
              <input
                id="wm-text"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="wm-size">Font size: {fontSize}pt</label>
                <input
                  id="wm-size"
                  type="range"
                  min={12}
                  max={120}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                />
              </div>
              <div className="field">
                <label htmlFor="wm-opacity">
                  Opacity: {Math.round(opacity * 100)}%
                </label>
                <input
                  id="wm-opacity"
                  type="range"
                  min={5}
                  max={100}
                  value={opacity * 100}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                />
              </div>
            </div>

            <div className="field-row">
              <div className="field">
                <label htmlFor="wm-rot">Rotation: {rotation}°</label>
                <input
                  id="wm-rot"
                  type="range"
                  min={0}
                  max={90}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                />
              </div>
              <div className="field" style={{ flex: '0 0 auto' }}>
                <label htmlFor="wm-color">Color</label>
                <input
                  id="wm-color"
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
                disabled={busy || text.length === 0}
              >
                {busy ? 'Applying…' : 'Apply & download'}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setFile(null)}
              >
                Change file
              </button>
            </div>
          </div>

          <div className="split-layout__preview">
            <div className="preview-stage">
              {doc ? (
                <div className="preview-wrap">
                  <PageCanvas doc={doc} pageNumber={1} width={340} />
                  <div
                    className="preview-watermark"
                    style={{
                      color,
                      opacity,
                      fontSize,
                      transform: `translate(-50%, -50%) rotate(-${rotation}deg)`,
                    }}
                  >
                    {text}
                  </div>
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
