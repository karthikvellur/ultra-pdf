# Deploying Ultra PDF for free

This app is split so it hosts cheaply:

- **Frontend** → **Cloudflare Pages** (static, free forever, never sleeps)
- **Backend** → **Render** (free Docker web service, no credit card; sleeps
  when idle, ~30–60s cold start)

The frontend works on its own — most tools run 100% in your browser. The
backend only powers the high-fidelity paths (text-preserving unlock, encrypt,
compress, OCR, high-fidelity inline edit, high-fidelity PDF→images). When the
backend is asleep or not deployed, those tools fall back gracefully and the app
stays usable.

> **Deploy the backend first** so you have its URL for the frontend build.

> **Note:** Hugging Face Spaces used to offer free Docker compute but now
> requires a paid PRO plan for it — only Static Spaces are free, which can't run
> this Python backend. Render's free tier fills that gap with no card required.

---

## Part 1 — Backend on Render

Render deploys straight from your GitHub repo using the `render.yaml` blueprint
in this repo — no separate git push needed.

### 1. Create the service from the blueprint
1. Sign up / log in at <https://dashboard.render.com> (GitHub sign-in is easiest;
   **no credit card** required for the free tier).
2. **New → Blueprint**.
3. Connect and pick the **`karthikvellur/ultra-pdf`** repo.
4. Render reads `render.yaml` and proposes a web service **`ultra-pdf-backend`**
   (Docker, free plan). Confirm / **Apply**.
5. It builds `backend/Dockerfile` (a few minutes the first time — installs
   Ghostscript/Tesseract/qpdf/poppler), then starts the service.

Your API goes live at a URL like:
```
https://ultra-pdf-backend.onrender.com
```

### 2. Verify it
```bash
curl https://ultra-pdf-backend.onrender.com/api/health
# → {"status":"ok","version":"0.1.0","tools":{"ghostscript":true, ...}}
```
All four tools should be `true`. **Copy this base URL** — the frontend needs it.

> **CORS:** the backend already allows any `*.pages.dev` origin (Cloudflare's
> default domains) via `ULTRA_PDF_CORS_ORIGIN_REGEX`. If you later use a
> **custom domain**, set `ULTRA_PDF_CORS_ORIGINS=https://your-domain.com` in the
> Render service’s **Environment** tab (comma-separated for several) and
> redeploy.

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
| `VITE_API_BASE` | `https://ultra-pdf-backend.onrender.com` |

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
   responds. If the service was asleep it may show **“Server offline”** for the
   first few seconds — click it to re-check after ~30–60s, or just use a
   server tool (your request wakes the service).
3. Test a browser-only tool (e.g. **Merge**) — instant, no backend needed.
4. Test a server tool (e.g. **Protect PDF**) — confirms the backend + CORS.

---

## Costs & limits (all free tiers)

| | Cloudflare Pages | Render (free web service) |
| --- | --- | --- |
| Price | $0 (no card) | $0 (no card) |
| Sleeps when idle | No | Yes (~30–60s cold start) |
| Bandwidth | Unlimited | Fair-use + monthly hours cap |
| Custom domain | Free to attach | Free to attach |

**The only user-visible catch** is the backend cold start after inactivity.
Because the frontend degrades gracefully, the app is always usable; heavy
features just wait for the wake-up (or use their browser fallback).

### Keeping the backend warm (optional)
If the cold start bugs you, ping the health endpoint every ~10 min with a free
uptime monitor (e.g. UptimeRobot):
```
GET https://ultra-pdf-backend.onrender.com/api/health
```
Fine for personal use; just don’t abuse the free tier.

---

## Faster cold starts (optional upgrade path)
If you later want near-instant heavy ops, redeploy the same `backend/` image to
**Google Cloud Run** (also free-tier, scales to zero, faster wake) — it needs a
Google account with a card on file. The Dockerfile works there unchanged: Cloud
Run injects `PORT`, which the container already honors.
