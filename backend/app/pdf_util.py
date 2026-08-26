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


_IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _compose(m1: tuple, m2: tuple) -> tuple:
    """Compose two PDF matrices as `m1` followed by `m2` (PDF's `cm` semantics:
    the operand matrix is applied *before* the current one)."""
    a1, b1, c1, d1, e1, f1 = m1
    a2, b2, c2, d2, e2, f2 = m2
    return (
        a1 * a2 + b1 * c2,
        a1 * b2 + b1 * d2,
        c1 * a2 + d1 * c2,
        c1 * b2 + d1 * d2,
        e1 * a2 + f1 * c2 + e2,
        e1 * b2 + f1 * d2 + f2,
    )


def _invert(m: tuple) -> tuple:
    a, b, c, d, e, f = m
    det = a * d - b * c
    if abs(det) < 1e-12:
        return _IDENTITY
    ia, ib, ic, id_ = d / det, -b / det, -c / det, a / det
    ie = (c * f - d * e) / det
    if_ = (b * e - a * f) / det
    return (ia, ib, ic, id_, ie, if_)


def base_ctm_inverse(page) -> tuple:
    """Compute the inverse of whatever CTM is left active once the page's
    content stream(s) finish (all `q`/`Q` pairs balanced back to depth 0).

    Content streams in a page's /Contents array share ONE graphics-state
    stack across the whole concatenated stream — so appending new content
    (e.g. our whiteout-and-redraw overlay) inherits any transform the
    original content left active outside a `q ... Q` pair. This is a real,
    valid pattern (browser/print-to-PDF output commonly starts with an
    unbracketed `cm` that rescales the whole page once), not malformed PDF.
    We replay just the `q`/`Q`/`cm` operators to find that leaked transform
    and return its inverse, so overlay content can undo it and draw using
    true absolute PDF-space coordinates.
    """
    try:
        instructions = pikepdf.parse_content_stream(page, "q Q cm")
    except Exception:  # noqa: BLE001
        return _IDENTITY

    stack: list[tuple] = []
    ctm = _IDENTITY
    for instr in instructions:
        op = str(instr.operator)
        if op == "q":
            stack.append(ctm)
        elif op == "Q":
            if stack:
                ctm = stack.pop()
        elif op == "cm":
            try:
                operands = tuple(float(v) for v in instr.operands)
            except (TypeError, ValueError):
                continue
            if len(operands) == 6:
                ctm = _compose(operands, ctm)
    return _invert(ctm)


def cm_str(m: tuple) -> str:
    """Format a 6-tuple matrix as the operand string for a PDF `cm` operator."""
    return " ".join(f"{v:.6f}" for v in m)


def paint_white_box(pdf: pikepdf.Pdf, page, spec: dict) -> None:
    """Append a content stream drawing an opaque white rectangle over `spec`.

    `spec` uses normalized top-left coords: keys x, y, w, h (each 0..1).
    The rectangle is drawn last so it covers existing page content.
    """
    px, py, pw_w, ph_h = norm_rect_to_points(
        page, float(spec["x"]), float(spec["y"]), float(spec["w"]), float(spec["h"])
    )
    # Undo whatever CTM the original content left active — see
    # base_ctm_inverse's docstring. `cm` concatenates with the *current*
    # transform rather than replacing it, so applying the inverse here
    # cancels it out and leaves our own coordinates in true PDF-space.
    inv = cm_str(base_ctm_inverse(page))
    overlay = (
        f"q {inv} cm 1 1 1 rg {px:.2f} {py:.2f} {pw_w:.2f} {ph_h:.2f} re f Q\n"
    ).encode("latin-1")
    page.contents_add(pikepdf.Stream(pdf, overlay), prepend=False)
