"""Corta la secuencia 17-7 (4×2) en 8 cuadros alineados por el pie de atrás (zapatilla azul)."""
import sys
import numpy as np
from PIL import Image
src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
H, W, _ = a.shape
cols, rows = 4, 2
cw, rh = W / cols, H / rows
blue = (a[:, :, 2] > 150) & (a[:, :, 0] < 90) & (a[:, :, 1] < 130)
frames = []
for r in range(rows):
    for c in range(cols):
        x0, x1 = int(round(c * cw)), int(round((c + 1) * cw))
        y0, y1 = int(round(r * rh)), int(round((r + 1) * rh))
        cell = blue[y0:y1, x0:x1]
        xs = np.where(cell.any(axis=0))[0]
        left = x0 + xs.min()  # punta de la zapatilla de atrás
        ys = np.where(cell.any(axis=1))[0]
        bottom = y0 + ys.max()  # suela más baja
        frames.append((left, bottom))
# Recorte común: desde 25 px antes de la zapatilla de atrás, ancho fijo.
w, h, below = 330, 300, 40  # alto fijo: la suela queda siempre a la misma altura
for i, (left, bottom) in enumerate(frames):
    x = max(0, left - 25)
    top = bottom + below - h
    crop = im.crop((x, top, x + w, bottom + below))
    crop.save(f'{outdir}/{i + 1}.jpg', quality=82, optimize=True)
    print(i + 1, left, crop.size)
