import sys, io, os, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen
import uharfbuzz as hb

font_path, out_dir = sys.argv[1], sys.argv[2]

# ---------- brand constants ----------
INK = "#26262B"
GROUND = "#F3F1EE"
WHITE = "#FFFFFF"
GREEN = "#0F9246"

# ---------- font ----------
tt = TTFont(font_path)
tt.flavor = None
buf = io.BytesIO()
tt.save(buf)
data = buf.getvalue()
tt = TTFont(io.BytesIO(data))
upem = tt["head"].unitsPerEm
gs = tt.getGlyphSet()
order = tt.getGlyphOrder()
face = hb.Face(data)
hbfont = hb.Font(face)


def shape(text):
    b = hb.Buffer()
    b.add_str(text)
    b.guess_segment_properties()
    hb.shape(hbfont, b, {"kern": True, "liga": False})
    return [(order[i.codepoint], p.x_advance, p.x_offset, p.y_offset)
            for i, p in zip(b.glyph_infos, b.glyph_positions)]


def num(v):
    return ("%.2f" % v).rstrip("0").rstrip(".")


def word(text, size, x0, base, ls=-0.02):
    """Outlined text. Returns (path d, ink bbox xmin,ymin,xmax,ymax in svg coords)."""
    s = size / upem
    pen_x = 0.0
    parts = []
    bp = BoundsPen(gs)
    for g, adv, xo, yo in shape(text):
        t = (s, 0, 0, -s, x0 + (pen_x + xo) * s, base - yo * s)
        sp = SVGPathPen(gs, ntos=num)
        gs[g].draw(TransformPen(sp, t))
        parts.append(sp.getCommands())
        gs[g].draw(TransformPen(bp, t))
        pen_x += adv + ls * upem
    return " ".join(parts), bp.bounds


def asc_ratio():
    bp = BoundsPen(gs)
    gs["d"].draw(bp)
    return bp.bounds[3] / upem


ASC = asc_ratio()

# ---------- mark ----------
CELLS = [
    (25, 0, False),
    (12.5, 12.5, False), (25, 12.5, False), (37.5, 12.5, False),
    (0, 25, False), (12.5, 25, False), (25, 25, False), (37.5, 25, False), (50, 25, False),
    (0, 37.5, False), (12.5, 37.5, False), (25, 37.5, True), (37.5, 37.5, False), (50, 37.5, False),
]
MARK_W, MARK_H = 60.0, 47.5


def mark_group(cell, door, scale, tx, ty):
    rects = []
    for x, y, is_door in CELLS:
        fill = door if is_door else cell
        rects.append('<rect x="%s" y="%s" width="10" height="10" rx="2.2" fill="%s"/>' % (num(x), num(y), fill))
    return '<g transform="translate(%s %s) scale(%s)">%s</g>' % (num(tx), num(ty), num(scale), "".join(rects))


def svg_wrap(vb, body, title="Domata", extra=""):
    x, y, w, h = vb
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s %s %s %s" role="img" aria-label="%s"%s>'
            '<title>%s</title>%s</svg>\n') % (num(x), num(y), num(w), num(h), title, extra, title, body)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


# ---------- lockups ----------
def horizontal(cell, door, textc):
    size = 54.0
    asc = ASC * size
    cy = -asc / 2
    mtop = cy - MARK_H / 2
    d, bb = word("domata", size, MARK_W + 20, 0)
    top = min(mtop, -asc)
    bottom = max(cy + MARK_H / 2, 0)
    body = mark_group(cell, door, 1, 0, mtop) + '<path d="%s" fill="%s"/>' % (d, textc)
    return ([0, top, bb[2], bottom - top], body)


def stacked(cell, door, textc):
    size = 64.0
    scale = 168.75 / MARK_W
    mw, mh = MARK_W * scale, MARK_H * scale
    gap = 0.2075 * mw
    asc = ASC * size
    base = mh + gap + asc
    d0, bb0 = word("domata", size, 0, base)
    ink_w = bb0[2] - bb0[0]
    cw = max(mw, ink_w)
    x0 = (cw - ink_w) / 2 - bb0[0]
    d, bb = word("domata", size, x0, base)
    body = mark_group(cell, door, scale, (cw - mw) / 2, 0) + '<path d="%s" fill="%s"/>' % (d, textc)
    return ([0, 0, cw, base], body)


VARIANTS = {
    "color": (INK, GREEN, INK),
    "reversed": (WHITE, GREEN, WHITE),
    "mono-dark": (INK, INK, INK),
    "mono-white": (WHITE, WHITE, WHITE),
}

logo_dir = os.path.join(out_dir, "logo")
built = {}
for vname, (cell, door, textc) in VARIANTS.items():
    mname = "domata-mark" + ("" if vname == "color" else "-" + vname) + ".svg"
    write(os.path.join(logo_dir, mname),
          svg_wrap([0, 0, MARK_W, MARK_H], mark_group(cell, door, 1, 0, 0)))
    hv, hbody = horizontal(cell, door, textc)
    hname = "domata-lockup-horizontal" + ("" if vname == "color" else "-" + vname) + ".svg"
    write(os.path.join(logo_dir, hname), svg_wrap(hv, hbody))
    sv, sbody = stacked(cell, door, textc)
    sname = "domata-lockup-stacked" + ("" if vname == "color" else "-" + vname) + ".svg"
    write(os.path.join(logo_dir, sname), svg_wrap(sv, sbody))
    built[vname] = {"h": (hv, hbody), "s": (sv, sbody)}

# ---------- favicon (simplified 3x3, pixel aligned on a 16 grid) ----------
FAV_CELLS = [(6, 1, False), (1, 6, False), (6, 6, False), (11, 6, False),
             (1, 11, False), (6, 11, True), (11, 11, False)]


def fav_body(cell, door, bg=None, bg_r=3):
    out = []
    if bg:
        out.append('<rect width="16" height="16" rx="%s" fill="%s"/>' % (bg_r, bg))
    for x, y, d in FAV_CELLS:
        out.append('<rect x="%d" y="%d" width="4" height="4" rx="1" fill="%s"/>' % (x, y, door if d else cell))
    return "".join(out)


fav_adaptive = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><title>Domata</title>'
    '<style>.c{fill:%s}.d{fill:%s}@media (prefers-color-scheme:dark){.c{fill:%s}}</style>' % (INK, GREEN, WHITE)
)
for x, y, d in FAV_CELLS:
    fav_adaptive += '<rect class="%s" x="%d" y="%d" width="4" height="4" rx="1"/>' % ("d" if d else "c", x, y)
fav_adaptive += "</svg>\n"
fav_dir = os.path.join(out_dir, "favicon")
write(os.path.join(fav_dir, "favicon.svg"), fav_adaptive)

# svg sources used only for rasterizing (written to a build dir, rendered by node)
build = os.path.join(out_dir, "_build")
write(os.path.join(build, "fav-tile.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">%s</svg>' % fav_body(INK, GREEN, GROUND, 3))


def icon_svg(size, markw_frac, bg, rounded):
    mw = size * markw_frac
    sc = mw / MARK_W
    mh = MARK_H * sc
    tx, ty = (size - mw) / 2, (size - mh) / 2
    rx = ' rx="%s"' % num(size * 0.22) if rounded else ""
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d"><rect width="%d" height="%d"%s fill="%s"/>%s</svg>'
            % (size, size, size, size, rx, bg, mark_group(WHITE, GREEN, sc, tx, ty)))


write(os.path.join(build, "apple-touch-icon.svg"), icon_svg(180, 0.60, INK, False))
write(os.path.join(build, "icon-192.svg"), icon_svg(192, 0.60, INK, True))
write(os.path.join(build, "icon-512.svg"), icon_svg(512, 0.60, INK, True))
write(os.path.join(build, "icon-maskable-512.svg"), icon_svg(512, 0.50, INK, False))

# ---------- OG image ----------
sv, sbody = built["color"]["s"]
H = 300.0
sc = H / sv[3]
W_ = sv[2] * sc
og = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="%s"/>'
      '<svg x="%s" y="%s" width="%s" height="%s" viewBox="0 0 %s %s">%s</svg></svg>'
      % (GROUND, num((1200 - W_) / 2), num((630 - H) / 2), num(W_), num(H), num(sv[2]), num(sv[3]), sbody))
write(os.path.join(build, "og-image.svg"), og)

# ---------- preview sheet ----------
def nest(vb, body, x, y, h):
    s = h / vb[3]
    return '<svg x="%s" y="%s" width="%s" height="%s" viewBox="%s %s %s %s">%s</svg>' % (
        num(x), num(y), num(vb[2] * s), num(h), num(vb[0]), num(vb[1]), num(vb[2]), num(vb[3]), body)


hv, hb_ = built["color"]["h"]
sv, sb_ = built["color"]["s"]
hvr, hbr = built["reversed"]["h"]
svr, sbr = built["reversed"]["s"]
sheet = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">',
         '<rect width="800" height="900" fill="%s"/><rect x="800" width="800" height="900" fill="%s"/>' % (GROUND, INK)]
sheet.append(nest(hv, hb_, 120, 150, 90))
sheet.append(nest(sv, sb_, 270, 330, 300))
sheet.append(nest(hvr, hbr, 920, 150, 90))
sheet.append(nest(svr, sbr, 1070, 330, 300))
# favicon sizes + app icon along the bottom
sheet.append('<rect x="120" y="740" width="64" height="64" fill="none"/>')
for i, px in enumerate([16, 32, 64]):
    sheet.append('<svg x="%d" y="%d" width="%d" height="%d" viewBox="0 0 16 16">%s</svg>' % (
        120 + [0, 40, 100][i], 790 - px, px, px, fav_body(INK, GREEN, GROUND, 3)))
sheet.append('<svg x="1000" y="740" width="64" height="64" viewBox="0 0 16 16">%s</svg>' % fav_body(WHITE, GREEN, INK, 3))
sheet.append("</svg>")
write(os.path.join(build, "preview.svg"), "".join(sheet))

print("ASC ratio", round(ASC, 4))
print("horizontal viewBox", [round(v, 1) for v in built["color"]["h"][0]])
print("stacked viewBox", [round(v, 1) for v in built["color"]["s"][0]])
