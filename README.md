# Ultra PDF

A web app for all your PDF operations — **100% in the browser**. Files never
leave your device.

> Built with React + Vite + TypeScript. Designed to grow toward a hybrid
> architecture (optional backend for heavy operations like OCR and
> text-preserving decryption) without changing the front-end structure.

## Features

### Available now (v1)

| Tool | What it does |
| --- | --- |
| **Edit PDF** | Place text and freehand drawings on any page |
| **Add Watermark** | Stamp text across pages with live preview |
| **Add Page Numbers** | Insert customizable numbers in any corner |
| **Remove Watermark** | Strip watermark *annotations* (stamps, freetext layers) |
| **Remove Password** | Unlock a protected PDF you have the password for |
| **Merge PDF** | Combine multiple PDFs in any order |
| **Split PDF** | Extract page ranges into a new document |
| **Rotate PDF** | Rotate selected or all pages by 90° steps |

### Planned

Protect (encrypt), Sign, Organize pages (drag-reorder), Extract pages,
Compress, PDF ⇄ Images, Extract text. These already appear in the tool grid
as "Soon" — wiring them up is just adding a route + page (see below).

## Tech

- **pdf-lib** — all PDF *mutation* (merge, split, rotate, watermark, numbers,
  annotations).
- **pdf.js** (`pdfjs-dist`) — faithful page *rendering* and password-based
  decryption for previews and the unlock flow.
- **react-router** — routing driven by a central tool registry.

## Architecture notes

- **`src/tools/registry.ts`** is the single source of truth for what tools
  exist, their metadata, icons, and `ready`/`soon` status. The home grid and
  navigation are generated from it.
- **`src/lib/pdf/`** is the framework-agnostic PDF engine. Pages call into it;
  it knows nothing about React. This is the layer a future backend would
  mirror/replace for the hybrid path.
- **`src/pages/tools/`** — one page component per tool, all wrapped in
  `ToolShell` for a consistent look.

### Adding a new tool

1. Add an entry to `TOOLS` in `src/tools/registry.ts` (set `status: 'ready'`).
2. Implement the operation in `src/lib/pdf/`.
3. Create a page in `src/pages/tools/` and add its route in
   `src/app/router.tsx`.

## Known limitations (client-side only)

- **Remove Password** re-renders pages to images, so output text isn't
  selectable. A text-preserving path needs the planned backend.
- **Remove Watermark** only handles annotation-based watermarks. Watermarks
  burned into the page content stream require a server-side render pipeline.

## Develop

```bash
npm install
npm run dev        # start dev server
npm run build      # typecheck + production build
npm run preview    # preview the production build
npm run typecheck  # types only
npm run lint       # eslint
```

Requires Node 18+.
