import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getWeekPlan, updateDayState } from '../db/db';
import { addExerciseAlias, logActivity, logAssistant, saveBodyMetric, setAssistantFeedback, startSession } from '../db/actions';
import { respond, type AssistantAction, type AssistantContext, type Reply } from '../assistant/engine';
import type { IntentId } from '../assistant/intents';
import { toISODate } from '../domain/dates';
import { navigate, switchTab } from '../router';
import { Icon } from '../ui/Icon';
import { Loading } from '../ui/common';
import { useNow } from '../ui/useNow';

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; reply: Reply; logId?: string; resolved?: 'si' | 'no'; feedback?: 'util' | 'no-util' }
  | { id: string; role: 'note'; text: string };

let seq = 0;
const nextId = () => `m${++seq}`;

const GREETING: Reply = {
  intent: 'ayuda',
  decidedBy: 'reglas',
  entities: {},
  text: '¿Qué necesitás? Te respondo con tus datos y nunca invento números.',
  chips: [
    { label: '¿Qué toca hoy?', action: { type: 'say', text: '¿Qué toca hoy?' } },
    { label: 'Tengo 20 minutos', action: { type: 'say', text: 'Tengo 20 minutos' } },
    { label: '¿Cómo se hace el Pallof?', action: { type: 'say', text: '¿Cómo se hace el Pallof?' } },
    { label: 'Última vez en jalón', action: { type: 'say', text: '¿Qué hice la última vez en jalón?' } },
    { label: 'Anotá pádel 90 minutos', action: { type: 'say', text: 'Anotá pádel 90 minutos' } },
    { label: '¿Qué podés hacer?', action: { type: 'say', text: '¿Qué podés hacer?' } },
  ],
};

export function AssistantScreen() {
  const now = useNow();
  const iso = toISODate(now);
  const data = useLiveQuery(async () => {
    const [exercises, routines, weekPlan, sessions, day, metrics, media] = await Promise.all([
      db.exercises.toArray(),
      db.routines.toArray(),
      getWeekPlan(),
      db.sessions.toArray(),
      db.days.get(iso),
      db.bodyMetrics.toArray(),
      db.userMedia.toArray(),
    ]);
    return { exercises, routines, weekPlan, sessions, day, metrics, ownMedia: new Set(media.map((m) => m.exerciseId)) };
  }, [iso]);

  const [messages, setMessages] = useState<Message[]>([{ id: nextId(), role: 'assistant', reply: GREETING }]);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length]);

  if (!data) return <Loading />;

  const lastExerciseId = [...messages].reverse().find((m): m is Extract<Message, { role: 'assistant' }> => m.role === 'assistant' && !!m.reply.exerciseId)
    ?.reply.exerciseId;
  const ctx: AssistantContext = { now, ...data, lastExerciseId };

  const send = async (input: string, forced?: { intent: IntentId; exerciseId?: string; teach?: string }, shown?: string) => {
    const clean = input.trim();
    if (!clean) return;
    const reply = respond(clean, ctx, forced);
    const userMsg: Message = { id: nextId(), role: 'user', text: shown ?? clean };
    const assistantId = nextId();
    setMessages((m) => [...m, userMsg, { id: assistantId, role: 'assistant', reply }]);
    const logId = await logAssistant({ text: shown ? `${clean} → ${shown}` : clean, intent: reply.intent, decidedBy: 'reglas', entities: reply.entities });
    setMessages((m) => m.map((x) => (x.id === assistantId && x.role === 'assistant' ? { ...x, logId } : x)));
  };

  const note = (t: string) => setMessages((m) => [...m, { id: nextId(), role: 'note', text: t }]);

  const run = async (action: AssistantAction, label: string) => {
    switch (action.type) {
      case 'say':
        return send(action.text, undefined, action.text === label ? undefined : label);
      case 'force':
        return send(action.text, { intent: action.intent, exerciseId: action.exerciseId, teach: action.teach }, label);
      case 'navigate':
        return navigate(action.path);
      case 'start-session': {
        const routine = data.routines.find((r) => r.id === action.routineId);
        if (!routine) return note('No encontré esa rutina.');
        const open = data.sessions.find((s) => s.date === iso && s.status === 'en-curso');
        if (open) return navigate(`/sesion/${open.id}`);
        const id = await startSession({ routine, mode: action.mode, readiness: data.day?.readiness, date: iso });
        return navigate(`/sesion/${id}`);
      }
      case 'set-day':
        await updateDayState(iso, action.patch);
        return note(action.done);
      case 'log-activity':
        await logActivity(action.params);
        return note(action.done);
      case 'log-metric':
        await saveBodyMetric(action.params);
        return note(action.done);
      case 'add-alias':
        await addExerciseAlias(action.exerciseId, action.alias);
        return note(action.done);
    }
  };

  const resolve = (id: string, resolved: 'si' | 'no') => setMessages((m) => m.map((x) => (x.id === id && x.role === 'assistant' ? { ...x, resolved } : x)));
  const feedback = (msg: Extract<Message, { role: 'assistant' }>, value: 'util' | 'no-util') => {
    setMessages((m) => m.map((x) => (x.id === msg.id && x.role === 'assistant' ? { ...x, feedback: value } : x)));
    if (msg.logId) setAssistantFeedback(msg.logId, value);
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text;
    setText('');
    send(t);
  };

  return (
    <div className="assistant">
      <header className="session-top">
        <button className="icon-btn" onClick={() => switchTab('/hoy')} aria-label="Volver a Hoy">
          <Icon name="close" />
        </button>
        <div className="session-top-main">
          <span className="session-top-title">Asistente</span>
          <span className="session-top-sub">Funciona sin internet · no inventa números</span>
        </div>
        <span className="icon-btn" aria-hidden="true" />
      </header>

      <div className="chat" aria-live="polite">
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className="bubble bubble-user">
              {m.text}
            </p>
          ) : m.role === 'note' ? (
            <p key={m.id} className="bubble bubble-note">
              <Icon name="check" size={18} /> {m.text}
            </p>
          ) : (
            <div key={m.id} className="bubble bubble-bot">
              <p className="bot-text">{m.reply.text}</p>
              {m.reply.lines && (
                <ul className="bot-lines">
                  {m.reply.lines.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              )}
              {m.reply.confirm &&
                (m.resolved ? (
                  <p className="hint">{m.resolved === 'si' ? 'Confirmado.' : 'Cancelado: no se cambió nada.'}</p>
                ) : (
                  <div className="bot-actions">
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => {
                        resolve(m.id, 'si');
                        run(m.reply.confirm!.action, m.reply.confirm!.yes);
                      }}
                    >
                      {m.reply.confirm.yes}
                    </button>
                    <button
                      className="btn btn-sm"
                      onClick={() => {
                        resolve(m.id, 'no');
                        note('Listo, no cambié nada.');
                      }}
                    >
                      {m.reply.confirm.no ?? 'No'}
                    </button>
                  </div>
                ))}
              {m.reply.buttons && (
                <div className="bot-actions">
                  {m.reply.buttons.map((b) => (
                    <button key={b.label} className="btn btn-sm btn-primary" onClick={() => run(b.action, b.label)}>
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
              {m.id === lastAssistant && m.reply.chips && m.reply.chips.length > 0 && (
                <div className="bot-chips">
                  <span className="bot-chips-label">Continuar con:</span>
                  {m.reply.chips.map((c) => (
                    <button key={c.label} className="chip-btn" onClick={() => run(c.action, c.label)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
              {m.logId && (!m.reply.confirm || m.resolved) && (
                <div className="bot-feedback">
                  {m.feedback ? (
                    <span>{m.feedback === 'util' ? 'Gracias.' : 'Anotado: lo voy a revisar.'}</span>
                  ) : (
                    <>
                      <span>Esta respuesta:</span>
                      <button className="link" onClick={() => feedback(m, 'util')}>
                        Útil
                      </button>
                      <button className="link" onClick={() => feedback(m, 'no-util')}>
                        No útil
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Pedile algo…"
          aria-label="Pedile algo al asistente"
          enterKeyHint="send"
          autoComplete="off"
        />
        <button className="btn btn-primary chat-send" type="submit" aria-label="Enviar" disabled={!text.trim()}>
          <Icon name="send" size={20} />
        </button>
      </form>
    </div>
  );
}
