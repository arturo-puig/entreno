"""Blanquea lo que no está conectado a la escena central (restos de cuadros vecinos)."""
import sys
import numpy as np
from PIL import Image
for path in sys.argv[1:]:
    im = Image.open(path).convert('RGB'); a = np.asarray(im).astype(int)
    h, w, _ = a.shape
    fg = a.min(axis=2) < 230
    lab = np.zeros((h, w), int); n = 0; keep = set()
    for y in range(h):
        for x in range(w):
            if fg[y, x] and not lab[y, x]:
                n += 1; st = [(y, x)]; lab[y, x] = n; pts = []
                while st:
                    cy, cx = st.pop(); pts.append((cy, cx))
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n; st.append((ny, nx))
                xs = [p[1] for p in pts]
                central = min(xs) < w * 0.75 and max(xs) > w * 0.25
                if len(pts) > 1500 or (central and len(pts) > 40):
                    keep.add(n)
    out = a.copy()
    drop = fg & ~np.isin(lab, list(keep))
    out[drop] = 255
    Image.fromarray(out.astype('uint8')).save(path, quality=82)
    print(path, 'componentes', n, 'conservadas', len(keep))
