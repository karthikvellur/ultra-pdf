# Ultra PDF

A web app for all your PDF operations. **Light operations run 100% in your
browser** (private, instant, offline). **Heavy operations** use an optional
local backend for fidelity. Each tool shows where it runs, and the header
indicates whether the backend is reachable.

> React + Vite + TypeScript frontend · FastAPI (Python) backend. The frontend
> works on its own; the backend unlocks the high-fidelity paths.

## Features

Every tool is live. The **Runs** column shows where the work happens:
`Browser` (client-side), `Server` (backend required), `Hybrid` (browser by
default, backend for the hard cases).

| Tool | What it does | Runs |
| --- | --- | --- |
| **Edit PDF** | Edit existing text **inline**, or add text / freehand drawings | Hybrid |
| **Add Watermark** | Stamp text across pages with live preview | Browser |
| **Add Page Numbers** | Insert customizable numbers in any corner | Browser |
| **Remove Watermark** | Strip watermark *annotations*, or redact burned-in regions | Hybrid |
| **Remove Password** | Unlock a protected PDF — keeps selectable text via the server | Hybrid |
| **Protect PDF** | Add a password + AES-256 encryption | Server |
| **Sign PDF** | Draw or type a signature and place it on the page | Browser |
| **Merge PDF** | Combine multiple PDFs in any order | Browser |
| **Split PDF** | Extract page ranges into a new document | Browser |
| **Rotate PDF** | Rotate selected or all pages by 90° steps | Browser |
| **Organize Pages** | Reorder, duplicate, delete pages visually | Browser |
| **Extract Pages** | Pick pages with thumbnails → new PDF | Browser |
| **Compress PDF** | Reduce file size (Ghostscript) | Server |
| **PDF to Images** | Export pages as PNG/JPG | Hybrid |
| **Images to PDF** | Combine images into one PDF | Browser |
| **Extract Text** | Pull text out; OCRs scans via the server | Hybrid |

## Inline text editing

The Edit tool's **Edit text** mode lets you click any line of existing text and
change it in place. It works by extracting each line's geometry (position,
size, font) with pdf.js, overlaying an editable box, then applying the change:

- **Server path (default, best fidelity):** covers the original text and
  redraws the new text, reusing the original font when it's fully embedded.
- **Client fallback (offline):** same whiteout + redraw, but with a
  closest-matching standard font.

When the original font can't be reused (subsetted or non-embedded fonts can't
supply new glyphs), a close standard font is substituted and the UI says so.
Whiteout is a *visual* cover — see limitations below.

## Tech

**Frontend**
- **pdf-lib** — client-side PDF *mutation* (merge, split, rotate, watermark,
  numbers, annotations, signatures, images→PDF, inline-edit fallback).
- **pdf.js** (`pdfjs-dist`) — page *rendering*, text geometry for inline edit,
  client text extraction, and password decryption for previews.
- **react-router** — routing generated from a central tool registry.

**Backend** (`backend/`, FastAPI)
- **pikepdf** (qpdf) — text-preserving unlock, AES-256 protect, inline text
  edit (content-stream surgery), watermark-region redaction.
- **Ghostscript** — compression. **Tesseract / ocrmypdf** — OCR. **poppler** —
  high-fidelity PDF→images.

## Architecture notes

- **`src/tools/registry.ts`** — single source of truth for every tool: metadata,
  icons, and `runtime` (`client`/`server`/`hybrid`). The home grid, badges, and
  navigation are generated from it.
- **`src/lib/pdf/`** — the framework-agnostic client PDF engine (knows nothing
  about React).
- **`src/lib/api/`** — typed backend client + per-operation wrappers.
- **`src/hooks/useBackend.tsx`** — polls `/api/health`; tools gate on it.
- **`backend/app/routers/`** — one router per capability area; shared PDF
  helpers in `backend/app/pdf_util.py`.

### Adding a new tool

1. Add an entry to `TOOLS` in `src/tools/registry.ts` with its `runtime`.
2. Implement the op in `src/lib/pdf/` (client) and/or a backend router.
3. Create a page in `src/pages/tools/` and add its route in `src/app/router.tsx`.

## Known limitations

- **Inline text edit** uses *whiteout + redraw*: the original glyphs remain in
  the content stream beneath the cover box, so it's a visual edit, not a
  security redaction. Subset/CID fonts fall back to a standard font; text
  reflow and RTL/vertical text are out of scope.
- **Remove Password** (browser fallback) rasterizes pages, so text isn't
  selectable — the **server** path preserves text. Start the backend for it.
- **Remove Watermark** strips annotation watermarks losslessly client-side;
  burned-in watermarks are covered via server region-redaction.

## Run it

### Frontend
```bash
npm install
npm run dev        # dev server on :5173
npm run build      # typecheck + production build
npm run lint       # eslint
```
Requires Node 18+.

### Backend (for Server/Hybrid tools)
```bash
brew install ghostscript tesseract qpdf poppler   # one-time system deps
cd backend && ./run.sh                             # FastAPI on :8000
```
The frontend auto-detects the backend via `/api/health`. See
[`backend/README.md`](backend/README.md) for details.
