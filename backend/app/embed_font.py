"""Embed one of the app's bundled webfonts into a PDF as a real, drawable font.

Unlike the Base-14 substitution in routers/edit.py (a bare Type1 dict naming
a font every PDF viewer already has built in), these fonts don't ship with
any viewer — the actual glyph outlines have to be embedded in the file. This
follows the standard approach for embedding a full-Unicode TrueType font:

  Type0 (composite) font
    -> Encoding: Identity-H (2-byte character codes == glyph indices)
    -> DescendantFonts: [ CIDFontType2 ]
         -> CIDToGIDMap: Identity
         -> FontDescriptor -> FontFile2: the (subsetted) TTF program
         -> W: per-glyph advance widths, so text lays out correctly

Each embed subsets the font to only the glyphs the specific text being drawn
actually needs (via fontTools.subset) — keeps the output small and sidesteps
having to worry about hinting/layout tables we don't use.
"""
from __future__ import annotations

import hashlib
import io
import itertools
from functools import lru_cache
from pathlib import Path

import pikepdf
from fontTools import subset
from fontTools.ttLib import TTFont

# Each embed_bundled_font() call subsets independently and gets its own
# resource — two edits using "the same" font end up with two font objects
# rather than sharing one, since each subset has its own private glyph-id
# numbering (see the CID/width comments below). A per-process counter keeps
# resource names collision-free without needing a stable hash of anything.
_resource_counter = itertools.count()

FONTS_DIR = Path(__file__).parent / "fonts"

_STEMS = {
    "roboto": "Roboto",
    "open-sans": "OpenSans",
    "lato": "Lato",
    "source-serif-4": "SourceSerif4",
    "merriweather": "Merriweather",
    "pt-serif": "PTSerif",
    "jetbrains-mono": "JetBrainsMono",
    "ibm-plex-mono": "IBMPlexMono",
}

BUNDLED_FONT_FAMILIES = frozenset(_STEMS)


def bundled_font_path(family: str, bold: bool, italic: bool) -> Path:
    stem = _STEMS[family]
    style = (
        "BoldItalic" if bold and italic else "Bold" if bold else "Italic" if italic else "Regular"
    )
    return FONTS_DIR / f"{stem}-{style}.ttf"


@lru_cache(maxsize=32)
def _load_font_bytes(path: str) -> bytes:
    return Path(path).read_bytes()


def _subset_tag(seed: str) -> str:
    """A 6-uppercase-letter subset tag (PDF convention, e.g. "ABCDEF+Roboto").
    Must be unique per distinct subset in the file — combines a stable hash
    of `seed` with a per-process counter so repeated calls for the same font
    never collide."""
    n = int.from_bytes(hashlib.sha1(seed.encode()).digest()[:4], "big")
    n = (n + next(_resource_counter)) & 0xFFFFFFFF
    return "".join(chr(65 + (n >> (i * 5)) % 26) for i in range(6))


def embed_bundled_font(
    pdf: pikepdf.Pdf, page, family: str, bold: bool, italic: bool, text: str
) -> tuple[str, bytes]:
    """Embed a subset of the requested bundled font (containing only the
    glyphs `text` needs) into `page`'s resources.

    Returns `(resource_name, cid_string)`: the resource name for a `Tf`
    operator (without the leading `/`), and `text` pre-encoded as the
    2-byte-per-glyph CID string a `Tj` operator draws it with — encoded
    against this SAME subsetted font instance, so the CIDs are guaranteed to
    match the glyph ids actually embedded (subsetting renumbers glyph ids;
    encoding from a separately-loaded copy of the font would silently point
    at the wrong glyphs).
    """
    font_path = bundled_font_path(family, bold, italic)
    raw = _load_font_bytes(str(font_path))

    ttfont = TTFont(io.BytesIO(raw))
    units_per_em = ttfont["head"].unitsPerEm
    cmap = ttfont.getBestCmap()
    hmtx = ttfont["hmtx"]

    # Map each character actually used (in encounter order, for the CID
    # string) to its glyph NAME + advance width, before subsetting. Glyph
    # names survive subsetting (options.glyph_names default is True) — only
    # glyph *ids* (position in the glyph order) get renumbered, so name is
    # the stable key used to translate to the subset's own ids afterward.
    char_glyph_names: list[str | None] = [cmap.get(ord(ch)) for ch in text]
    width_by_name: dict[str, int] = {}
    for glyph_name in char_glyph_names:
        if glyph_name is not None and glyph_name not in width_by_name:
            width_by_name[glyph_name] = round(hmtx[glyph_name][0] * 1000 / units_per_em)

    options = subset.Options()
    options.layout_features = []
    options.notdef_outline = True
    options.recalc_bounds = True
    options.recalc_timestamp = False
    options.name_IDs = []
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=text)
    subsetter.subset(ttfont)

    # CIDToGIDMap is Identity, so the CIDs in our drawn text must be the
    # SUBSET's glyph ids. Glyph names are preserved through subsetting, so
    # look each one back up by name in the new (shrunk) glyph order — for
    # both the widths table and the CID string itself, from this same
    # subsetted instance, so the two can never disagree on glyph numbering.
    new_glyph_order = ttfont.getGlyphOrder()
    cid_widths: dict[int, int] = {}
    for glyph_name, width in width_by_name.items():
        if glyph_name in new_glyph_order:
            cid_widths[new_glyph_order.index(glyph_name)] = width

    cid_bytes = bytearray()
    cid_to_unicode: dict[int, str] = {}
    for ch, glyph_name in zip(text, char_glyph_names):
        gid = new_glyph_order.index(glyph_name) if glyph_name in new_glyph_order else 0
        cid_bytes += gid.to_bytes(2, "big")
        cid_to_unicode.setdefault(gid, ch)

    out_buf = io.BytesIO()
    ttfont.save(out_buf)
    subset_bytes = out_buf.getvalue()

    ascent = round(ttfont["OS/2"].sTypoAscender * 1000 / units_per_em)
    descent = round(ttfont["OS/2"].sTypoDescender * 1000 / units_per_em)
    italic_angle = float(ttfont["post"].italicAngle)
    cap_height = getattr(ttfont["OS/2"], "sCapHeight", ascent) or ascent
    stem_v = 80 + (30 if bold else 0)

    flags = 0b0100  # nonsymbolic
    if italic_angle != 0.0 or italic:
        flags |= 0b1000000  # italic

    base_tag = _subset_tag(font_path.stem)
    base_font_name = f"{base_tag}+{font_path.stem}"

    font_file_stream = pikepdf.Stream(pdf, subset_bytes)
    font_file_stream["/Length1"] = len(subset_bytes)

    descriptor = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/FontDescriptor"),
            FontName=pikepdf.Name(f"/{base_font_name}"),
            Flags=flags,
            FontBBox=[0, descent, 1000, ascent],
            ItalicAngle=italic_angle,
            Ascent=ascent,
            Descent=descent,
            CapHeight=cap_height,
            StemV=stem_v,
            FontFile2=font_file_stream,
        )
    )

    # CIDToGIDMap: Identity means "glyph id == CID" — true here since we draw
    # text using the SUBSET's own (post-subsetting) glyph ids as CIDs.
    w_array = _build_w_array(cid_widths)

    descendant = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/Font"),
            Subtype=pikepdf.Name("/CIDFontType2"),
            BaseFont=pikepdf.Name(f"/{base_font_name}"),
            CIDSystemInfo=pikepdf.Dictionary(
                Registry=pikepdf.String("Adobe"),
                Ordering=pikepdf.String("Identity"),
                Supplement=0,
            ),
            FontDescriptor=descriptor,
            CIDToGIDMap=pikepdf.Name("/Identity"),
            DW=1000,
            W=w_array,
        )
    )

    to_unicode_stream = pikepdf.Stream(pdf, _build_to_unicode_cmap(cid_to_unicode))

    font_obj = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name("/Font"),
            Subtype=pikepdf.Name("/Type0"),
            BaseFont=pikepdf.Name(f"/{base_font_name}"),
            Encoding=pikepdf.Name("/Identity-H"),
            DescendantFonts=[descendant],
            ToUnicode=to_unicode_stream,
        )
    )

    resources = page.obj.get("/Resources")
    if resources is None:
        page.obj["/Resources"] = pikepdf.Dictionary()
        resources = page.obj["/Resources"]
    if "/Font" not in resources:
        resources["/Font"] = pikepdf.Dictionary()
    fonts = resources["/Font"]

    res_key = f"/UPF_{base_tag}"
    fonts[res_key] = font_obj
    return res_key.lstrip("/"), bytes(cid_bytes)


def _build_to_unicode_cmap(cid_to_unicode: dict[int, str]) -> bytes:
    """Minimal ToUnicode CMap so extracted/copied text reads correctly —
    without this, a Type0/Identity-H font's raw glyph ids extract as garbage
    instead of the actual characters they represent."""
    bf_lines = "\n".join(
        f"<{cid:04X}> <{ch.encode('utf-16-be').hex().upper()}>"
        for cid, ch in sorted(cid_to_unicode.items())
    )
    cmap = f"""/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
{len(cid_to_unicode)} beginbfchar
{bf_lines}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
"""
    return cmap.encode("latin-1")


def _build_w_array(cid_widths: dict[int, int]) -> pikepdf.Array:
    """Build a PDF `W` array (CIDFont glyph widths) in the compact
    `c [w1 w2 ...]` form. `cid_widths` keys are already the subset's own
    (post-subsetting) glyph ids."""
    items: list = []
    for gid in sorted(cid_widths):
        items.append(gid)
        items.append([cid_widths[gid]])
    return pikepdf.Array(items)
