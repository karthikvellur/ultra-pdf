"""Shared PDF helpers used by more than one router.

These were originally private to `routers/transform.py`; they're promoted here
so the inline-text-edit router can reuse the exact same, proven primitives
(notably the whiteout overlay) rather than reimplementing them.
"""
from __future__ import annotations

import pikepdf


def stem(filename: str | None) -> str:
    """Strip a trailing .pdf (case-insensitive) for building output names."""
    name = filename or "document.pdf"
    return name[:-4] if name.lower().endswith(".pdf") else name


def page_size(page) -> tuple[float, float, float, float]:
    """Return (width, height, llx, lly) from a page's MediaBox."""
    box = page.mediabox
    llx = float(box[0])
    lly = float(box[1])
    width = float(box[2]) - llx
    height = float(box[3]) - lly
    return width, height, llx, lly


def norm_rect_to_points(
    page, x: float, y: float, w: float, h: float
) -> tuple[float, float, float, float]:
    """Convert a normalized (0..1, top-left origin) rect to PDF points.

    Returns (px, py, pw_w, ph_h) where (px, py) is the bottom-left corner in
    PDF user space — the same flip used across the app's overlay tools.
    """
    pw, ph, llx, lly = page_size(page)
    px = x * pw + llx
    pw_w = w * pw
    ph_h = h * ph
    py = ph - (y * ph) - ph_h + lly
    return px, py, pw_w, ph_h


def paint_white_box(pdf: pikepdf.Pdf, page, spec: dict) -> None:
    """Append a content stream drawing an opaque white rectangle over `spec`.

    `spec` uses normalized top-left coords: keys x, y, w, h (each 0..1).
    The rectangle is drawn last so it covers existing page content.
    """
    px, py, pw_w, ph_h = norm_rect_to_points(
        page, float(spec["x"]), float(spec["y"]), float(spec["w"]), float(spec["h"])
    )
    overlay = (
        f"q 1 1 1 rg {px:.2f} {py:.2f} {pw_w:.2f} {ph_h:.2f} re f Q\n"
    ).encode("latin-1")
    page.contents_add(pikepdf.Stream(pdf, overlay), prepend=False)
