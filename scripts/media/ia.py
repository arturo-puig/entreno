"""Imágenes generadas con IA a pedido del usuario (ChatGPT/Gemini), revisadas a ojo una por una.

Cada original trae dos paneles (inicio | final) separados por una línea vertical.
- Pallof press: los paneles coinciden (máquina y pies a ±2 px) → dos cuadros alineados que se animan.
- Sentadilla búlgara: el pie de adelante se corre ~43 px entre paneles → NO se anima (parecería que
  el pie se desliza); se arma una sola imagen con los dos paneles juntos, que se muestra fija.

- Sentadilla isométrica contra la pared: una sola posición → se recorta y se muestra fija.
- Rueda abdominal: la colchoneta cambia de largo entre paneles → fija; como cada panel es muy ancho,
  van uno arriba del otro (se ven el doble de grandes en el celular).
- Hip thrust en máquina (imagen fotorrealista, con títulos arriba): se recorta debajo de los títulos;
  máquina y fondo coinciden entre paneles → dos cuadros en color (JPEG) que se animan.

Uso:
  python3 -I scripts/media/ia.py pallof <pallof.jpg> <carpeta de salida>
  python3 -I scripts/media/ia.py juntos <imagen.jpg> <carpeta de salida> <nombre>
  python3 -I scripts/media/ia.py apiladas <imagen.jpg> <carpeta de salida> <nombre>
  python3 -I scripts/media/ia.py unica <imagen.jpg> <carpeta de salida> <nombre>
  python3 -I scripts/media/ia.py foto <imagen.jpg> <carpeta de salida> <nombre> <x0> <y0> <x1> <y1>
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
    """Separa los paneles en la línea divisoria: en el tercio central, la columna con más filas no blancas
    (la línea cruza casi toda la altura; el dibujo no). No siempre está en el centro exacto."""
    h, w = im.shape
    x0 = w // 3
    cover = (im[:, x0 : 2 * w // 3] < 235).mean(axis=0)
    div = x0 + int(np.argmax(cover))
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


def juntos(path, out, name):
    """Dos paneles que no coinciden: una sola imagen con los dos juntos (se muestra fija)."""
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
    save(canvas, f'{out}/{name}.png')


def apiladas(path, out, name):
    """Dos paneles anchos que no coinciden: uno arriba del otro, alineados a la izquierda (así pies y
    rodillas, que no se mueven, quedan en la misma vertical), en una sola imagen fija."""
    left, right = split(load(path))
    m, gap = 16, 28
    crops = []
    for p in (left, right):
        x0, x1, y0, y1 = bbox(p)
        crops.append(p[max(0, y0 - m) : y1 + m, max(0, x0 - m) : x1 + m])
    width = max(c.shape[1] for c in crops)
    canvas = np.full((sum(c.shape[0] for c in crops) + gap, width), 255, dtype=np.int16)
    y = 0
    for i, c in enumerate(crops):
        canvas[y : y + c.shape[0], : c.shape[1]] = c
        y += c.shape[0]
        if i == 0:
            canvas[y + gap // 2 - 1 : y + gap // 2 + 1, m : width - m] = 200  # línea divisoria gris clara
            y += gap
    save(canvas, f'{out}/{name}.png')


def unica(path, out, name):
    """Una sola posición: recorte al contenido con margen."""
    im = load(path)
    x0, x1, y0, y1 = bbox(im)
    m = 16
    save(im[max(0, y0 - m) : y1 + m, max(0, x0 - m) : x1 + m], f'{out}/{name}.png')


def foto(path, out, name, x0, y0, x1, y1):
    """Imagen fotorrealista en color: recorta la misma zona de cada panel (sin los títulos) y alinea el
    panel derecho con el izquierdo por la zona fija (máquina y fondo)."""
    x0, y0, x1, y1 = (int(v) for v in (x0, y0, x1, y1))
    rgb = np.asarray(Image.open(path).convert('RGB'))
    gray = rgb.mean(axis=2)
    h, w = gray.shape
    c = w // 2
    div = c - 40 + int(np.argmin(gray[:, c - 40 : c + 40].mean(axis=0)))
    lg, rg = gray[:, : div - 3], gray[:, div + 4 :]
    lc, rc = rgb[:, : div - 3], rgb[:, div + 4 :]
    # Se alinea por la franja de abajo del recorte (base de la máquina y piso), que no se mueve.
    e, dx, dy = best_shift(lg, rg, (x0, x1, y1 - (y1 - y0) // 3, y1), rng=12)
    print(name, ': desplazamiento del panel derecho', dx, dy, 'error', round(e, 2))
    for img, sx, sy, suffix in ((lc, 0, 0, 'a'), (rc, dx, dy, 'b')):
        crop = img[y0 + sy : y1 + sy, x0 + sx : x1 + sx]
        Image.fromarray(crop).save(f'{out}/{name}-{suffix}.jpg', quality=82, optimize=True, progressive=True)
        print(f'{out}/{name}-{suffix}.jpg', crop.shape[1], crop.shape[0])


if __name__ == '__main__':
    cmd, *args = sys.argv[1:]
    {'pallof': pallof, 'juntos': juntos, 'apiladas': apiladas, 'unica': unica, 'foto': foto}[cmd](*args)
