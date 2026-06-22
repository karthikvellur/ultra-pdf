"""High-fidelity conversions that benefit from native rendering (poppler)."""
import io
import zipfile

from fastapi import APIRouter, Form, HTTPException, UploadFile
from pdf2image import convert_from_bytes

from ..deps import bytes_response, read_upload

router = APIRouter(prefix="/api/convert", tags=["convert"])


@router.post("/pdf-to-images")
async def pdf_to_images(
    file: UploadFile,
    fmt: str = Form("png"),  # png | jpeg
    dpi: int = Form(150),
):
    """Render each page to an image and return a ZIP of all pages.

    Poppler renders at full fidelity (better than canvas rasterization),
    which is why this is a server op.
    """
    fmt = fmt.lower()
    if fmt not in ("png", "jpeg", "jpg"):
        raise HTTPException(status_code=400, detail="fmt must be png or jpeg")
    if fmt == "jpg":
        fmt = "jpeg"
    dpi = max(48, min(dpi, 400))

    data = await read_upload(file)
    try:
        images = convert_from_bytes(data, dpi=dpi, fmt=fmt)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Render failed: {exc}")

    ext = "jpg" if fmt == "jpeg" else "png"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, img in enumerate(images, start=1):
            page_buf = io.BytesIO()
            save_kwargs = {"format": "JPEG", "quality": 90} if fmt == "jpeg" else {"format": "PNG"}
            img.save(page_buf, **save_kwargs)
            zf.writestr(f"page-{i:03d}.{ext}", page_buf.getvalue())

    return bytes_response(
        buf.getvalue(),
        _stem(file.filename) + f"-{ext}-pages.zip",
        "application/zip",
    )


def _stem(filename: str | None) -> str:
    name = filename or "document.pdf"
    return name[:-4] if name.lower().endswith(".pdf") else name
