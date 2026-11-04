"""Imágenes generadas con IA a pedido del usuario (ChatGPT/Gemini), revisadas a ojo una por una.

Cada original trae dos paneles (inicio | final) separados por una línea vertical.
- Pallof press: los paneles coinciden (máquina y pies a ±2 px) → dos cuadros alineados que se animan.
- Sentadilla búlgara: el pie de adelante se corre ~43 px entre paneles → NO se anima (parecería que
  el pie se desliza); se arma una sola imagen con los dos paneles juntos, que se muestra fija.

Uso: python3 -I scripts/media/ia.py <pallof.jpg> <bulgara.jpg> <carpeta de salida>
"""
import sys

import numpy as np
from PIL import Image

LEVELS = 32  # tonos de gris: el dibujo es de líneas con sombreado suave


def load(path):
    im = np.asarray(Image.open(path).convert('L')).astype(np.int16)
    im[im > 240] = 255  # ruido de la compresión JPEG en el fondo blanco
    return im


def bbox(p, thr=240):
    ys, xs = np.where(p < thr)
    return xs.min(), xs.max() + 1, ys.min(), ys.max() + 1


def save(arr, path):
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'L')
    img = img.quantize(colors=LEVELS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    img.save(path, optimize=True)
    print(path, img.size)


def split(im):
    """Separa los paneles en la línea divisoria (la columna más oscura cerca del centro)."""
    h, w = im.shape
    c = w // 2
    cols = im[:, c - 40 : c + 40].mean(axis=0)
    div = c - 40 + int(np.argmin(cols))
    return im[:, : div - 1], im[:, div + 2 :]


def best_shift(a, b, region, rng=8):
    """Desplazamiento (dx, dy) de b que mejor coincide con a en una zona fija (máquina, banco)."""
    x0, x1, y0, y1 = region
    ref = a[y0:y1, x0:x1].astype(float)
    best = None
    for dx in range(-rng, rng + 1):
        for dy in range(-rng, rng + 1):
            if x0 + dx < 0 or y0 + dy < 0:
                continue
            cand = b[y0 + dy : y1 + dy, x0 + dx : x1 + dx].astype(float)
            if cand.shape != ref.shape:
                continue
            e = np.abs(ref - cand).mean()
            if best is None or e < best[0]:
                best = (e, dx, dy)
    return best


def pallof(path, out):
    left, right = split(load(path))
    e, dx, dy = best_shift(left, right, (0, 200, 0, left.shape[0] - 60))
    print('pallof: desplazamiento del panel derecho', dx, dy, 'error', round(e, 2))
    h = min(left.shape[0], right.shape[0]) - abs(dy)
    w = min(left.shape[1], right.shape[1]) - abs(dx)
    a = left[max(0, -dy) : max(0, -dy) + h, max(0, -dx) : max(0, -dx) + w]
    b = right[max(0, dy) : max(0, dy) + h, max(0, dx) : max(0, dx) + w]
    ax0, ax1, ay0, ay1 = bbox(a)
    bx0, bx1, by0, by1 = bbox(b)
    m = 16
    x0, x1 = max(0, min(ax0, bx0) - m), min(w, max(ax1, bx1) + m)
    y0, y1 = max(0, min(ay0, by0) - m), min(h, max(ay1, by1) + m)
    save(a[y0:y1, x0:x1], f'{out}/pallof-press-a.png')
    save(b[y0:y1, x0:x1], f'{out}/pallof-press-b.png')


def bulgara(path, out):
    left, right = split(load(path))
    m = 16
    parts = []
    for p in (left, right):
        x0, x1, y0, y1 = bbox(p)
        parts.append((p, max(0, x0 - m), min(p.shape[1], x1 + m)))
    # Misma franja vertical en los dos paneles (el piso queda a la misma altura).
    y0 = max(0, min(bbox(left)[2], bbox(right)[2]) - m)
    y1 = min(left.shape[0], max(bbox(left)[3], bbox(right)[3]) + m)
    gap = 24
    width = sum(x1 - x0 for _, x0, x1 in parts) + gap
    canvas = np.full((y1 - y0, width), 255, dtype=np.int16)
    x = 0
    for i, (p, x0, x1) in enumerate(parts):
        canvas[:, x : x + (x1 - x0)] = p[y0:y1, x0:x1]
        x += x1 - x0
        if i == 0:
            canvas[m : y1 - y0 - m, x + gap // 2 - 1 : x + gap // 2 + 1] = 200  # línea divisoria gris clara
            x += gap
    save(canvas, f'{out}/sentadilla-bulgara.png')


if __name__ == '__main__':
    pallof(sys.argv[1], sys.argv[3])
    bulgara(sys.argv[2], sys.argv[3])
