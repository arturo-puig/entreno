import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { addUserMedia, deleteUserMedia, prepareMedia } from '../db/actions';
import type { Exercise, UserMedia } from '../db/types';
import { creditFor, illustrationsFor, type Illustration } from '../data/media';
import { Icon } from './Icon';
import { ConfirmSheet, Sheet } from './common';

type Entry =
  | { key: string; kind: 'propio'; label: string; variant?: string; media: UserMedia }
  | { key: string; kind: 'ilustracion'; label: string; variant?: string; ill: Illustration };

const BIG_VIDEO_MB = 50;
const TWO_IN_ONE = { 'lado-a-lado': 'una al lado de la otra', apiladas: 'una arriba de la otra' } as const;
function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
}

/**
 * Cómo se hace: primero lo tuyo (tu gimnasio, tus máquinas), después ilustraciones con licencia abierta.
 * Nunca se muestra algo como «video» si no lo es.
 */
export function ExerciseMedia({ exercise, preferredVariant }: { exercise: Exercise; preferredVariant?: string }) {
  const own = useLiveQuery(() => db.userMedia.where('exerciseId').equals(exercise.id).toArray(), [exercise.id]);
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [
      ...(own ?? [])
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((m) => ({
          key: m.id,
          kind: 'propio' as const,
          label: m.kind === 'video' ? 'Tu video' : 'Tu foto',
          variant: m.variant,
          media: m,
        })),
      ...illustrationsFor(exercise.id).map((ill) => ({
        key: ill.sourceId,
        kind: 'ilustracion' as const,
        label: ill.kind === 'fotos' ? 'Fotos' : ill.source === 'ia' ? 'Imagen IA' : 'Ilustración',
        variant: ill.variant,
        ill,
      })),
    ];
    // La variante que corresponde (p. ej. «Agarre neutro» el jueves) va primero.
    return preferredVariant ? [...list.filter((e) => e.variant === preferredVariant), ...list.filter((e) => e.variant !== preferredVariant)] : list;
  }, [own, exercise.id, preferredVariant]);

  const [selectedKey, setSelectedKey] = useState<string>();
  const [pending, setPending] = useState<{ blob: Blob; kind: UserMedia['kind']; mime: string; url: string } | null>(null);
  const [toDelete, setToDelete] = useState<UserMedia | null>(null);
  const [error, setError] = useState<string>();
  const fileRef = useRef<HTMLInputElement>(null);

  // Si lo elegido se borró, vuelve al primero.
  const current = entries.find((e) => e.key === selectedKey) ?? entries[0];

  const onFile = async (file?: File) => {
    setError(undefined);
    if (!file) return;
    try {
      const prepared = await prepareMedia(file);
      setPending({ ...prepared, url: URL.createObjectURL(prepared.blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const closePending = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  };

  const youtube = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} técnica`)}`;

  return (
    <section className="media-block" aria-label="Cómo se hace: imágenes y videos">
      {own === undefined ? (
        <div className="media media-empty" />
      ) : current ? (
        <>
          <div className={`media${current.kind === 'ilustracion' && current.ill.layout === 'apiladas' ? ' is-square' : ''}`}>
            {current.kind === 'ilustracion' ? <IllustrationPlayer ill={current.ill} name={exercise.name} /> : <OwnMediaView media={current.media} />}
          </div>
          {entries.length > 1 && (
            <div className="media-tabs" role="group" aria-label="Elegir imagen o video">
              {entries.map((e) => (
                <button key={e.key} className="chip-btn" aria-pressed={e === current} onClick={() => setSelectedKey(e.key)}>
                  {e.label}
                  {e.variant && <span className="chip-variant"> · {e.variant}</span>}
                </button>
              ))}
            </div>
          )}
          <MediaCaption entry={current} onDelete={() => current.kind === 'propio' && setToDelete(current.media)} />
        </>
      ) : (
        <div className="media media-empty" role="img" aria-label="Sin video ni ilustración">
          <Icon name="image" size={30} />
          <p className="media-title">Todavía no hay video ni ilustración</p>
          <p className="media-text">
            Lo más confiable: pedile a tu profe que lo haga una vez y grabalo. Queda guardado en tu celular.
          </p>
        </div>
      )}

      <div className="media-actions">
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
          <Icon name="camera" size={18} /> Agregar video o foto
        </button>
        <a className="btn btn-sm btn-ghost" href={youtube} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={18} /> Buscar en YouTube
        </a>
      </div>
      <p className="hint">«Buscar en YouTube» abre videos de terceros que la app no verificó.</p>
      {error && <p className="error-text">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="video/*,image/*"
        hidden
        aria-label="Elegir video o foto"
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {pending && (
        <SaveMediaSheet
          exercise={exercise}
          pending={pending}
          onCancel={closePending}
          onSave={async (variant) => {
            const id = await addUserMedia({ exerciseId: exercise.id, variant, blob: pending.blob, kind: pending.kind, mime: pending.mime });
            closePending();
            setSelectedKey(id); // mostrar lo que acabás de agregar
          }}
        />
      )}

      {toDelete && (
        <ConfirmSheet
          title={toDelete.kind === 'video' ? '¿Borrar este video?' : '¿Borrar esta foto?'}
          message="Se borra solo de esta app. No se puede deshacer."
          confirmLabel="Borrar"
          danger
          onCancel={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteUserMedia(toDelete.id);
            setToDelete(null);
          }}
        />
      )}
    </section>
  );
}

function IllustrationPlayer({ ill, name }: { ill: Illustration; name: string }) {
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const n = ill.frames.length;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const next = () => setFrame((f) => (f + 1) % n);

  useEffect(() => {
    setFrame(0);
  }, [ill.sourceId]);

  useEffect(() => {
    if (!playing) return;
    // En las secuencias, el primer y el último cuadro (posición de inicio) duran un poco más.
    const extra = n > 2 && (frame === 0 || frame === n - 1) ? 300 : 0;
    const id = window.setTimeout(next, ill.frameMs + extra);
    return () => window.clearTimeout(id);
  }, [playing, frame, ill.frameMs, n]);

  const what = ill.kind === 'fotos' ? 'fotos' : ill.source === 'ia' ? 'ilustración generada con IA' : 'ilustración';
  // Lo generado con IA lleva el rótulo sobre la imagen: nunca se confunde con una demostración.
  const tag = ill.source === 'ia' && <span className="media-tag">Generada con IA</span>;
  const tagged = ill.source === 'ia' ? ' has-tag' : '';
  if (n === 1)
    return (
      <div className={`media-illustration${tagged}`}>
        <img
          src={ill.frames[0]}
          alt={`${name}: ${what}, ${ill.layout ? `las dos posiciones ${TWO_IN_ONE[ill.layout]}` : 'la posición'}`}
          className="is-visible"
          draggable={false}
        />
        {tag}
      </div>
    );
  return (
    <div className={`media-illustration${ill.kind === 'fotos' ? ' is-photos' : ''}${tagged}`}>
      {ill.frames.map((src, i) => (
        <img key={src} src={src} alt="" className={i === frame ? 'is-visible' : ''} draggable={false} loading={i === 0 ? 'eager' : 'lazy'} />
      ))}
      {/* Tocar la imagen: pausa; en pausa, pasa a la posición siguiente. */}
      <button
        className="media-hit"
        onClick={() => (playing ? setPlaying(false) : next())}
        aria-label={`${name}: ${what}, posición ${frame + 1} de ${n}. ${playing ? 'Tocá para pausar.' : 'Tocá para ver la posición siguiente.'}`}
      />
      <span className="media-badge" aria-hidden="true">
        {frame + 1}/{n}
      </span>
      {tag}
      <button className="media-ctrl" onClick={() => setPlaying((p) => !p)}>
        {playing ? 'Pausar' : 'Animar'}
      </button>
    </div>
  );
}

function OwnMediaView({ media }: { media: UserMedia }) {
  const url = useMemo(() => URL.createObjectURL(media.blob), [media.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const videoRef = useRef<HTMLVideoElement>(null);
  if (media.kind === 'imagen') return <img className="media-own" src={url} alt="Tu foto del ejercicio" />;
  return (
    <video
      ref={videoRef}
      className="media-own"
      src={url}
      autoPlay
      muted
      loop
      playsInline
      aria-label="Tu video del ejercicio. Tocá para pausar o reanudar."
      onClick={() => (videoRef.current?.paused ? videoRef.current.play() : videoRef.current?.pause())}
    />
  );
}

function MediaCaption({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  if (entry.kind === 'propio') {
    const date = new Date(entry.media.createdAt).toLocaleDateString('es-AR');
    return (
      <div className="media-caption">
        <span>
          {entry.label}
          {entry.variant && ` · ${entry.variant}`} · {fileSize(entry.media.size)} · {date}
        </span>
        <button className="link link-danger" onClick={onDelete}>
          Borrar
        </button>
      </div>
    );
  }
  const c = creditFor(entry.ill);
  return (
    <div className="media-caption is-stacked">
      <span>
        {entry.ill.kind === 'fotos'
          ? `Secuencia de ${entry.ill.frames.length} fotos del movimiento (no es un video)`
          : entry.ill.source === 'ia'
            ? `Imagen generada con IA ${
                entry.ill.layout
                  ? `de las dos posiciones, ${TWO_IN_ONE[entry.ill.layout]}`
                  : entry.ill.frames.length === 1
                    ? 'de la posición'
                    : 'de las dos posiciones del movimiento'
              } (no es un video ni una foto real)`
            : entry.ill.layout
            ? `Ilustración de las dos posiciones del movimiento, ${TWO_IN_ONE[entry.ill.layout]} (no es un video)`
            : entry.ill.frames.length === 1
              ? 'Ilustración de la posición (no es un video)'
              : 'Ilustración de las dos posiciones del movimiento (no es un video)'}
        {entry.variant && <> · <strong>{entry.variant}</strong></>}.
      </span>
      {entry.ill.caption && <span>{entry.ill.caption}</span>}
      {entry.ill.source === 'ia' ? (
        <span className="credit">
          Generada con IA a tu pedido y revisada a ojo: es orientativa, no una demostración real. Si algo difiere de lo que te marcó tu profe, vale lo
          de tu profe.
        </span>
      ) : (
        <span className="credit">
          <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
            {c.name}
          </a>{' '}
          ({c.authors}) ·{' '}
          <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">
            {c.license}
          </a>{' '}
          · {c.changes === 'Sin cambios.' ? 'sin cambios' : 'adaptada'}
          {c.note ? `. ${c.note}` : ''}
        </span>
      )}
    </div>
  );
}

function SaveMediaSheet(props: {
  exercise: Exercise;
  pending: { kind: UserMedia['kind']; url: string; blob: Blob };
  onSave: (variant?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { exercise, pending } = props;
  const [variant, setVariant] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const sizeMb = pending.blob.size / (1024 * 1024);

  return (
    <Sheet title={pending.kind === 'video' ? 'Guardar video' : 'Guardar foto'} onClose={props.onCancel}>
      <div className="media media-preview">
        {pending.kind === 'video' ? (
          <video className="media-own" src={pending.url} autoPlay muted loop playsInline />
        ) : (
          <img className="media-own" src={pending.url} alt="Vista previa" />
        )}
      </div>
      <p className="muted small">
        {exercise.name} · {fileSize(pending.blob.size)}. Se guarda solo en este celular.
      </p>
      {pending.kind === 'video' && sizeMb > BIG_VIDEO_MB && (
        <p className="notice notice-warn">Pesa bastante: si podés, recortalo a 5–10 segundos antes de guardarlo.</p>
      )}
      {exercise.variants && exercise.variants.length > 0 && (
        <label className="field">
          <span className="field-label">¿Qué variante muestra?</span>
          <select className="input" value={variant} onChange={(e) => setVariant(e.target.value)}>
            <option value="">General</option>
            {exercise.variants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p className="error-text">{error}</p>}
      <div className="sheet-actions">
        <button className="btn" onClick={props.onCancel} disabled={busy}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(undefined);
            try {
              await props.onSave(variant || undefined);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          {busy ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </Sheet>
  );
}
