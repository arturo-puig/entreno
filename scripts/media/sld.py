"""Separa las figuras de la secuencia 5-17 y las alinea por el pie de apoyo."""
import sys
import numpy as np
from PIL import Image
sys.setrecursionlimit(10000)
src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(int)
H, W, _ = a.shape
fg = (a.min(axis=2) < 225)
fg[:6, :] = fg[-6:, :] = False; fg[:, :6] = fg[:, -6:] = False  # marco
# Bandas horizontales separadas por filas vacías
rows_any = fg.any(axis=1)
bands, inb = [], False
for y, v in enumerate(rows_any):
    if v and not inb: start, inb = y, True
    if not v and inb:
        if y - start > 60: bands.append((start, y))
        inb = False
# Componentes conexas por banda (etiquetado simple en una grilla reducida)
def components(mask):
    h, w = mask.shape
    lab = np.zeros((h, w), int); n = 0
    for y in range(h):
        for x in range(w):
            if mask[y, x] and not lab[y, x]:
                n += 1; stack = [(y, x)]; lab[y, x] = n
                while stack:
                    cy, cx = stack.pop()
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n; stack.append((ny, nx))
    return lab, n
figs = []
S = 2  # reducción para etiquetar
for (y0, y1) in bands:
    m = fg[y0:y1]
    small = m[::S, ::S]
    # engordar un poco para unir partes separadas (dedos, cordones)
    d = small.copy()
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            d |= np.roll(np.roll(small, dy, 0), dx, 1)
    lab, n = components(d)
    boxes = []
    for i in range(1, n + 1):
        ys, xs = np.where(lab == i)
        if len(ys) < 150: continue
        boxes.append((xs.min() * S, ys.min() * S + y0, xs.max() * S + S, ys.max() * S + S + y0, i))
    boxes.sort()
    for (bx0, by0, bx1, by1, i) in boxes:
        mask = np.zeros((H, W), bool)
        sub = (lab == i).repeat(S, 0).repeat(S, 1)[: y1 - y0, :W]
        mask[y0:y1, : sub.shape[1]] = sub & m[:, : sub.shape[1]]
        pieces = [(bx0, bx1)]
        # Dos figuras que se tocan: se corta por la columna con menos píxeles.
        if bx1 - bx0 > 290:
            cols = mask[:, bx0:bx1].sum(axis=0)
            a0, a1 = int((bx1 - bx0) * 0.3), int((bx1 - bx0) * 0.7)
            cut = bx0 + a0 + int(np.argmin(cols[a0:a1]))
            pieces = [(bx0, cut), (cut, bx1)]
        for (px0, px1) in pieces:
            pm = np.zeros_like(mask); pm[:, px0:px1] = mask[:, px0:px1]
            ys, xs = np.where(pm)
            figs.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, pm))
print('bandas', bands, 'figuras', len(figs))
# Pie de apoyo: píxeles a menos de 14 px de la parte más baja
info = []
for (bx0, by0, bx1, by1, mask) in figs:
    ys, xs = np.where(mask)
    bottom = ys.max()
    foot = xs[ys >= bottom - 14]
    info.append((int(foot.mean()), int(bottom)))
# Lienzo común
left = max(fx - bx0 for (bx0, _, _, _, _), (fx, _) in zip(figs, info))
right = max(bx1 - fx for (_, _, bx1, _, _), (fx, _) in zip(figs, info))
up = max(fb - by0 for (_, by0, _, _, _), (_, fb) in zip(figs, info))
pad = 12
cw, ch = left + right + 2 * pad, up + 2 * pad
for k, ((bx0, by0, bx1, by1, mask), (fx, fb)) in enumerate(zip(figs, info)):
    canvas = Image.new('RGB', (cw, ch), 'white')
    piece = im.crop((bx0, by0, bx1, by1))
    pm = Image.fromarray((mask[by0:by1, bx0:bx1] * 255).astype('uint8'))
    canvas.paste(piece, (pad + left - (fx - bx0), pad + up - (fb - by0)), pm)
    canvas.save(f'{outdir}/{k + 1}.png')
print('lienzo', cw, ch)
