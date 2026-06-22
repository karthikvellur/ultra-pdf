import { useEffect, useRef, useState } from 'react';

interface SignaturePadProps {
  /** Called with the signature PNG bytes and its height/width aspect ratio. */
  onChange: (png: Uint8Array, aspect: number) => void;
}

type Mode = 'draw' | 'type';
const W = 360;
const H = 140;

export function SignaturePad({ onChange }: SignaturePadProps) {
  const [mode, setMode] = useState<Mode>('draw');
  const [typed, setTyped] = useState('');
  const [color, setColor] = useState('#0b3d91');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  // Reset canvas when switching to draw mode.
  useEffect(() => {
    if (mode !== 'draw') return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  }, [mode]);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  }

  function start(e: React.PointerEvent) {
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  function moveDraw(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    if (hasInk.current) emitFromCanvas();
  }

  function clear() {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  }

  async function emitFromCanvas() {
    const canvas = canvasRef.current!;
    const trimmed = trimTransparent(canvas);
    const blob = await new Promise<Blob | null>((r) =>
      trimmed.canvas.toBlob((b) => r(b), 'image/png'),
    );
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      onChange(bytes, trimmed.height / trimmed.width);
    }
  }

  async function emitTyped() {
    if (!typed.trim()) return;
    // Render the typed name in a cursive font onto an offscreen canvas.
    const scale = 3;
    const off = document.createElement('canvas');
    const ctx = off.getContext('2d')!;
    const font = `${48 * scale}px "Segoe Script", "Snell Roundhand", cursive`;
    ctx.font = font;
    const metrics = ctx.measureText(typed);
    off.width = Math.ceil(metrics.width + 40 * scale);
    off.height = Math.ceil(80 * scale);
    const ctx2 = off.getContext('2d')!;
    ctx2.font = font;
    ctx2.fillStyle = color;
    ctx2.textBaseline = 'middle';
    ctx2.fillText(typed, 20 * scale, off.height / 2);
    const blob = await new Promise<Blob | null>((r) =>
      off.toBlob((b) => r(b), 'image/png'),
    );
    if (blob) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      onChange(bytes, off.height / off.width);
    }
  }

  return (
    <div className="field">
      <label>Signature</label>
      <div className="sig-tabs">
        <button
          className={`btn btn-secondary btn-sm ${mode === 'draw' ? 'active' : ''}`}
          onClick={() => setMode('draw')}
        >
          Draw
        </button>
        <button
          className={`btn btn-secondary btn-sm ${mode === 'type' ? 'active' : ''}`}
          onClick={() => setMode('type')}
        >
          Type
        </button>
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          style={{ width: 36, height: 30, padding: 2 }}
          aria-label="Ink color"
        />
      </div>

      {mode === 'draw' ? (
        <>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="sig-pad"
            onPointerDown={start}
            onPointerMove={moveDraw}
            onPointerUp={end}
            onPointerLeave={end}
          />
          <button className="btn btn-ghost btn-sm" onClick={clear}>
            Clear
          </button>
        </>
      ) : (
        <>
          <input
            type="text"
            value={typed}
            placeholder="Type your name"
            onChange={(e) => setTyped(e.target.value)}
            onBlur={emitTyped}
            style={{
              padding: '9px 12px',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: '"Segoe Script", "Snell Roundhand", cursive',
              fontSize: 22,
              color,
            }}
          />
          <button className="btn btn-secondary btn-sm" onClick={emitTyped}>
            Use this signature
          </button>
        </>
      )}
    </div>
  );
}

/** Crop transparent margins so the placed signature is tight. */
function trimTransparent(canvas: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width,
    minY = height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { canvas, width, height }; // empty; return as-is
  }
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width, maxX + pad);
  maxY = Math.min(height, maxY + pad);
  const w = maxX - minX;
  const h = maxY - minY;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  out.getContext('2d')!.drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
  return { canvas: out, width: w, height: h };
}
