"""Draws the Pawventory app icons: white paw on a pink-to-lavender gradient.
The white paw stays clear when iOS shows icons in dark or tinted mode.
Run: python3 tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"
TOP = (248, 195, 215)      # pastel pink
BOTTOM = (205, 185, 242)   # pastel lavender
PAW = (255, 255, 255)
SHADOW = (122, 74, 130, 90)  # soft plum shadow so the paw reads on light pink
SS = 4  # supersampling for smooth edges

TOES = [(5.5, 10, 2, 2.5), (9.5, 5.8, 2, 2.6), (14.5, 5.8, 2, 2.6), (18.5, 10, 2, 2.5)]


def gradient(size):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    return img


def paw_mask(size, cx, cy, scale):
    """Paw in the same 24x24 geometry as the in-app SVG, centred on (cx, cy)."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    pt = lambda x, y: (cx + (x - 12) * scale, cy + (y - 13) * scale)
    for x, y, rx, ry in TOES:
        px, py = pt(x, y)
        d.ellipse([px - rx * scale, py - ry * scale, px + rx * scale, py + ry * scale], fill=255)
    px, py = pt(12, 16.6)
    d.ellipse([px - 5.4 * scale, py - 4.4 * scale, px + 5.4 * scale, py + 3.9 * scale], fill=255)
    return mask


def icon(size, paw_ratio, name):
    big = size * SS
    img = gradient(big).convert("RGBA")
    scale = big * paw_ratio / 24
    mask = paw_mask(big, big / 2, big / 2, scale)
    shadow = Image.new("RGBA", (big, big), SHADOW)
    offset = mask.transform(mask.size, Image.AFFINE, (1, 0, 0, 0, 1, -big * 0.012)).filter(ImageFilter.GaussianBlur(big * 0.02))
    img.paste(shadow, (0, 0), offset)
    img.paste(Image.new("RGBA", (big, big), PAW + (255,)), (0, 0), mask)
    img.convert("RGB").resize((size, size), Image.LANCZOS).save(OUT / name)


icon(192, 0.62, "icon-192.png")
icon(512, 0.62, "icon-512.png")
icon(180, 0.62, "apple-touch-icon.png")
icon(512, 0.46, "icon-maskable-512.png")  # inside the 80% safe zone

(OUT / "favicon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#F8C3D7"/><stop offset="1" stop-color="#CDB9F2"/></linearGradient></defs>'
    '<rect width="24" height="24" rx="6" fill="url(#g)"/>'
    '<g fill="#FFFFFF" transform="translate(3.4 3.2) scale(.72)">'
    '<ellipse cx="5.5" cy="10" rx="2" ry="2.5"/><ellipse cx="9.5" cy="5.8" rx="2" ry="2.6"/>'
    '<ellipse cx="14.5" cy="5.8" rx="2" ry="2.6"/><ellipse cx="18.5" cy="10" rx="2" ry="2.5"/>'
    '<path d="M12 12.2c-2.7 0-5.6 3.3-5.6 5.8 0 1.6 1.2 2.5 2.6 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6'
    'c1.4 0 2.6-.9 2.6-2.5 0-2.5-2.9-5.8-5.6-5.8z"/></g></svg>\n'
)
print("icons written to", OUT)
