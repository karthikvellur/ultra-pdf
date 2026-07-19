# Deploying Ultra PDF for free

This app is split so it hosts cheaply:

- **Frontend** → **Cloudflare Pages** (static, free forever, never sleeps)
- **Backend** → **Hugging Face Spaces** (Docker, free; sleeps when idle,
  ~30–60s cold start)

The frontend works on its own — most tools run 100% in your browser. The
backend only powers the high-fidelity paths (text-preserving unlock, encrypt,
compress, OCR, high-fidelity inline edit, high-fidelity PDF→images). When the
backend is asleep or not deployed, those tools fall back gracefully and the app
stays usable.

> **Deploy the backend first** so you have its URL for the frontend build.

---

## Part 1 — Backend on Hugging Face Spaces

### 1. Create the Space
1. Sign in at <https://huggingface.co> (free account).
2. Go to <https://huggingface.co/new-space>.
3. Fill in:
   - **Owner:** your username
   - **Space name:** `ultra-pdf-backend`
   - **License:** your choice (e.g. `mit`)
   - **SDK:** **Docker** → **Blank**
   - **Hardware:** **CPU basic (free)**
   - **Visibility:** Public (or Private — both are free)
4. Create the Space. It gives you a git repo like
   `https://huggingface.co/spaces/<user>/ultra-pdf-backend`.

### 2. Push the backend to it
The Space needs, at its **root**: `Dockerfile`, `requirements.txt`, `app/`, and
a `README.md` with HF frontmatter. Those all live in this repo's `backend/`
folder. Push just that folder's contents to the Space:

```bash
# From anywhere; this copies backend/ into the Space repo and pushes it.
cd /tmp
git clone https://huggingface.co/spaces/<user>/ultra-pdf-backend
cp -R /Users/kvellur/Projects/ultra-pdf/backend/. ultra-pdf-backend/
cd ultra-pdf-backend
# Don't ship the local venv or caches.
rm -rf .venv __pycache__ app/__pycache__ app/routers/__pycache__
git add -A
git commit -m "Deploy Ultra PDF backend"
git push
```

> HF asks for a username + **token** on push. Create one at
> <https://huggingface.co/settings/tokens> (role: **write**). Paste it as the
> password.

The Space builds automatically (a few minutes the first time — it installs
Ghostscript/Tesseract/qpdf/poppler). When the log shows the server started,
your API is live at:

```
https://<user>-ultra-pdf-backend.hf.space
```

### 3. Verify it
```bash
curl https://<user>-ultra-pdf-backend.hf.space/api/health
# → {"status":"ok","version":"0.1.0","tools":{"ghostscript":true, ...}}
```
All four tools should be `true`. **Copy this base URL** — the frontend needs it.

> **CORS:** the backend already allows any `*.pages.dev` origin (Cloudflare's
> default domains) via `ULTRA_PDF_CORS_ORIGIN_REGEX`. If you later put the
> frontend on a **custom domain**, add it in the Space's **Settings →
> Variables** as `ULTRA_PDF_CORS_ORIGINS=https://your-domain.com` (comma-
> separated for several), then restart the Space.

---

## Part 2 — Frontend on Cloudflare Pages

### 1. Connect the repo
1. Sign in at <https://dash.cloudflare.com> (free account).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorize GitHub and pick **`karthikvellur/ultra-pdf`**.

### 2. Build settings
| Field | Value |
| --- | --- |
| **Framework preset** | `Vite` (or `None`) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | *(leave blank — repo root)* |

### 3. Environment variable (the important one)
Under **Environment variables (Production)** add:

| Name | Value |
| --- | --- |
| `VITE_API_BASE` | `https://<user>-ultra-pdf-backend.hf.space` |

*(No trailing slash. This is baked into the build so the frontend calls your
backend.)*

### 4. Deploy
Click **Save and Deploy**. Cloudflare builds and serves it at:

```
https://ultra-pdf.pages.dev        (or a generated subdomain)
```

Every push to `main` auto-deploys. If you change `VITE_API_BASE` later, trigger
a **Retry deployment** so the new value is rebuilt in.

---

## Part 3 — Verify end to end

1. Open your `*.pages.dev` URL from any device.
2. The header pill should read **“Server tools ready”** once the backend
   responds. If the Space was asleep it may show **“Server offline”** for the
   first few seconds — click it to re-check after ~30–60s, or just use a
   server tool (your request wakes the Space).
3. Test a browser-only tool (e.g. **Merge**) — instant, no backend needed.
4. Test a server tool (e.g. **Protect PDF**) — confirms the backend + CORS.

---

## Costs & limits (all free tiers)

| | Cloudflare Pages | HF Spaces (CPU basic) |
| --- | --- | --- |
| Price | $0 | $0 |
| Sleeps when idle | No | Yes (~30–60s cold start) |
| Bandwidth | Unlimited | Fair-use |
| Custom domain | Free to attach | n/a (use the frontend’s) |

**The only user-visible catch** is the backend cold start after inactivity.
Because the frontend degrades gracefully, the app is always usable; heavy
features just wait for the wake-up (or use their browser fallback).

### Keeping the backend warm (optional)
If the cold start bugs you, ping the health endpoint every ~10 min with a free
uptime monitor (e.g. UptimeRobot):
```
GET https://<user>-ultra-pdf-backend.hf.space/api/health
```
Fine for personal use; just don’t abuse the free tier.

---

## Faster cold starts (optional upgrade path)
If you later want near-instant heavy ops, redeploy the same `backend/` image to
**Google Cloud Run** (also free-tier, scales to zero, but faster wake and needs
a Google account with a card on file). The Dockerfile works there unchanged —
Cloud Run injects `PORT`, which the container already honors.
