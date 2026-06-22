"""Ultra PDF backend — FastAPI app for heavy PDF operations.

Only operations that genuinely benefit from a server live here:
  - true text-preserving unlock / encrypt (qpdf via pikepdf)
  - compression (Ghostscript)
  - OCR (ocrmypdf / Tesseract)
  - burned-in watermark redaction (server-side render + cover)
  - high-fidelity PDF -> images (poppler)

Light operations (merge, split, rotate, watermark, page numbers, annotate,
images->PDF, organize pages) stay 100% client-side in the browser.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import security, transform, convert, ocr, edit
from .tools import tool_runtime

app = FastAPI(
    title="Ultra PDF API",
    version="0.1.0",
    description="Heavy PDF operations for the Ultra PDF hybrid backend.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(security.router)
app.include_router(transform.router)
app.include_router(convert.router)
app.include_router(ocr.router)
app.include_router(edit.router)


@app.get("/api/health")
def health() -> dict:
    """Liveness + capability probe.

    The frontend calls this to decide whether server-backed tools are
    available, and reports which underlying binaries are present.
    """
    return {
        "status": "ok",
        "version": "0.1.0",
        "tools": tool_runtime.probe(),
    }
