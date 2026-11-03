import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { niceTicks } from '../domain/stats';

// Gráficos en SVG propio: marcas finas, ejes discretos, un solo eje Y, toque para ver el dato.
// El texto usa colores de texto; solo las marcas llevan el color de la serie.

export const SERIES_ACCENT = 'var(--accent)';
/** Gris apagado para el dato secundario (validado contra el acento: se distinguen también con daltonismo). */
export const SERIES_MUTED = '#6b7179';

function useWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function Tooltip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const pct = Math.min(85, Math.max(15, (x / width) * 100));
  return (
    <div className="chart-tip" style={{ left: `${pct}%` }} role="status">
      {children}
    </div>
  );
}

// ——— Columnas ———

export interface ColumnDatum {
  key: string;
  /** Etiqueta corta del eje X. */
  label: string;
  value: number;
  /** Texto del detalle al tocar (y para lectores de pantalla). */
  detail: string;
}

export function ColumnChart({ data, ariaLabel, height = 170, labelLast = true }: { data: ColumnDatum[]; ariaLabel: string; height?: number; labelLast?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [sel, setSel] = useState<number | null>(null);
  const m = { l: 26, r: 6, t: 20, b: 22 };
  const plotW = width - m.l - m.r;
  const plotH = height - m.t - m.b;
  const ticks = niceTicks(0, Math.max(1, ...data.map((d) => d.value)), 3);
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => m.t + plotH - (v / yMax) * plotH;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.6);
  const base = m.t + plotH;
  // Si las fechas no entran lado a lado, se muestra una sí y una no (siempre la última).
  const every = band < 44 ? 2 : 1;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={m.l - 6} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {fmt.format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = m.l + i * band + (band - barW) / 2;
          const top = y(d.value);
          const h = base - top;
          const r = Math.min(4, h);
          return (
            <g key={d.key}>
              {d.value > 0 && (
                <path
                  className={`chart-bar${sel === i ? ' is-selected' : ''}`}
                  d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`}
                />
              )}
              {labelLast && i === data.length - 1 && (
                <text x={x + barW / 2} y={top - 6} className="chart-value" textAnchor="middle">
                  {fmt.format(d.value)}
                </text>
              )}
              {i % every === (data.length - 1) % every && (
                <text x={x + barW / 2} y={height - 6} className="chart-axis" textAnchor="middle">
                  {d.label}
                </text>
              )}
              {/* Zona táctil: toda la franja, más grande que la barra. */}
              <rect
                x={m.l + i * band}
                y={m.t}
                width={band}
                height={plotH}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={d.detail}
                onClick={() => setSel(i)}
                onFocus={() => setSel(i)}
                onBlur={() => setSel((cur) => (cur === i ? null : cur))}
              />
            </g>
          );
        })}
      </svg>
      {sel !== null && data[sel] && (
        <Tooltip x={m.l + sel * band + band / 2} width={width}>
          {data[sel].detail}
        </Tooltip>
      )}
    </div>
  );
}

// ——— Líneas y puntos ———

export interface LinePoint {
  /** Fecha en milisegundos. */
  x: number;
  y: number;
  label: string;
}

export interface LineSeries {
  name: string;
  points: LinePoint[];
  style: 'line' | 'dots';
  color: string;
}

export function LineChart(props: {
  series: LineSeries[];
  ariaLabel: string;
  height?: number;
  formatX: (ms: number) => string;
  /** Valor al final de la serie principal (la primera de tipo línea). */
  endLabel?: (v: number) => string;
}) {
  const { series, formatX } = props;
  const height = props.height ?? 190;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [selX, setSelX] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return null;

  const m = { l: 34, r: props.endLabel ? 44 : 10, t: 12, b: 22 };
  const plotW = width - m.l - m.r;
  const plotH = height - m.t - m.b;
  let xMin = Math.min(...all.map((p) => p.x));
  let xMax = Math.max(...all.map((p) => p.x));
  if (xMin === xMax) {
    xMin -= 3.5 * 86_400_000;
    xMax += 3.5 * 86_400_000;
  }
  const ticks = niceTicks(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)), 4);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const sx = (v: number) => m.l + ((v - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number) => m.t + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const main = series.find((s) => s.style === 'line' && s.points.length > 0);

  const nearest = (px: number) => xs.reduce((best, v) => (Math.abs(sx(v) - px) < Math.abs(sx(best) - px) ? v : best), xs[0]);
  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    setSelX(nearest(e.clientX - rect.left));
  };
  const onKey = (e: KeyboardEvent<SVGRectElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = selX === null ? xs.length - 1 : xs.indexOf(selX) + (e.key === 'ArrowRight' ? 1 : -1);
    setSelX(xs[Math.max(0, Math.min(xs.length - 1, i))]);
  };
  // Para cada serie, el punto más cercano a la fecha elegida (las semanales caen a pocos días de las diarias).
  const readout =
    selX === null
      ? []
      : series.flatMap((s) => {
          const p = s.points.reduce<LinePoint | undefined>((b, q) => (!b || Math.abs(q.x - selX) < Math.abs(b.x - selX) ? q : b), undefined);
          return p && Math.abs(p.x - selX) <= 4 * 86_400_000 ? [{ s, p }] : [];
        });

  const xLabels = xs.length > 1 ? [xs[0], xs[xs.length - 1]] : [xs[0]];

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={props.ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} className="chart-grid" />
            <text x={m.l - 6} y={sy(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {fmt.format(t)}
            </text>
          </g>
        ))}
        {xLabels.map((v, i) => (
          <text key={v} x={sx(v)} y={height - 6} className="chart-axis" textAnchor={xLabels.length > 1 ? (i === 0 ? 'start' : 'end') : 'middle'}>
            {formatX(v)}
          </text>
        ))}
        {selX !== null && <line x1={sx(selX)} x2={sx(selX)} y1={m.t} y2={m.t + plotH} className="chart-cross" />}
        {series.map((s) =>
          s.style === 'line' ? (
            <g key={s.name}>
              {s.points.length > 1 && (
                <polyline
                  points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {s.points.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} className="chart-dot" />
              ))}
            </g>
          ) : (
            <g key={s.name}>
              {s.points.map((p) => (
                <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={4} fill={s.color} className="chart-dot" />
              ))}
            </g>
          ),
        )}
        {props.endLabel && main && (
          <text x={sx(main.points[main.points.length - 1].x) + 8} y={sy(main.points[main.points.length - 1].y)} className="chart-value" dominantBaseline="middle">
            {props.endLabel(main.points[main.points.length - 1].y)}
          </text>
        )}
        <rect
          x={m.l}
          y={m.t}
          width={plotW}
          height={plotH}
          fill="transparent"
          tabIndex={0}
          aria-label={`${props.ariaLabel}. Usá las flechas para recorrer las fechas.`}
          onPointerDown={onPointer}
          onPointerMove={(e) => e.buttons > 0 && onPointer(e)}
          onKeyDown={onKey}
          onBlur={() => setSelX(null)}
          style={{ touchAction: 'pan-y' }}
        />
      </svg>
      {selX !== null && readout.length > 0 && (
        <Tooltip x={sx(selX)} width={width}>
          <span className="chart-tip-date">{formatX(selX)}</span>
          {readout.map(({ s, p }) => (
            <span key={s.name} className="chart-tip-row">
              <span className={`chart-key${s.style === 'dots' ? ' is-dot' : ''}`} style={{ background: s.color }} />
              <strong>{p.label}</strong> <span className="chart-tip-name">{s.name}</span>
            </span>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function Legend({ series }: { series: Pick<LineSeries, 'name' | 'style' | 'color'>[] }) {
  return (
    <div className="chart-legend">
      {series.map((s) => (
        <span key={s.name}>
          <span className={`chart-key${s.style === 'dots' ? ' is-dot' : ''}`} style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}
