import { useEffect, useRef } from 'react';
import type { TextRun } from '@/lib/pdf/inlineEdit';
import './TextLayerOverlay.css';

interface TextLayerOverlayProps {
  runs: TextRun[];
  /** Rendered page dimensions in CSS px (overlay matches the canvas). */
  width: number;
  height: number;
  activeRunId: string | null;
  onActivate: (id: string) => void;
  onEdit: (id: string, value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * Absolutely-positioned layer of editable boxes, one per detected text line,
 * sized/placed from each run's normalized bbox. Clicking an editable run turns
 * it into an inline input pre-filled with the original text.
 */
export function TextLayerOverlay({
  runs,
  width,
  height,
  activeRunId,
  onActivate,
  onEdit,
  onCommit,
  onCancel,
}: TextLayerOverlayProps) {
  return (
    <div className="text-layer" style={{ width, height }}>
      {runs.map((run) => {
        const style: React.CSSProperties = {
          left: `${run.bbox.x * 100}%`,
          top: `${run.bbox.y * 100}%`,
          width: `${run.bbox.width * 100}%`,
          height: `${run.bbox.height * 100}%`,
          // Approximate on-screen font size from the run height.
          fontSize: Math.max(8, run.bbox.height * height * 0.9),
        };
        const dirty = run.edited !== run.original;

        if (!run.editable) {
          return (
            <div
              key={run.id}
              className="text-line text-line--locked"
              style={style}
              title="This text can't be edited inline (rotated, vertical, or empty)."
            />
          );
        }

        if (run.id === activeRunId) {
          return (
            <RunInput
              key={run.id}
              value={run.edited}
              style={style}
              onChange={(v) => onEdit(run.id, v)}
              onCommit={onCommit}
              onCancel={onCancel}
            />
          );
        }

        return (
          <div
            key={run.id}
            className={`text-line text-line--editable ${dirty ? 'text-line--dirty' : ''}`}
            style={style}
            onClick={() => onActivate(run.id)}
            title={dirty ? `Edited from: "${run.original}"` : 'Click to edit'}
          >
            {dirty && <span className="text-line__text">{run.edited}</span>}
          </div>
        );
      })}
    </div>
  );
}

function RunInput({
  value,
  style,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  style: React.CSSProperties;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="text-line text-line--active"
      style={style}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          onCommit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    />
  );
}
