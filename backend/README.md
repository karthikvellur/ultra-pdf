---
title: Ultra PDF Backend
emoji: 📄
colorFrom: red
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# Ultra PDF — Backend

> The YAML block above configures a **Hugging Face Space** (Docker SDK, port
> 7860). It's ignored by GitHub and by local runs. To deploy, push this
> `backend/` folder's contents to an HF Space repo — see the repo's
> [`DEPLOY.md`](../DEPLOY.md).

FastAPI service for the **heavy** PDF operations that can't be done well in the
browser. Light operations stay client-side; this server handles:

| Endpoint | Op | Native tool |
| --- | --- | --- |
| `POST /api/security/unlock` | Remove password (keeps text!) | qpdf / pikepdf |
| `POST /api/security/protect` | Encrypt with AES-256 | qpdf / pikepdf |
| `POST /api/transform/compress` | Shrink file size | Ghostscript |
| `POST /api/transform/redact-regions` | Cover burned-in watermarks | pikepdf |
| `POST /api/edit/text` | Edit existing text (whiteout + redraw) | pikepdf |
| `POST /api/convert/pdf-to-images` | Pages → PNG/JPG (ZIP) | poppler |
| `POST /api/ocr/extract-text` | Text (embedded or OCR) | pypdf / Tesseract |
| `POST /api/ocr/make-searchable` | Add OCR text layer | ocrmypdf |
| `GET  /api/health` | Liveness + tool probe | — |

### Inline text editing (`/api/edit/text`)

Replaces existing text in place using **whiteout + redraw**: the original
run's bounding box is covered with an opaque rectangle, then the new text is
drawn at the same baseline. Font fidelity is tiered and reported via the
`X-Font-Fallback` response header:

- **Tier 1 (high):** original font is fully embedded and *not* subset → reused,
  visually identical.
- **Tier 2 (good):** subset / non-embedded / unknown font → a Base-14 font
  matched on serif·sans·mono + bold·italic is substituted (`X-Font-Fallback:
  true`). Renders reliably; glyph shapes differ.

Out of scope (v1): Type0/CID composite fonts, true subset re-embedding (needs
fontTools), and text reflow. These fall back to Tier 2 rather than corrupting
the file. Note: whiteout is a *visual* cover — the original glyphs remain in
the content stream beneath the box, so this is not a security redaction.

## System dependencies

Install once (macOS):

```bash
brew install ghostscript tesseract qpdf poppler
```

(`poppler` provides `pdftoppm`, used by `pdf2image`.)

## Run

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
./run.sh            # or: .venv/bin/uvicorn app.main:app --reload --port 8000
```

The API listens on `http://localhost:8000`. The frontend auto-detects it via
`/api/health` and enables server-backed tools when it's up.

### Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `ULTRA_PDF_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed origins |
| `ULTRA_PDF_MAX_UPLOAD` | `104857600` (100 MB) | Max upload size |

## Why these are server-side

- **Unlock**: qpdf truly decrypts, keeping selectable text and vectors. The
  client-only fallback rasterizes pages (text becomes images).
- **Compress / OCR**: Ghostscript & Tesseract have no real browser equivalent.
- **PDF→Images**: poppler renders at higher fidelity than a `<canvas>`.
- **Redact regions**: deterministic content-stream overlay to cover watermarks
  that are painted into the page (not removable as annotations).
