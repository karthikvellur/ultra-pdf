"""Text extraction and OCR (ocrmypdf / Tesseract)."""
import io
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ..deps import bytes_response, pdf_response, read_upload

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.post("/extract-text")
async def extract_text(file: UploadFile, force_ocr: bool = Form(False)):
    """Extract text from a PDF.

    First tries the embedded text layer (fast, exact). If the document has
    little/no text (a scan) or `force_ocr` is set, runs Tesseract OCR.
    Returns JSON: { text, method, pages }.
    """
    data = await read_upload(file)

    embedded = ""
    pages = 0
    if not force_ocr:
        embedded, pages = _embedded_text(data)
        # Heuristic: >40 chars/page on average means a real text layer.
        if pages and len(embedded.strip()) > 40 * pages * 0.25:
            return JSONResponse(
                {"text": embedded, "method": "embedded", "pages": pages}
            )

    text, pages = _ocr_text(data)
    return JSONResponse({"text": text, "method": "ocr", "pages": pages})


@router.post("/make-searchable")
async def make_searchable(file: UploadFile):
    """Add an invisible OCR text layer to a scanned PDF (ocrmypdf)."""
    data = await read_upload(file)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.pdf"
        dst = Path(tmp) / "out.pdf"
        src.write_bytes(data)
        proc = subprocess.run(
            ["ocrmypdf", "--skip-text", "--optimize", "1", str(src), str(dst)],
            capture_output=True,
        )
        if proc.returncode != 0 or not dst.exists():
            raise HTTPException(
                status_code=500,
                detail=f"OCR failed: {proc.stderr.decode('utf-8', 'ignore')[:300]}",
            )
        return pdf_response(dst.read_bytes(), _stem(file.filename) + "-searchable")


def _embedded_text(data: bytes) -> tuple[str, int]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data))
        chunks = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(chunks), len(reader.pages)
    except Exception:  # noqa: BLE001
        return "", 0


def _ocr_text(data: bytes) -> tuple[str, int]:
    """OCR via ocrmypdf (adds a layer) then read it back with pypdf."""
    from pypdf import PdfReader

    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "in.pdf"
        dst = Path(tmp) / "out.pdf"
        src.write_bytes(data)
        proc = subprocess.run(
            ["ocrmypdf", "--force-ocr", "--optimize", "0", str(src), str(dst)],
            capture_output=True,
        )
        if proc.returncode != 0 or not dst.exists():
            raise HTTPException(
                status_code=500,
                detail=f"OCR failed: {proc.stderr.decode('utf-8', 'ignore')[:300]}",
            )
        reader = PdfReader(str(dst))
        chunks = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(chunks), len(reader.pages)


def _stem(filename: str | None) -> str:
    name = filename or "document.pdf"
    return name[:-4] if name.lower().endswith(".pdf") else name
