"""Corta una secuencia en grilla (cols×filas) y alinea los cuadros.
modo 'ancla': fondo blanco; alinea por el centro y la base de lo más bajo del cuadro (pies o soporte).
modo 'celdas': fotos separadas por líneas claras; recorta cada celda por sus divisiones."""
import sys
import numpy as np
from PIL import Image
src, outdir, cols, rows, mode = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
H, W, _ = a.shape
inset = 5
if mode == 'celdas':
    bright = a.mean(axis=2) > 235
    def runs(profile, n, size):
        # separadores: franjas casi blancas; se eligen las n-1 más cercanas a las divisiones ideales
        seps = []
        for k in range(1, n):
            ideal = int(size * k / n)
            window = range(max(0, ideal - 25), min(size, ideal + 25))
            best = max(window, key=lambda i: profile[i])
            seps.append(best)
        return [inset] + seps + [size - inset]
    colprof = bright.mean(axis=0); rowprof = bright.mean(axis=1)
    xs, ys = runs(colprof, cols, W), runs(rowprof, rows, H)
    k = 0
    cells = []
    for r in range(rows):
        for c in range(cols):
            cells.append((xs[c] + 6, ys[r] + 6, xs[c + 1] - 6, ys[r + 1] - 6))
    w = min(x1 - x0 for x0, y0, x1, y1 in cells); h = min(y1 - y0 for x0, y0, x1, y1 in cells)
    for i, (x0, y0, x1, y1) in enumerate(cells):
        im.crop((x0, y0, x0 + w, y0 + h)).save(f'{outdir}/{i + 1}.jpg', quality=82)
    print('celdas', w, h)
else:
    fg = a.min(axis=2) < 200
    fg[:inset, :] = fg[-inset:, :] = False; fg[:, :inset] = fg[:, -inset:] = False
    cw, rh = W / cols, H / rows
    anchors = []
    for r in range(rows):
        for c in range(cols):
            x0, x1 = int(c * cw), int((c + 1) * cw); y0, y1 = int(r * rh), int((r + 1) * rh)
            cell = fg[y0:y1, x0:x1]
            ys_, xs_ = np.where(cell)
            bottom = ys_.max()
            band = xs_[ys_ >= bottom - 8]
            anchors.append((x0 + int((band.min() + band.max()) / 2), y0 + bottom, x0, y0, x1, y1))
    # Lienzo: lo máximo que entra alrededor del ancla dentro de cada celda
    left = min(ax - x0 for ax, ay, x0, y0, x1, y1 in anchors)
    right = min(x1 - ax for ax, ay, x0, y0, x1, y1 in anchors)
    up = min(ay - y0 for ax, ay, x0, y0, x1, y1 in anchors)
    down = min(y1 - ay for ax, ay, x0, y0, x1, y1 in anchors)
    down = min(down, 14)
    for i, (ax, ay, *_rest) in enumerate(anchors):
        im.crop((ax - left, ay - up, ax + right, ay + down)).save(f'{outdir}/{i + 1}.jpg', quality=82)
    print('ancla', left + right, up + down)
