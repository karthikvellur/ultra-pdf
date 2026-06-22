"""Transformations needing native tooling: compress, watermark redaction."""
import io
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile

from ..deps import pdf_response, read_upload
from ..pdf_util import paint_white_box, stem as _stem

router = APIRouter(prefix="/api/transform", tags=["transform"])

# Ghostscript quality presets → /dPDFSETTINGS values.
_GS_PRESETS = {
    "low": "/screen",     # smallest, 72 dpi images
    "medium": "/ebook",   # 150 dpi, good balance
    "high": "/printer",   # 300 dpi, near-lossless
}


@router.post("/compress")
async def compress(file: UploadFile, level: str = Form("medium")):
    """Reduce PDF size with Ghostscript, preserving text and structure."""
    if level not in _GS_PRESETS:
        raise HTTPException(status_code=400, detail="level must be low|medium|high")
    data = await read_upload(file)

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.pdf"
        dst = Path(tmp) / "out.pdf"
        src.write_bytes(data)

        cmd = [
            "gs",
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.5",
            f"-dPDFSETTINGS={_GS_PRESETS[level]}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            "-dDetectDuplicateImages=true",
            f"-sOutputFile={dst}",
            str(src),
        ]
        proc = subprocess.run(cmd, capture_output=True)
        if proc.returncode != 0 or not dst.exists():
            raise HTTPException(
                status_code=500,
                detail=f"Compression failed: {proc.stderr.decode('utf-8', 'ignore')[:300]}",
            )

        compressed = dst.read_bytes()

    # If Ghostscript made it bigger (already-optimized PDFs), keep the original.
    if len(compressed) >= len(data):
        compressed = data
    return pdf_response(compressed, _stem(file.filename) + "-compressed")


@router.post("/redact-regions")
async def redact_regions(
    file: UploadFile,
    regions: str = Form(...),  # JSON: see schema below
):
    """Cover rectangular regions on pages with opaque white boxes.

    This is how we handle "burned-in" watermarks that can't be deleted as
    annotations: the user marks the watermark area and we paint over it. The
    text under the box is also flattened (drawn over), so it's a genuine
    visual redaction, not a toggle.

    `regions` is a JSON array of:
        { "page": <0-based int>,
          "x": <0..1>, "y": <0..1>, "w": <0..1>, "h": <0..1> }
    with a top-left origin in normalized page coordinates.
    """
    import json

    import pikepdf

    data = await read_upload(file)
    try:
        specs = json.loads(regions)
        assert isinstance(specs, list)
    except (json.JSONDecodeError, AssertionError):
        raise HTTPException(status_code=400, detail="`regions` must be a JSON array.")

    try:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            for spec in specs:
                page_idx = int(spec["page"])
                if page_idx < 0 or page_idx >= len(pdf.pages):
                    continue
                page = pdf.pages[page_idx]
                paint_white_box(pdf, page, spec)
            out = io.BytesIO()
            pdf.save(out)
            return pdf_response(out.getvalue(), _stem(file.filename) + "-redacted")
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Region missing field: {exc}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Redaction failed: {exc}")
