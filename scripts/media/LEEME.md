# Scripts de medios (Python 3 + Pillow + NumPy)

Preparan las secuencias de fotos de `public/media/ejercito/` a partir del manual ATP 7-22.02
(`https://armypubs.army.mil/epubs/DR_pubs/DR_a/ARN45013-ATP_7-22.02-001-WEB-4.pdf`).

1. Extraer la imagen de la página: `pdfimages -j -f <pág> -l <pág> atp.pdf raw/pX`
2. Cortar y alinear:
   - `ankle.py`  — figura 17-7 (grilla 4×2, alinea por la zapatilla de atrás).
   - `sld.py`    — figura 5-17 (figuras sueltas: separa cada una y alinea por el pie de apoyo; usar cuadros 1–11).
   - `bench.py`  — figura 14-6 (alinea por los dos parantes del rack; el cuadro 1 tiene otra escala y no se usa).
   - `grid.py`   — grillas con fondo blanco (`ancla`, p. ej. 14-15) o fotos en celdas (`celdas`).
   - `clean.py`  — blanquea restos de cuadros vecinos.
3. Revisar a ojo cada secuencia (hoja de contacto y superposición de cuadros) antes de sumarla a `src/data/media.ts`.

`commons.py` consulta la API de Wikimedia Commons (licencia, autor, URL) con identificación y pausas:
Commons limita mucho las consultas (429) y las miniaturas salen de `thumb.wikimedia.org`.
