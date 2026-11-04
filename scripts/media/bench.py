"""Press de banca 14-6: alinea por los dos parantes del rack (columnas más oscuras y altas)."""
import sys
import numpy as np
from PIL import Image
src, outdir = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(int).copy()
H, W, _ = a.shape
a[:12, :] = 255; a[-12:, :] = 255; a[:, :12] = 255; a[:, -12:] = 255  # sin el marco del manual
im = Image.fromarray(a.astype('uint8'))
dark = a.max(axis=2) < 90
dark[:5, :] = dark[-5:, :] = False; dark[:, :5] = dark[:, -5:] = False
cols, rows = 4, 2
rh = H / rows
# parantes: columnas con muchos píxeles oscuros en la fila
anchors = []
cw = W / cols
for r in range(rows):
    y0, y1 = int(r * rh), int((r + 1) * rh)
    for c in range(cols):
        x0, x1 = int(c * cw), int((c + 1) * cw)
        prof = dark[y0:y1, x0:x1].sum(axis=0).astype(float)
        sm = np.convolve(prof, np.ones(5) / 5, mode='same')
        # los dos parantes están a ~102 px: el par que más pixeles oscuros suma a esa distancia
        best = max(((sm[i] + sm[j], i, j) for i in range(len(sm)) for j in range(i + 96, min(len(sm), i + 109))))
        l, rr = x0 + best[1], x0 + best[2]
        cx = (l + rr) // 2
        ys = np.where(dark[y0:y1, max(0, cx - 60):cx + 60].any(axis=1))[0]
        anchors.append((cx, y0 + ys.max(), rr - l))
print([(x, y, d) for x, y, d in anchors])
half, up, down = 122, 192, 6
for i, (cx, by, _) in enumerate(anchors):
    crop = Image.new('RGB', (2 * half, up + down), 'white')
    box = (cx - half, by - up, cx + half, by + down)
    piece = im.crop(box)
    crop.paste(piece, (0, 0))
    crop.save(f'{outdir}/{i + 1}.jpg', quality=82)
