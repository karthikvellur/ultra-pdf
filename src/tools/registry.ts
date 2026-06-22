/**
 * Central registry of every PDF tool the app offers.
 *
 * Each tool declares its metadata and a `status`:
 *   - 'ready'   → fully implemented, routed to a working page
 *   - 'soon'    → planned; shown in the grid but disabled
 *
 * Adding a new operation is as simple as adding an entry here and (when ready)
 * wiring its route in `app/router.tsx`. This is what lets us grow toward
 * "all PDF operations" without touching the home page or navigation.
 */

export type ToolCategory = 'organize' | 'edit' | 'convert' | 'secure';

export type ToolStatus = 'ready' | 'soon';

/**
 * Where a tool's work happens:
 *   - 'client' → 100% in the browser (private, instant, works offline)
 *   - 'server' → needs the backend (heavy native tooling)
 *   - 'hybrid' → client by default, backend for the hard cases
 */
export type ToolRuntime = 'client' | 'server' | 'hybrid';

export interface ToolDef {
  /** URL slug, e.g. "merge" → /tools/merge */
  id: string;
  title: string;
  description: string;
  category: ToolCategory;
  status: ToolStatus;
  runtime: ToolRuntime;
  /** Inline SVG icon path data (24x24 viewBox, stroke-based). */
  icon: string;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  organize: 'Organize',
  edit: 'Edit & Annotate',
  convert: 'Convert',
  secure: 'Secure & Sign',
};

export const CATEGORY_ORDER: ToolCategory[] = [
  'edit',
  'secure',
  'organize',
  'convert',
];

// 24x24 viewBox stroke icons (Lucide-style path data).
const ICONS = {
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  watermarkOff:
    'M3 3l18 18 M9.88 9.88A3 3 0 0 0 12 15a3 3 0 0 0 2.12-.88 M21 12s-3.5 6-9 6c-1.2 0-2.3-.3-3.3-.7 M4.7 8.6C3.5 9.9 3 12 3 12',
  unlock:
    'M7 11V7a5 5 0 0 1 9.9-1 M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z',
  merge:
    'M8 7V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4 M4 7h10a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z',
  split:
    'M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M8 21H5a2 2 0 0 1-2-2v-3 M3 8V5a2 2 0 0 1 2-2h3 M12 3v18',
  rotate:
    'M3 12a9 9 0 1 0 9-9 M3 12V7 M3 12h5 M9 9l3-3-3-3',
  reorder:
    'M3 6h18 M3 12h18 M3 18h18 M7 4l-2 2 2 2 M17 14l2 2-2 2',
  number: 'M4 17h16 M9 9l3-3 M12 6v8 M16 14h3v3h-3 M5 7h2v7H5',
  extract:
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 18v-6 M9 15l3 3 3-3',
  compress:
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M12 11v4 M10 13l2-2 2 2 M10 16h4',
  image:
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21',
  text: 'M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2 M9 20h6 M12 4v16',
  sign: 'M3 17c3-1 4-6 6-6s2 4 4 4 3-7 5-7 M3 21h18',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z M7 11V7a5 5 0 0 1 10 0v4',
};

export const TOOLS: ToolDef[] = [
  // ---- Edit & Annotate ----
  {
    id: 'edit',
    title: 'Edit PDF',
    description: 'Edit existing text inline, or add text, shapes & drawings.',
    category: 'edit',
    status: 'ready',
    runtime: 'hybrid',
    icon: ICONS.edit,
  },
  {
    id: 'watermark',
    title: 'Add Watermark',
    description: 'Stamp text or an image watermark across pages.',
    category: 'edit',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.text,
  },
  {
    id: 'page-numbers',
    title: 'Add Page Numbers',
    description: 'Insert customizable page numbers in any corner.',
    category: 'edit',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.number,
  },
  {
    id: 'remove-watermark',
    title: 'Remove Watermark',
    description: 'Strip annotation watermarks, or redact burned-in ones.',
    category: 'edit',
    status: 'ready',
    runtime: 'hybrid',
    icon: ICONS.watermarkOff,
  },

  // ---- Secure & Sign ----
  {
    id: 'remove-password',
    title: 'Remove Password',
    description: 'Unlock a PDF — keeps selectable text via the server.',
    category: 'secure',
    status: 'ready',
    runtime: 'hybrid',
    icon: ICONS.unlock,
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    description: 'Add a password and AES-256 encryption to your PDF.',
    category: 'secure',
    status: 'ready',
    runtime: 'server',
    icon: ICONS.lock,
  },
  {
    id: 'sign',
    title: 'Sign PDF',
    description: 'Draw or type a signature and place it on the page.',
    category: 'secure',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.sign,
  },

  // ---- Organize ----
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple PDFs into a single document.',
    category: 'organize',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.merge,
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Extract page ranges into separate documents.',
    category: 'organize',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.split,
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Rotate selected or all pages by 90° increments.',
    category: 'organize',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.rotate,
  },
  {
    id: 'organize-pages',
    title: 'Organize Pages',
    description: 'Reorder, duplicate, and delete pages visually.',
    category: 'organize',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.reorder,
  },
  {
    id: 'extract-pages',
    title: 'Extract Pages',
    description: 'Pick pages with thumbnails and pull them into a new PDF.',
    category: 'organize',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.extract,
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Reduce file size while keeping quality.',
    category: 'organize',
    status: 'ready',
    runtime: 'server',
    icon: ICONS.compress,
  },

  // ---- Convert ----
  {
    id: 'pdf-to-image',
    title: 'PDF to Images',
    description: 'Export each page as a PNG or JPG image.',
    category: 'convert',
    status: 'ready',
    runtime: 'hybrid',
    icon: ICONS.image,
  },
  {
    id: 'image-to-pdf',
    title: 'Images to PDF',
    description: 'Combine images into a single PDF document.',
    category: 'convert',
    status: 'ready',
    runtime: 'client',
    icon: ICONS.image,
  },
  {
    id: 'extract-text',
    title: 'Extract Text',
    description: 'Pull selectable text out — OCRs scans via the server.',
    category: 'convert',
    status: 'ready',
    runtime: 'hybrid',
    icon: ICONS.text,
  },
];

export const READY_TOOLS = TOOLS.filter((t) => t.status === 'ready');

export function getTool(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}
