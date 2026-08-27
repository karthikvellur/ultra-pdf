import { useEffect, useRef } from 'react';
import type { FormattingOverrides, TextRun } from '@/lib/pdf/inlineEdit';
import { BUNDLED_FONTS } from '@/lib/pdf/bundledFonts';
import { hexToRgb, type RGBColor } from '@/lib/pdf/edit';
import './TextLayerOverlay.css';

interface TextLayerOverlayProps {
  runs: TextRun[];
  /** Rendered page dimensions in CSS px (overlay matches the canvas). */
  width: number;
  height: number;
  activeRunId: string | null;
  onActivate: (id: string) => void;
  onEdit: (id: string, value: string) => void;
  onFormat: (id: string, changes: Partial<FormattingOverrides>) => void;
  onCommit: () => void;
  onCancel: () => void;
}

/**
 * Absolutely-positioned layer of editable boxes, one per detected text line,
 * sized/placed from each run's normalized bbox. Clicking an editable run turns
 * it into an inline input pre-filled with the original text, with a small
 * floating formatting toolbar above it.
 */
export function TextLayerOverlay({
  runs,
  width,
  height,
  activeRunId,
  onActivate,
  onEdit,
  onFormat,
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
        const dirty =
          run.edited !== run.original ||
          run.formatting.family !== 'original' ||
          run.formatting.bold !== run.font.bold ||
          run.formatting.italic !== run.font.italic ||
          run.formatting.underline ||
          run.formatting.strikethrough ||
          run.formatting.size !== null ||
          run.formatting.color !== null;

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
            <div key={run.id} className="text-line-active-wrap" style={style}>
              <FormatToolbar
                formatting={run.formatting}
                onChange={(changes) => onFormat(run.id, changes)}
              />
              <RunInput
                value={run.edited}
                formatting={run.formatting}
                onChange={(v) => onEdit(run.id, v)}
                onCommit={onCommit}
                onCancel={onCancel}
              />
            </div>
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
            {dirty && (
              <span
                className="text-line__text"
                style={runPreviewStyle(run)}
              >
                {run.edited}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function runPreviewStyle(run: TextRun): React.CSSProperties {
  const f = run.formatting;
  const color = f.color ?? { r: 0, g: 0, b: 0 };
  return {
    fontWeight: f.bold ? 700 : 400,
    fontStyle: f.italic ? 'italic' : 'normal',
    textDecoration: [f.underline && 'underline', f.strikethrough && 'line-through']
      .filter(Boolean)
      .join(' ') || 'none',
    color: `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`,
  };
}

function RunInput({
  value,
  formatting,
  onChange,
  onCommit,
  onCancel,
}: {
  value: string;
  formatting: FormattingOverrides;
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
      style={runPreviewStyle({ formatting } as TextRun)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={(e) => {
        // Don't commit (which deactivates the run) when focus is moving to
        // the formatting toolbar's own controls.
        if (e.relatedTarget && e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) {
          return;
        }
        onCommit();
      }}
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

const COLOR_SWATCHES = ['#000000', '#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed'];

function FormatToolbar({
  formatting,
  onChange,
}: {
  formatting: FormattingOverrides;
  onChange: (changes: Partial<FormattingOverrides>) => void;
}) {
  const activeColorHex = formatting.color ? rgbToHex(formatting.color) : '#000000';

  return (
    <div
      className="format-toolbar"
      // Keep clicks/focus inside the toolbar from bubbling to page handlers
      // that would otherwise treat them as "click outside the run".
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`format-toolbar__btn ${formatting.bold ? 'format-toolbar__btn--active' : ''}`}
        title="Bold"
        onClick={() => onChange({ bold: !formatting.bold })}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        className={`format-toolbar__btn ${formatting.italic ? 'format-toolbar__btn--active' : ''}`}
        title="Italic"
        onClick={() => onChange({ italic: !formatting.italic })}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        className={`format-toolbar__btn ${formatting.underline ? 'format-toolbar__btn--active' : ''}`}
        title="Underline"
        onClick={() => onChange({ underline: !formatting.underline })}
      >
        <span style={{ textDecoration: 'underline' }}>U</span>
      </button>
      <button
        type="button"
        className={`format-toolbar__btn ${formatting.strikethrough ? 'format-toolbar__btn--active' : ''}`}
        title="Strikethrough"
        onClick={() => onChange({ strikethrough: !formatting.strikethrough })}
      >
        <span style={{ textDecoration: 'line-through' }}>S</span>
      </button>

      <span className="format-toolbar__divider" />

      <select
        className="format-toolbar__select"
        title="Font family"
        value={formatting.family}
        onChange={(e) => onChange({ family: e.target.value as FormattingOverrides['family'] })}
      >
        <option value="original">Original font</option>
        <optgroup label="Standard">
          <option value="helvetica">Helvetica</option>
          <option value="times">Times</option>
          <option value="courier">Courier</option>
        </optgroup>
        <optgroup label="Sans">
          {Object.entries(BUNDLED_FONTS)
            .filter(([, def]) => def.category === 'sans')
            .map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
        </optgroup>
        <optgroup label="Serif">
          {Object.entries(BUNDLED_FONTS)
            .filter(([, def]) => def.category === 'serif')
            .map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
        </optgroup>
        <optgroup label="Monospace">
          {Object.entries(BUNDLED_FONTS)
            .filter(([, def]) => def.category === 'mono')
            .map(([key, def]) => (
              <option key={key} value={key}>
                {def.label}
              </option>
            ))}
        </optgroup>
      </select>

      <input
        type="number"
        className="format-toolbar__size"
        title="Font size (pt)"
        min={4}
        max={144}
        value={formatting.size ?? ''}
        placeholder="pt"
        onChange={(e) => {
          const v = e.target.value;
          onChange({ size: v === '' ? null : Number(v) });
        }}
      />

      <span className="format-toolbar__divider" />

      <div className="format-toolbar__colors">
        {COLOR_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            className={`format-toolbar__swatch ${activeColorHex === hex ? 'format-toolbar__swatch--active' : ''}`}
            style={{ background: hex }}
            title={hex}
            onClick={() => onChange({ color: hexToRgb(hex) })}
          />
        ))}
        <input
          type="color"
          className="format-toolbar__color-input"
          title="Custom color"
          value={activeColorHex}
          onChange={(e) => onChange({ color: hexToRgb(e.target.value) })}
        />
      </div>
    </div>
  );
}

function rgbToHex(c: RGBColor): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(c.r)}${toHex(c.g)}${toHex(c.b)}`;
}
