import { create } from 'zustand';
import * as Crypto from 'expo-crypto';
import { api, ApiError, OfflineError } from '@/lib/api';
import { saidPlainly } from '@/lib/errors';
import { useLedger } from '@/state/ledger';
import { dayKey } from '@/domain/projection';
import type { Ledger } from '@/db/repo';
import { digest, parseArgs, planWrite, runRead, type Plan } from './tools';
import { commit, Declined } from './commit';

/**
 * One conversation with Otto, and the loop that drives it.
 *
 * The phone owns the conversation. It holds the exact item list the model has seen — what the owner
 * typed, what Otto said, Otto's encrypted reasoning, every tool call and every result — and sends it
 * whole on each request, so the server can stay stateless and keep nothing.
 *
 * A turn is a loop: ask the server; run whatever reads the model asked for, here, against the ledger
 * already in memory; turn whatever writes it asked for into cards; and go round again once every call
 * has an answer. A write's answer is the owner's tap — Confirmar runs the repository call, Cancelar
 * says so — which is why the loop can stop mid-turn and wait for a person.
 *
 * Held in memory only, for the session. The conversation is cheap to start again and carries the
 * owner's figures, so it does not earn a place on disk; and it is dropped the moment another owner
 * signs in on the same phone (`claim`).
 */

type Item = Record<string, unknown>;

interface Call {
  call_id: string;
  name: string;
  arguments: string;
  write: boolean;
}

interface Reply {
  items: Item[];
  calls: Call[];
  text: string;
  remaining: number;
}

export type ActionState = 'pending' | 'working' | 'done' | 'cancelled' | 'failed';

export type Bubble =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'otto'; text: string }
  | { id: string; kind: 'action'; callId: string; plan: Plan; state: ActionState; note?: string };

interface ChatState {
  owner: string | null;
  items: Item[];
  bubbles: Bubble[];
  /** Waiting on the model. */
  thinking: boolean;
  /** The last request failed; the owner may try it again without retyping. */
  error: { text: string; retry: boolean } | null;
  claim: (owner: string) => void;
  send: (text: string) => Promise<void>;
  confirm: (callId: string) => Promise<void>;
  cancel: (callId: string) => Promise<void>;
  retry: () => Promise<void>;
  reset: () => void;
}

/** The model may keep calling tools; past this many rounds in one turn something is wrong. */
const MAX_ROUNDS = 8;
/** Generous: a model call with a tool round or two takes a while, and the server bounds its own. */
const ASSISTANT_TIMEOUT_MS = 60_000;
/** The server refuses more than 240 items; old turns are dropped well before that. */
const KEEP_ITEMS = 160;
/** A tool result the model would choke on is replaced by a request to narrow the question. */
const MAX_OUTPUT_CHARS = 30_000;

const bubbleId = () => Crypto.randomUUID();

function snapshot(): Ledger {
  const s = useLedger.getState();
  return {
    accounts: s.accounts,
    series: s.series,
    entries: s.entries,
    caps: s.caps,
    categories: s.categories,
    deferrals: s.deferrals,
  };
}

const output = (callId: string, value: unknown): Item => {
  let text = JSON.stringify(value);
  if (text.length > MAX_OUTPUT_CHARS) {
    text = JSON.stringify({ ok: false, erro: 'resultado grande demais; refaça com um filtro mais estreito.' });
  }
  return { type: 'function_call_output', call_id: callId, output: text };
};

/** Drop whole turns from the front — never half of one, which would orphan a call from its result. */
function trimmed(items: Item[]): Item[] {
  let out = items;
  while (out.length > KEEP_ITEMS) {
    const next = out.findIndex((it, i) => i > 0 && it.role === 'user');
    if (next <= 0) break;
    out = out.slice(next);
  }
  return out;
}

export const useChat = create<ChatState>((set, get) => {
  let rounds = 0;
  /** Calls answered by a tap rather than on the spot. The turn resumes when this empties. */
  const waiting = new Set<string>();

  const append = (...items: Item[]) => set((s) => ({ items: [...s.items, ...items] }));
  const say = (b: Bubble) => set((s) => ({ bubbles: [...s.bubbles, b] }));
  const patch = (callId: string, change: Partial<Extract<Bubble, { kind: 'action' }>>) =>
    set((s) => ({
      bubbles: s.bubbles.map((b) => (b.kind === 'action' && b.callId === callId ? { ...b, ...change } : b)),
    }));

  async function ensureLedger(): Promise<void> {
    const s = useLedger.getState();
    if (!s.ready || s.error) await s.load();
  }

  async function round(): Promise<void> {
    if (rounds >= MAX_ROUNDS) {
      set({ thinking: false, error: { text: 'O Otto se enrolou nessa. Pode perguntar de outro jeito?', retry: false } });
      return;
    }
    rounds += 1;
    set({ thinking: true, error: null });

    let reply: Reply;
    try {
      await ensureLedger();
      const today = dayKey(new Date());
      const ledger = useLedger.getState().error ? null : snapshot();
      reply = await api<Reply>('/v1/assistant', {
        method: 'POST',
        body: JSON.stringify({ input: trimmed(get().items), context: ledger ? digest(ledger, today) : '' }),
        signal: AbortSignal.timeout(ASSISTANT_TIMEOUT_MS),
      });
    } catch (e) {
      rounds -= 1;
      set({ thinking: false, error: failure(e) });
      return;
    }

    append(...reply.items);
    if (reply.text) say({ id: bubbleId(), kind: 'otto', text: reply.text });

    if (reply.calls.length === 0) {
      set({ thinking: false });
      return;
    }

    // Read on the ledger as it is right now: the snapshot is re-taken per round, so a write the
    // owner just confirmed is already in what the next read sees.
    const ledger = snapshot();
    const ledgerBroken = useLedger.getState().error !== null;
    const today = dayKey(new Date());
    const env = { today, newId: () => Crypto.randomUUID(), now: () => new Date().toISOString() };

    for (const call of reply.calls) {
      const args = parseArgs(call.arguments);
      if (!args) {
        append(output(call.call_id, { ok: false, erro: 'argumentos ilegíveis; mande de novo.' }));
        continue;
      }
      if (ledgerBroken) {
        append(output(call.call_id, { ok: false, erro: 'o app não conseguiu ler o razão agora; peça para o usuário tentar de novo em instantes.' }));
        continue;
      }
      if (!call.write) {
        const r = runRead(call.name, args, ledger, today);
        append(output(call.call_id, r.ok ? r.data : { ok: false, erro: r.error }));
        continue;
      }
      const p = planWrite(call.name, args, ledger, env);
      if (!p.ok) {
        append(output(call.call_id, { ok: false, erro: p.error }));
        continue;
      }
      waiting.add(call.call_id);
      say({ id: bubbleId(), kind: 'action', callId: call.call_id, plan: p.plan, state: 'pending' });
    }

    set({ thinking: false });
    if (waiting.size === 0) await round();
  }

  async function resolved(callId: string): Promise<void> {
    waiting.delete(callId);
    if (waiting.size === 0) await round();
  }

  return {
    owner: null,
    items: [],
    bubbles: [],
    thinking: false,
    error: null,

    claim: (owner) => {
      if (get().owner !== owner) {
        waiting.clear();
        rounds = 0;
        set({ owner, items: [], bubbles: [], thinking: false, error: null });
      }
    },

    send: async (raw) => {
      const text = raw.trim();
      if (!text || get().thinking) return;

      // Talking past a card is a no. Its call still needs an answer before the model hears anything
      // new, so it is cancelled on the owner's behalf — and the card says so.
      for (const callId of [...waiting]) {
        append(output(callId, { ok: false, cancelado: 'o usuário mandou outra mensagem sem confirmar' }));
        patch(callId, { state: 'cancelled' });
      }
      waiting.clear();

      rounds = 0;
      append({ role: 'user', content: text });
      say({ id: bubbleId(), kind: 'user', text });
      await round();
    },

    confirm: async (callId) => {
      const bubble = get().bubbles.find((b) => b.kind === 'action' && b.callId === callId);
      if (!bubble || bubble.kind !== 'action' || bubble.state !== 'pending') return;
      patch(callId, { state: 'working' });
      try {
        await commit(bubble.plan.mutation);
        // Reloaded before the model hears about it, so every screen — and Otto's next read — already
        // shows the change by the time Otto says it happened.
        await useLedger.getState().load();
        patch(callId, { state: 'done' });
        append(output(callId, { ok: true, feito: bubble.plan.done }));
      } catch (e) {
        if (e instanceof Declined) {
          patch(callId, { state: 'cancelled', note: 'A biometria não foi confirmada.' });
          append(output(callId, { ok: false, cancelado: 'a biometria não foi confirmada; nada foi apagado' }));
        } else if (e instanceof OfflineError) {
          // A lost answer says nothing about whether the write landed — see `OfflineError`. So Otto is
          // told exactly that, and the owner is asked to look rather than told it failed.
          patch(callId, { state: 'failed', note: 'Sem resposta do servidor. Pode ter salvo — confira antes de tentar de novo.' });
          append(output(callId, { ok: false, erro: 'sem resposta do servidor; a gravação pode ter acontecido ou não. O usuário deve conferir no app antes de tentar de novo.' }));
        } else {
          const said = saidPlainly(e);
          patch(callId, { state: 'failed', note: said });
          append(output(callId, { ok: false, erro: said }));
        }
      }
      rounds = 0;
      await resolved(callId);
    },

    cancel: async (callId) => {
      const bubble = get().bubbles.find((b) => b.kind === 'action' && b.callId === callId);
      if (!bubble || bubble.kind !== 'action' || bubble.state !== 'pending') return;
      patch(callId, { state: 'cancelled' });
      append(output(callId, { ok: false, cancelado: 'o usuário tocou em Cancelar; nada foi gravado' }));
      rounds = 0;
      await resolved(callId);
    },

    retry: async () => {
      if (get().thinking || waiting.size > 0) return;
      await round();
    },

    reset: () => {
      waiting.clear();
      rounds = 0;
      set({ items: [], bubbles: [], thinking: false, error: null });
    },
  };
});

/** What the owner reads when a request to Otto did not come back. */
function failure(e: unknown): { text: string; retry: boolean } {
  if (e instanceof OfflineError) return { text: 'Sem resposta do servidor. Confira a conexão e tente de novo.', retry: true };
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return { text: saidPlainly(e), retry: false };
    if (e.status === 404) return { text: 'O assistente ainda não está disponível neste servidor.', retry: false };
    // 503 carries the server's own words: "ainda não foi configurado", "sem créditos", "descansando".
    if (e.status === 503 || e.status === 429) return { text: e.message, retry: e.status === 503 };
    if (e.status === 400) return { text: 'Essa conversa ficou inválida. Comece uma nova.', retry: false };
    return { text: e.message || saidPlainly(e), retry: true };
  }
  return { text: saidPlainly(e), retry: true };
}
