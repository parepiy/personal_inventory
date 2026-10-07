"""Draws the Pawventory app icons (pastel pink tile, plum paw). Run: python3 tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
BG = (248, 195, 215)
INK = (59, 45, 74)
SS = 4  # supersampling for smooth edges


def paw(draw, cx, cy, scale):
    """Paw in the same 24x24 geometry as the in-app SVG, centred on (cx, cy)."""
    def pt(x, y):
        return cx + (x - 12) * scale, cy + (y - 13) * scale

    for x, y, rx, ry in [(5.5, 10, 2, 2.5), (9.5, 5.8, 2, 2.6), (14.5, 5.8, 2, 2.6), (18.5, 10, 2, 2.5)]:
        (px, py) = pt(x, y)
        draw.ellipse([px - rx * scale, py - ry * scale, px + rx * scale, py + ry * scale], fill=INK)
    # main pad: rounded blob approximated by an ellipse plus a wider base
    (px, py) = pt(12, 16.6)
    draw.ellipse([px - 5.4 * scale, py - 4.4 * scale, px + 5.4 * scale, py + 3.9 * scale], fill=INK)


def icon(size, paw_ratio, name, rounded=False):
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0) if rounded else BG + (255,))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 0.22, fill=BG)
    paw(d, big / 2, big / 2, big * paw_ratio / 24)
    img.resize((size, size), Image.LANCZOS).save(OUT / name)


icon(192, 0.62, "icon-192.png")
icon(512, 0.62, "icon-512.png")
icon(180, 0.62, "apple-touch-icon.png")
icon(512, 0.46, "icon-maskable-512.png")  # inside the 80% safe zone

(OUT / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<rect width="24" height="24" rx="6" fill="#F8C3D7"/>'
    '<g fill="#3B2D4A" transform="translate(3.4 3.2) scale(.72)">'
    '<ellipse cx="5.5" cy="10" rx="2" ry="2.5"/><ellipse cx="9.5" cy="5.8" rx="2" ry="2.6"/>'
    '<ellipse cx="14.5" cy="5.8" rx="2" ry="2.6"/><ellipse cx="18.5" cy="10" rx="2" ry="2.5"/>'
    '<path d="M12 12.2c-2.7 0-5.6 3.3-5.6 5.8 0 1.6 1.2 2.5 2.6 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6'
    'c1.4 0 2.6-.9 2.6-2.5 0-2.5-2.9-5.8-5.6-5.8z"/></g></svg>\n'
)
print("icons written to", OUT)
