"""Inline text editing: replace existing text in a PDF, preserving layout.

Strategy (chosen for robustness over cleverness): **whiteout + redraw**.
For each edit we cover the original run's bounding box with an opaque white
rectangle, then draw the replacement text at the same baseline. This is the
same proven primitive used by the watermark-redaction tool.

Font fidelity is tiered and reported honestly back to the client:
  - Tier 1 (high): the original font is fully embedded and NOT subset → reuse
    it, so the result is visually identical.
  - Tier 2 (good): the font is subset / has no embedded program / is unknown →
    substitute a Base-14 font matched on serif/sans/mono + bold/italic. Renders
    reliably; glyph shapes differ. We set `X-Font-Fallback: true`.

Composite (Type0/CID) fonts, ToUnicode matching, RTL/vertical text, and true
re-subsetting (needs fontTools, not installed) are out of v1 scope — such edits
are applied via the Base-14 fallback rather than corrupting the file.
"""
from __future__ import annotations

import io
import json
import re

import pikepdf
from fastapi import APIRouter, Form, HTTPException, UploadFile

from ..deps import pdf_response, read_upload
from ..pdf_util import norm_rect_to_points, paint_white_box, stem as _stem

router = APIRouter(prefix="/api/edit", tags=["edit"])

# Base-14 PostScript names by (serif, mono, bold, italic).
_BASE14 = {
    # serif (Times)
    (True, False, False, False): "Times-Roman",
    (True, False, True, False): "Times-Bold",
    (True, False, False, True): "Times-Italic",
    (True, False, True, True): "Times-BoldItalic",
    # sans (Helvetica)
    (False, False, False, False): "Helvetica",
    (False, False, True, False): "Helvetica-Bold",
    (False, False, False, True): "Helvetica-Oblique",
    (False, False, True, True): "Helvetica-BoldOblique",
    # mono (Courier)
    (False, True, False, False): "Courier",
    (False, True, True, False): "Courier-Bold",
    (False, True, False, True): "Courier-Oblique",
    (False, True, True, True): "Courier-BoldOblique",
}

# FontDescriptor /Flags bits (PDF spec Table 121).
_FLAG_FIXED_PITCH = 1 << 0
_FLAG_SERIF = 1 << 1
_FLAG_ITALIC = 1 << 6
_FLAG_FORCE_BOLD = 1 << 18

_SUBSET_RE = re.compile(r"^[A-Z]{6}\+")


@router.post("/text")
async def edit_text(file: UploadFile, edits: str = Form(...)):
    """Apply a batch of inline text replacements.

    `edits` is a JSON array of:
        { "pageIndex": 0,
          "originalText": "...",          # informational (not required to match)
          "newText": "...",
          "bbox": {"x":0..1,"y":0..1,"width":0..1,"height":0..1},  # top-left norm
          "fontInfo": {"name":"F1","size":11,"isSerif":true,
                       "bold":false,"italic":false} }
    Returns the edited PDF. Header `X-Font-Fallback: true` if any edit had to
    substitute a Base-14 font.
    """
    data = await read_upload(file)
    try:
        specs = json.loads(edits)
        assert isinstance(specs, list)
    except (json.JSONDecodeError, AssertionError):
        raise HTTPException(status_code=400, detail="`edits` must be a JSON array.")
    if not specs:
        raise HTTPException(status_code=400, detail="No edits provided.")

    any_fallback = False
    try:
        with pikepdf.open(io.BytesIO(data)) as pdf:
            for spec in specs:
                page_idx = int(spec["pageIndex"])
                if page_idx < 0 or page_idx >= len(pdf.pages):
                    continue
                page = pdf.pages[page_idx]
                used_fallback = _apply_text_edit(pdf, page, spec)
                any_fallback = any_fallback or used_fallback
            out = io.BytesIO()
            pdf.save(out)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"Edit missing field: {exc}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Text edit failed: {exc}")

    response = pdf_response(out.getvalue(), _stem(file.filename) + "-edited")
    response.headers["X-Font-Fallback"] = "true" if any_fallback else "false"
    response.headers["Access-Control-Expose-Headers"] = "X-Font-Fallback"
    return response


def _apply_text_edit(pdf: pikepdf.Pdf, page, spec: dict) -> bool:
    """Whiteout the original run and draw `newText`. Returns True if a fallback
    font was used."""
    bbox = spec["bbox"]
    font_info = spec.get("fontInfo", {})
    new_text = str(spec["newText"])

    # 1. Cover the original text. paint_white_box expects keys x,y,w,h.
    paint_white_box(
        pdf,
        page,
        {"x": bbox["x"], "y": bbox["y"], "w": bbox["width"], "h": bbox["height"]},
    )

    # 2. Decide the font to draw with.
    res_name, used_fallback = _ensure_font(pdf, page, font_info)

    # 3. Baseline position in PDF points. The bbox top is at bbox.y; the text
    #    baseline sits ~descent above the box bottom. We approximate the
    #    baseline at the box bottom + 18% of size (typical descent fraction).
    size = float(font_info.get("size", 12))
    px, py_bottom, _w, _h = norm_rect_to_points(
        page, bbox["x"], bbox["y"], bbox["width"], bbox["height"]
    )
    baseline_y = py_bottom + size * 0.18

    # 4. Append the text-drawing stream so it lands on top of the whiteout.
    esc = _pdf_escape(new_text)
    overlay = (
        f"q BT /{res_name} {size:.2f} Tf 0 0 0 rg "
        f"1 0 0 1 {px:.2f} {baseline_y:.2f} Tm {esc} Tj ET Q\n"
    ).encode("latin-1")
    page.contents_add(pikepdf.Stream(pdf, overlay), prepend=False)
    return used_fallback


def _ensure_font(pdf: pikepdf.Pdf, page, font_info: dict) -> tuple[str, bool]:
    """Return (resource_name, used_fallback).

    Tier 1: reuse the page's existing font if it's fully embedded & not subset.
    Tier 2: register a Base-14 font matched to the requested style.
    """
    resources = page.obj.get("/Resources")
    fonts = resources.get("/Font") if resources is not None else None
    requested = font_info.get("name")

    if fonts is not None and requested:
        key = requested if requested.startswith("/") else f"/{requested}"
        src = fonts.get(key)
        if src is not None and _is_reusable(src):
            return key.lstrip("/"), False

    return _embed_base14(pdf, page, font_info), True


def _is_reusable(font_dict) -> bool:
    """A font is safely reusable for NEW text only if it's a simple font with a
    full (non-subset) embedded program. Subset fonts lack unused glyphs."""
    try:
        base = str(font_dict.get("/BaseFont", "")).lstrip("/")
        if _SUBSET_RE.match(base):
            return False  # subset → missing glyphs for new chars
        subtype = str(font_dict.get("/Subtype", ""))
        if subtype == "/Type0":
            return False  # composite font: CID encoding, out of v1 scope
        descriptor = font_dict.get("/FontDescriptor")
        if descriptor is None:
            return False
        has_program = any(
            k in descriptor for k in ("/FontFile", "/FontFile2", "/FontFile3")
        )
        return bool(has_program)
    except Exception:  # noqa: BLE001
        return False


def _embed_base14(pdf: pikepdf.Pdf, page, font_info: dict) -> str:
    """Register a Base-14 Type1 font on the page and return its resource name.

    Reuses an already-registered Base-14 if present to avoid duplicates.
    """
    serif = bool(font_info.get("isSerif", False))
    mono = bool(font_info.get("mono", False))
    bold = bool(font_info.get("bold", False))
    italic = bool(font_info.get("italic", False))
    ps_name = _BASE14[(serif, mono, bold, italic)]

    # Ensure a /Resources /Font dict exists.
    resources = page.obj.get("/Resources")
    if resources is None:
        page.obj["/Resources"] = pikepdf.Dictionary()
        resources = page.obj["/Resources"]
    if "/Font" not in resources:
        resources["/Font"] = pikepdf.Dictionary()
    fonts = resources["/Font"]

    # Reuse if we already added this exact Base-14 font.
    res_key = f"/UPF_{ps_name.replace('-', '')}"
    if res_key in fonts:
        return res_key.lstrip("/")

    font_obj = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/Font"),
            Subtype=pikepdf.Name("/Type1"),
            BaseFont=pikepdf.Name(f"/{ps_name}"),
            Encoding=pikepdf.Name("/WinAnsiEncoding"),
        )
    )
    fonts[res_key] = font_obj
    return res_key.lstrip("/")


def font_flags_to_style(descriptor) -> dict:
    """Derive style hints from a FontDescriptor /Flags bitfield + /ItalicAngle.

    Exposed for testing; the frontend usually supplies these from pdf.js, but
    the server can recompute when given only a font name.
    """
    flags = 0
    italic_angle = 0.0
    try:
        flags = int(descriptor.get("/Flags", 0))
        italic_angle = float(descriptor.get("/ItalicAngle", 0))
    except Exception:  # noqa: BLE001
        pass
    return {
        "isSerif": bool(flags & _FLAG_SERIF),
        "mono": bool(flags & _FLAG_FIXED_PITCH),
        "bold": bool(flags & _FLAG_FORCE_BOLD),
        "italic": bool(flags & _FLAG_ITALIC) or italic_angle != 0.0,
    }


def _pdf_escape(text: str) -> str:
    """Escape text for a PDF literal string operand.

    WinAnsi-encodable chars use a parenthesized literal; anything outside
    Latin-1 falls back to a UTF-16BE hex string so the glyphs at least map.
    """
    try:
        text.encode("latin-1")
        escaped = (
            text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        )
        return f"({escaped})"
    except UnicodeEncodeError:
        be = text.encode("utf-16-be")
        return "<" + be.hex().upper() + ">"
