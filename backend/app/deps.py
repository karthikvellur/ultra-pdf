"""Shared request helpers: upload reading, validation, PDF responses."""
import io

from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from .config import settings

PDF_MAGIC = b"%PDF-"


async def read_upload(file: UploadFile, *, require_pdf: bool = True) -> bytes:
    """Read an UploadFile into memory with size + type guards."""
    data = await file.read()
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB limit.",
        )
    if require_pdf and not data.startswith(PDF_MAGIC):
        raise HTTPException(
            status_code=400,
            detail="Uploaded file is not a valid PDF.",
        )
    return data


def pdf_response(data: bytes, filename: str) -> StreamingResponse:
    if not filename.lower().endswith(".pdf"):
        filename += ".pdf"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def bytes_response(data: bytes, filename: str, media_type: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
