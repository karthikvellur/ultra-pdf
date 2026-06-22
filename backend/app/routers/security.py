"""Password / encryption operations via pikepdf (qpdf).

Unlike the client-side rasterize fallback, these preserve the real PDF:
selectable text, vectors, and structure are kept intact.
"""
import io

import pikepdf
from fastapi import APIRouter, Form, HTTPException, UploadFile

from ..deps import pdf_response, read_upload

router = APIRouter(prefix="/api/security", tags=["security"])


@router.post("/unlock")
async def unlock(file: UploadFile, password: str = Form("")):
    """Remove a password from a PDF, preserving text and structure.

    Returns 422 with a clear code when the password is wrong/missing so the
    frontend can prompt again.
    """
    data = await read_upload(file)
    try:
        with pikepdf.open(io.BytesIO(data), password=password) as pdf:
            out = io.BytesIO()
            pdf.save(out)  # saving without encryption strips it
            return pdf_response(out.getvalue(), _stem(file.filename) + "-unlocked")
    except pikepdf.PasswordError:
        raise HTTPException(
            status_code=422,
            detail={"code": "wrong_password", "message": "Incorrect or missing password."},
        )
    except Exception as exc:  # noqa: BLE001 - surface a clean message
        raise HTTPException(status_code=400, detail=f"Could not unlock PDF: {exc}")


@router.post("/protect")
async def protect(
    file: UploadFile,
    user_password: str = Form(...),
    owner_password: str = Form(""),
    allow_printing: bool = Form(True),
    allow_copying: bool = Form(True),
):
    """Encrypt a PDF with AES-256 and an open (user) password.

    The owner password (if provided) governs permission changes; when omitted
    we reuse the user password as owner.
    """
    if not user_password:
        raise HTTPException(status_code=400, detail="A password is required.")
    data = await read_upload(file)
    owner = owner_password or user_password

    try:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            permissions = pikepdf.Permissions(
                extract=allow_copying,
                print_highres=allow_printing,
                print_lowres=allow_printing,
            )
            out = io.BytesIO()
            pdf.save(
                out,
                encryption=pikepdf.Encryption(
                    user=user_password,
                    owner=owner,
                    R=6,  # AES-256
                    allow=permissions,
                ),
            )
            return pdf_response(out.getvalue(), _stem(file.filename) + "-protected")
    except pikepdf.PasswordError:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "already_encrypted",
                "message": "This PDF is already encrypted. Unlock it first.",
            },
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Could not protect PDF: {exc}")


def _stem(filename: str | None) -> str:
    name = filename or "document.pdf"
    return name[:-4] if name.lower().endswith(".pdf") else name
