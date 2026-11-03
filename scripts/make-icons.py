"""Genera los íconos PNG de la app (mismo diseño que public/icon.svg). Uso: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

BG = (27, 29, 32)
ACCENT = (92, 184, 160)


def dumbbell(size: int, scale: float, rounded: bool) -> Image.Image:
    # Se dibuja al doble y se reduce para bordes suaves.
    s = size * 2
    im = Image.new('RGB' if not rounded else 'RGBA', (s, s), BG if not rounded else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=BG)
    u = s / 512 * scale
    c = s / 2
    w = max(2, int(34 * u))

    def line(x1, y1, x2, y2):
        p = [(c + (x1 - 256) * u, c + (y1 - 256) * u), (c + (x2 - 256) * u, c + (y2 - 256) * u)]
        d.line(p, fill=ACCENT, width=w)
        for x, y in p:
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=ACCENT)

    for x1, y1, x2, y2 in [(168, 168, 168, 344), (344, 168, 344, 344), (112, 212, 112, 300), (400, 212, 400, 300), (168, 256, 344, 256)]:
        line(x1, y1, x2, y2)
    return im.resize((size, size), Image.LANCZOS)


dumbbell(192, 1.0, True).save('public/icons/icon-192.png', optimize=True)
dumbbell(512, 1.0, True).save('public/icons/icon-512.png', optimize=True)
# «maskable»: fondo completo y el dibujo dentro de la zona segura (Android recorta el ícono).
dumbbell(512, 0.72, False).save('public/icons/maskable-512.png', optimize=True)
dumbbell(180, 0.8, False).save('public/icons/apple-touch-icon.png', optimize=True)
print('ok')
