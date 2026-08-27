"""Truly remove the original glyphs behind an inline text edit.

The whiteout+redraw primitive in `routers/edit.py` covers the old text with an
opaque rectangle and draws the replacement on top — visually correct, but the
original text-show operators are still present in the content stream, so the
old text is recoverable by selecting/copying from the PDF (confirmed: text
extractors read the shown string regardless of text-rendering mode, so making
a run invisible via `Tr 3` is NOT enough on its own — it stops rendering but
not extraction).

This module finds those specific text-show operators and drops them from the
content stream entirely, so the old glyphs neither render nor extract.

Matching is geometric: we replay the content stream ourselves (tracking the
text matrix / line matrix / CTM, mirroring what the frontend's textExtract.ts
does with pdf.js) and mark every text-show operator whose origin point falls
inside the target run's bounding box. `Tj`/`TJ` are dropped outright; `'`/`"`
combine a line-advance with showing text, so those are replaced with their
non-showing equivalent (`T*`, or `aw Tw ac Tc T*`) rather than dropped, so we
don't silently break the positioning of whatever text follows in the same
text object.

If we can't confidently match anything (unusual content-stream shapes,
malformed operand counts, etc.) we simply remove nothing — the caller's
whiteout-and-redraw still makes the edit look correct, it just falls back to
the old "covered, not removed" behavior for that one run.
"""
from __future__ import annotations

import pikepdf

from .pdf_util import norm_rect_to_points

_IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def _compose(m1: tuple, m2: tuple) -> tuple:
    """m1 followed by m2 (PDF `cm`/`Tm` composition order)."""
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


def _apply(m: tuple, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


def _to_float_list(operands) -> list[float] | None:
    try:
        return [float(o) for o in operands]
    except (TypeError, ValueError):
        return None


def hide_original_glyphs(pdf: pikepdf.Pdf, page, bbox: dict) -> bool:
    """Drop text-show operators whose origin falls inside `bbox`.

    `bbox` uses the same normalized top-left coords as the rest of the app:
    keys x, y, w, h (each 0..1). Returns True if at least one operator was
    matched and removed.
    """
    try:
        instructions = pikepdf.parse_content_stream(page)
    except Exception:  # noqa: BLE001
        return False

    px, py, pw, ph = norm_rect_to_points(
        page, float(bbox["x"]), float(bbox["y"]), float(bbox["w"]), float(bbox["h"])
    )
    # Small margin: our own geometry and the frontend's pdf.js-derived bbox
    # won't agree to the sub-point, and font-space vs. device-space rounding
    # compounds through the fragmented Td chain in browser-print PDFs.
    margin = max(pw, ph) * 0.15 + 1.0
    x_min, x_max = px - margin, px + pw + margin
    y_min, y_max = py - margin, py + ph + margin

    def in_target(pt: tuple[float, float]) -> bool:
        x, y = pt
        return x_min <= x <= x_max and y_min <= y <= y_max

    # Graphics-state replay: CTM stack (q/Q/cm), text matrix + text line
    # matrix (Tm/Td/TD/T*), reset on BT.
    ctm_stack: list[tuple] = []
    ctm = _IDENTITY
    tm = _IDENTITY
    tlm = _IDENTITY
    leading = 0.0
    in_text_object = False

    matched_indices: set[int] = set()

    for idx, instr in enumerate(instructions):
        op = str(instr.operator)

        if op == "q":
            ctm_stack.append(ctm)
        elif op == "Q":
            if ctm_stack:
                ctm = ctm_stack.pop()
        elif op == "cm":
            vals = _to_float_list(instr.operands)
            if vals and len(vals) == 6:
                ctm = _compose(tuple(vals), ctm)
        elif op == "BT":
            in_text_object = True
            tm = _IDENTITY
            tlm = _IDENTITY
        elif op == "ET":
            in_text_object = False
        elif op == "Tm":
            vals = _to_float_list(instr.operands)
            if vals and len(vals) == 6:
                tm = tuple(vals)
                tlm = tm
        elif op in ("Td", "TD"):
            vals = _to_float_list(instr.operands)
            if vals and len(vals) == 2:
                if op == "TD":
                    leading = -vals[1]
                tlm = _compose((1.0, 0.0, 0.0, 1.0, vals[0], vals[1]), tlm)
                tm = tlm
        elif op == "TL":
            vals = _to_float_list(instr.operands)
            if vals and len(vals) == 1:
                leading = vals[0]
        elif op in ("T*", "'", '"') and in_text_object:
            # '/" move to the next line (like T*) before showing text.
            tlm = _compose((1.0, 0.0, 0.0, 1.0, 0.0, -leading), tlm)
            tm = tlm
            if op in ("'", '"'):
                origin_page_space = _apply(ctm, *_apply(tm, 0.0, 0.0))
                if in_target(origin_page_space):
                    matched_indices.add(idx)
        elif op == "Tj" and in_text_object:
            origin_page_space = _apply(ctm, *_apply(tm, 0.0, 0.0))
            if in_target(origin_page_space):
                matched_indices.add(idx)
        elif op == "TJ" and in_text_object:
            origin_page_space = _apply(ctm, *_apply(tm, 0.0, 0.0))
            if in_target(origin_page_space):
                matched_indices.add(idx)

    if not matched_indices:
        return False

    new_instructions: list = []
    for idx, instr in enumerate(instructions):
        if idx not in matched_indices:
            new_instructions.append(instr)
            continue
        op = str(instr.operator)
        if op in ("Tj", "TJ"):
            # Drop the show entirely — nothing else depends on these having
            # run (Tj/TJ don't move the text position).
            continue
        if op == "'":
            # T* then Tj — keep only the line-advance.
            new_instructions.append(
                pikepdf.ContentStreamInstruction([], pikepdf.Operator("T*"))
            )
            continue
        if op == '"':
            # aw ac string " == aw Tw ac Tc T* string Tj — keep the Tw/Tc/T*
            # side effects (later text on the same line may rely on them),
            # drop only the show.
            operands = _to_float_list(instr.operands[:2]) or []
            if len(operands) == 2:
                aw, ac = operands
                new_instructions.append(
                    pikepdf.ContentStreamInstruction([aw], pikepdf.Operator("Tw"))
                )
                new_instructions.append(
                    pikepdf.ContentStreamInstruction([ac], pikepdf.Operator("Tc"))
                )
            new_instructions.append(
                pikepdf.ContentStreamInstruction([], pikepdf.Operator("T*"))
            )
            continue
        # Unrecognized matched op (shouldn't happen) — leave it untouched
        # rather than risk corrupting the stream.
        new_instructions.append(instr)

    new_data = pikepdf.unparse_content_stream(new_instructions)
    page.Contents = pdf.make_stream(new_data)
    return True
