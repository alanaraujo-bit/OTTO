import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, getDaysInMonth, startOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Ledger } from '@/db/repo';
import type { Account, Entry, Occurrence, Series } from '@/domain/model';
import type { Category } from '@/domain/category';
import { categoryViews, lookFor, pickerOrder } from '@/domain/category';
import { brl } from '@/domain/money';
import {
  balanceToday,
  dayKey,
  debtStatus,
  monthCurve,
  nextOpen,
  occurrences,
  overdue,
  parseDay,
  project,
  spendByCategory,
  upcoming,
} from '@/domain/projection';
import { commitmentFor, commitments } from '@/domain/commitments';
import { capReadings } from '@/domain/cap';
import { categoryPace, spendPace } from '@/domain/analysis';
import { limitUse, statementCycle, statementForecast, statementTotal, withStatements } from '@/domain/card';
import { deferralMap, monthOf } from '@/domain/deferral';
import { firstInstallment, isStatementSeries, occurrenceKey, settled, statementSeriesId } from '@/domain/settlement';
import { paymentSeries } from '@/domain/spend';
import { openingFor } from './balance';

/**
 * What Otto can see and do, run on the device.
 *
 * **Every figure here is produced by `src/domain` — this file only chooses which function to call
 * and how to say the answer.** That is the whole reason tools run on the phone rather than on the
 * server: "quanto posso gastar" has to be the curve the Home draws, "quanto devo mês que vem" the
 * projection the calendar shows, to the centavo, and the only way to guarantee that forever is for
 * there to be one implementation of each.
 *
 * Pure on purpose. No React, no network, no clock: the ledger, today and an id factory are passed
 * in, so `tools/assistant-check.mjs` can run every tool against a fixture in plain Node and assert
 * on the numbers.
 *
 * **The model is a caller, and callers are checked at the boundary.** Its arguments arrive
 * schema-shaped — the server declares strict schemas — but a schema cannot say "a day that exists",
 * "an account this owner has" or "after the original due date". Every input is validated here, and
 * a write that fails validation never becomes a confirmation card: it goes back to the model as an
 * error it can explain or ask about.
 *
 * Writes do not happen here at all. A write tool returns a *plan*: what the card says, and the exact
 * repository call to make once the owner taps Confirmar (`commit.ts`). The plan is built against the
 * ledger in memory, the same way every screen builds its own write — and the repository's
 * idempotent read-modify-write is what makes it safe against a lost answer, exactly as it is there.
 */

export type Args = Record<string, unknown>;

export type ReadResult = { ok: true; data: unknown } | { ok: false; error: string };

export interface PlanLine {
  label: string;
  value: string;
  /** Money only. Chroma in this app means a sign, never emphasis. */
  tone?: 'positive' | 'negative';
  /** Figures and dates set in mono, like every other number in the app. */
  mono?: boolean;
}

export type Mutation =
  | { op: 'insertEntry'; entry: Entry }
  | { op: 'updateEntry'; entry: Entry }
  | { op: 'deleteEntry'; id: string }
  | { op: 'insertSeries'; series: Series }
  | { op: 'updateSeries'; series: Series }
  | { op: 'deleteSeries'; id: string }
  | { op: 'defer'; seriesId: string; month: string; to: string | null }
  | { op: 'settle'; seriesId: string; scheduled: string; entry: Omit<Entry, 'seriesId' | 'settlesDate' | 'recordedAt'> }
  | { op: 'insertAccount'; account: Account }
  | { op: 'updateAccount'; account: Account }
  | { op: 'deleteAccount'; id: string; name: string }
  | { op: 'setCap'; category: string; capCents: number }
  | { op: 'category'; from: string; to: string; look: Omit<Category, 'name'> };

export interface Plan {
  /** The card's heading — the verb, in the owner's terms. */
  title: string;
  lines: PlanLine[];
  /** Deletes something. The card says so in `negative` and the button reads Apagar. */
  destructive: boolean;
  /** One sentence the card adds under the lines, when there is a consequence worth naming. */
  note?: string;
  mutation: Mutation;
  /** What Otto is told happened, once it has. */
  done: string;
}

export type PlanResult = { ok: true; plan: Plan } | { ok: false; error: string };

export interface Env {
  today: string;
  /** Fresh ids for created rows. Injected: the app passes `expo-crypto`, the check a counter. */
  newId: () => string;
  /** The moment a row is recorded, ISO-8601. */
  now: () => string;
}

/** Same ceiling the keypad in `lançar` enforces. */
const MAX_CENTS = 99_999_999;

class Invalid extends Error {}
const fail = (message: string): never => {
  throw new Invalid(message);
};

// ---------------------------------------------------------------------------------------------
// Validation. Each one either returns a value the domain can trust or throws a sentence the model
// can repeat to the owner.

function text(v: unknown, field: string, max = 140): string {
  if (typeof v !== 'string' || v.trim() === '') return fail(`${field}: vazio.`);
  const t = v.trim();
  if (t.length > max) return fail(`${field}: passa de ${max} caracteres.`);
  return t;
}

const maybe = <T>(v: unknown, read: (v: unknown) => T): T | null => (v == null ? null : read(v));

function cents(v: unknown, field: string, { min = 1, max = MAX_CENTS } = {}): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v)) return fail(`${field}: precisa ser um número inteiro de centavos.`);
  if (v < min) return fail(min === 1 ? `${field}: precisa ser maior que zero.` : `${field}: valor baixo demais.`);
  if (v > max) return fail(`${field}: valor alto demais.`);
  return v;
}

function int(v: unknown, field: string, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return fail(`${field}: precisa ser um inteiro entre ${lo} e ${hi}.`);
  return v;
}

function day(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return fail(`${field}: use o formato AAAA-MM-DD.`);
  const d = parseDay(v);
  if (Number.isNaN(d.getTime()) || dayKey(d) !== v) return fail(`${field}: ${v} não é um dia que existe.`);
  return v;
}

function month(v: unknown, field: string): string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return fail(`${field}: use o formato AAAA-MM.`);
  return v;
}

function oneOf<T extends string>(v: unknown, field: string, values: readonly T[]): T {
  if (typeof v !== 'string' || !values.includes(v as T)) return fail(`${field}: use ${values.join(', ')}.`);
  return v as T;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function time(v: unknown): string {
  if (typeof v !== 'string' || !TIME_RE.test(v)) return fail('hora: use HH:MM.');
  return v;
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase('pt-BR') === b.trim().toLocaleLowerCase('pt-BR');

/** The owner's own spelling of a category, when they already have one by that name. */
function categoryName(ledger: Ledger, raw: unknown): string {
  const wanted = text(raw, 'categoria');
  const known = [
    ...pickerOrder(ledger.entries, ledger.series, ledger.categories),
    ...ledger.caps.map((c) => c.category),
  ].find((n) => sameName(n, wanted));
  return known ?? wanted;
}

const holdingOf = (ledger: Ledger) => ledger.accounts.filter((a) => a.kind !== 'card');

const listAccounts = (list: Account[]) => list.map((a) => `${a.name} (id ${a.id})`).join(', ');

/** An account the owner actually has. null means "the obvious one" — and only when there is one. */
function accountFor(ledger: Ledger, raw: unknown, { card }: { card: boolean }): Account {
  if (raw == null) {
    const holding = holdingOf(ledger);
    if (holding.length === 1) return holding[0] as Account;
    if (holding.length === 0) return fail('não há nenhuma conta cadastrada.');
    return fail(`há mais de uma conta; pergunte ao usuário qual: ${listAccounts(holding)}.`);
  }
  const found = ledger.accounts.find((a) => a.id === raw);
  if (!found) return fail(`conta ${String(raw)} não existe. Contas: ${listAccounts(ledger.accounts)}.`);
  if (!card && found.kind === 'card') return fail(`${found.name} é um cartão; aqui precisa ser uma conta.`);
  return found;
}

function seriesFor(ledger: Ledger, raw: unknown): Series {
  const id = text(raw, 'recorrencia_id', 80);
  return ledger.series.find((s) => s.id === id) ?? fail(`recorrência ${id} não existe; consulte \`recorrencias\`.`);
}

// ---------------------------------------------------------------------------------------------
// Saying it. Money leaves here already formatted, so Otto quotes rather than re-formats.

const monthStart = (m: string) => `${m}-01`;
const monthEnd = (m: string) => dayKey(endOfMonth(parseDay(monthStart(m))));
const monthLabel = (m: string) => format(parseDay(monthStart(m)), 'MMM/yyyy', { locale: ptBR });
const dayLabel = (d: string) => format(parseDay(d), "d 'de' MMM 'de' yyyy", { locale: ptBR });

const accountName = (ledger: Ledger, id: string) => ledger.accounts.find((a) => a.id === id)?.name ?? '—';

function kindOf(s: Pick<Series, 'kind' | 'direction'>): string {
  if (s.kind === 'debt') return s.direction === 'out' ? 'divida_a_pagar' : 'divida_a_receber';
  if (s.kind === 'card') return 'cartao';
  return s.kind === 'inflow' ? 'entrada' : 'saida';
}

const KIND_LABEL: Record<string, string> = {
  entrada: 'Renda que se repete',
  saida: 'Conta que se repete',
  divida_a_pagar: 'Dívida (você paga)',
  divida_a_receber: 'Valor a receber (parcelado)',
  cartao: 'Fatura de cartão',
};

const dir = (d: 'in' | 'out') => (d === 'in' ? 'entrada' : 'saida');
const money = (c: number, d: 'in' | 'out'): PlanLine['tone'] => (c === 0 ? undefined : d === 'in' ? 'positive' : 'negative');

/** Drops null, undefined and false, so a result carries only what it says. */
function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined && v !== false) out[k] = v;
  return out as Partial<T>;
}

function occurrenceView(o: Occurrence, today: string) {
  return compact({
    recorrencia_id: o.seriesId,
    titulo: o.title,
    categoria: o.category,
    tipo: kindOf(o),
    direcao: dir(o.direction),
    valor: brl(o.amountCents),
    vence: o.date,
    cai_em: o.on !== o.date ? o.on : null,
    adiada: o.on !== o.date,
    mes_da_ocorrencia: monthOf(o.date),
    parcela: o.installment ? `${o.installment.n}/${o.installment.of}` : null,
    atrasada: o.on <= today,
  });
}

const sum = (list: { amountCents: number }[]) => list.reduce((n, o) => n + o.amountCents, 0);

// ---------------------------------------------------------------------------------------------
// Reads.

function resumo(ledger: Ledger, today: string) {
  const { accounts, entries, series } = ledger;
  const deferrals = deferralMap(ledger.deferrals);
  const t = parseDay(today);
  const curve = monthCurve(accounts, entries, series, today, deferrals);
  const daysLeft = getDaysInMonth(t) - t.getDate() + 1;
  const spendable = Math.max(0, curve.trough.balance);
  const plan = commitments(series, today);
  const debts = debtStatus(series);
  const from30 = dayKey(addDays(t, -29));
  // The forecast's rules — the ledger's plus each card's statement still to pay — so "o que vence"
  // here is what the Home lists. `monthCurve` adds the statements by itself.
  const forecast = withStatements(accounts, entries, series, today);

  return {
    hoje: today,
    saldo_hoje: brl(balanceToday(accounts, entries, today)),
    contas: holdingOf(ledger).map((a) => ({
      id: a.id,
      nome: a.name,
      tipo: a.kind === 'savings' ? 'poupanca' : 'corrente',
      saldo: brl(balanceToday([a], entries, today)),
    })),
    cartoes: accounts
      .filter((a) => a.kind === 'card')
      .map((a) => {
        const cycle = statementCycle(a, today);
        const used = cycle ? statementTotal(entries, a, cycle) : 0;
        const use = limitUse(used, a);
        // What of this statement is still to pay, net of payments already linked to it — the figure
        // the forecast carries on the due date. Absent when nothing is owed on it.
        const owed = cycle
          ? forecast.find((s) => s.id === statementSeriesId(a.id) && s.startDate === cycle.due) ?? null
          : null;
        return compact({
          id: a.id,
          nome: a.name,
          fatura_atual: cycle ? brl(used) : null,
          fatura_a_pagar: owed ? brl(owed.amountCents) : null,
          fatura_recorrencia_id: owed ? owed.id : null,
          fatura_fechada: cycle?.closed ?? false,
          fecha_em: cycle?.closes ?? null,
          vence_em: cycle?.due ?? null,
          limite: a.limitCents != null ? brl(a.limitCents) : null,
          uso_do_limite: use != null ? `${Math.round(use * 100)}%` : null,
          ciclo_nao_configurado: cycle === null,
        });
      }),
    mes_atual: compact({
      mes: monthOf(today),
      saldo_no_inicio: brl(curve.balanceStart),
      saldo_hoje: brl(curve.balanceNow),
      saldo_previsto_no_fim: brl(curve.balanceEnd),
      menor_saldo_previsto: { valor: brl(curve.trough.balance), dia: curve.trough.date },
      entradas_no_mes: brl(curve.inflow),
      entradas_ja_feitas: brl(curve.inflowDone),
      saidas_no_mes: brl(curve.outflow),
      saidas_ja_feitas: brl(curve.outflowDone),
      atrasados: curve.overdue.length ? curve.overdue.map((o) => occurrenceView(o, today)) : null,
      atrasados_total: curve.overdueCents ? brl(curve.overdueCents) : null,
      fica_negativo: curve.trough.balance < 0,
    }),
    pode_gastar_ate_fim_do_mes: brl(spendable),
    pode_gastar_por_dia: brl(Math.floor(spendable / daysLeft)),
    dias_restantes_no_mes_contando_hoje: daysLeft,
    compromissos_mensais: {
      entradas_fixas: brl(plan.monthlyIn),
      saidas_fixas: brl(plan.monthlyOut),
      sobra_depois_dos_compromissos: brl(plan.free),
    },
    dividas: debts
      .filter((d) => d.series.direction === 'out')
      .map((d) => compact({
        recorrencia_id: d.series.id,
        titulo: d.series.title,
        com: d.series.counterparty,
        parcela: brl(d.series.amountCents),
        pagas: `${d.paid}/${d.total}`,
        falta: brl(d.remainingCents),
        ultima_parcela: monthLabel(monthOf(d.finishes)),
      })),
    dividas_total_restante: brl(debts.filter((d) => d.series.direction === 'out').reduce((n, d) => n + d.remainingCents, 0)),
    a_receber: debts
      .filter((d) => d.series.direction === 'in')
      .map((d) => compact({
        recorrencia_id: d.series.id,
        titulo: d.series.title,
        de: d.series.counterparty,
        parcela: brl(d.series.amountCents),
        recebidas: `${d.paid}/${d.total}`,
        falta: brl(d.remainingCents),
      })),
    tetos: capReadings(ledger.caps, entries, series, today).map((r) => compact({
      categoria: r.category,
      teto: brl(r.capCents),
      gasto: brl(r.spent),
      resta: brl(r.leftCents),
      usado: `${Math.round(r.used * 100)}%`,
      pode_por_dia: brl(r.perDayCents),
      estoura_em: r.burstsOn,
    })),
    maiores_gastos_30_dias: spendByCategory(entries, from30, today, paymentSeries(series))
      .slice(0, 6)
      .map((c) => ({ categoria: c.category, valor: brl(c.cents) })),
    proximos_7_dias: upcoming(forecast, entries, today, deferrals, 7)
      .slice(0, 12)
      .map((o) => occurrenceView(o, today)),
  };
}

function mes(ledger: Ledger, args: Args, today: string) {
  const m = month(args.mes, 'mes');
  const { accounts, entries, series } = ledger;
  const deferrals = deferralMap(ledger.deferrals);
  const curve = monthCurve(accounts, entries, series, today, deferrals, monthStart(m));
  const era = curve.era;

  // What is still to happen in the month, the same list the Home names for a month ahead. A month
  // already closed has nothing left to happen; its misses are not actionable from here.
  const forecast = withStatements(accounts, entries, series, today);
  const pending = era === 'past' ? [] : project(forecast, curve.from, curve.to, settled(entries), deferrals);
  const out = pending.filter((o) => o.direction === 'out');
  const inn = pending.filter((o) => o.direction === 'in');
  const spend = era === 'future'
    ? []
    : spendByCategory(entries, curve.from, era === 'current' ? today : curve.to, paymentSeries(series));

  return compact({
    mes: m,
    periodo: era === 'past' ? 'passado' : era === 'current' ? 'atual' : 'futuro',
    saldo_no_inicio: brl(curve.balanceStart),
    saldo_hoje: era === 'current' ? brl(curve.balanceNow) : null,
    [era === 'past' ? 'saldo_no_fechamento' : 'saldo_previsto_no_fim']: brl(curve.balanceEnd),
    menor_saldo: { valor: brl(curve.trough.balance), dia: curve.trough.date },
    entradas: brl(curve.inflow),
    saidas: brl(curve.outflow),
    entradas_ja_feitas: era === 'future' ? null : brl(curve.inflowDone),
    saidas_ja_feitas: era === 'future' ? null : brl(curve.outflowDone),
    a_pagar: era === 'past' ? null : {
      total: brl(sum(out)),
      parcelas_de_dividas: brl(sum(out.filter((o) => o.kind === 'debt'))),
      contas_fixas: brl(sum(out.filter((o) => o.kind === 'outflow'))),
      faturas_de_cartao: brl(sum(out.filter((o) => o.kind === 'card'))),
      itens: out.slice(0, 60).map((o) => occurrenceView(o, today)),
    },
    a_receber: era === 'past' ? null : {
      total: brl(sum(inn)),
      itens: inn.slice(0, 30).map((o) => occurrenceView(o, today)),
    },
    gastos_por_categoria: spend.length ? spend.slice(0, 15).map((c) => ({ categoria: c.category, valor: brl(c.cents) })) : null,
    gasto_total: era === 'future' ? null : brl(spend.reduce((n, c) => n + c.cents, 0)),
  });
}

function previstos(ledger: Ledger, args: Args, today: string) {
  const de = day(args.de, 'de');
  const ate = day(args.ate, 'ate');
  if (ate < de) fail('`ate` vem antes de `de`.');
  if (differenceInCalendarDays(parseDay(ate), parseDay(de)) > 400) fail('janela maior que 400 dias.');
  const { entries } = ledger;
  const series = withStatements(ledger.accounts, entries, ledger.series, today);
  const deferrals = deferralMap(ledger.deferrals);

  // The same evidence rule as the tape: what is late is listed as late, and what is ahead starts
  // tomorrow — a projection is never laid over a day that already happened.
  const late = overdue(series, entries, today, deferrals).filter((o) => o.on >= de && o.on <= ate);
  const tomorrow = dayKey(addDays(parseDay(today), 1));
  const ahead = ate < tomorrow ? [] : project(series, de > tomorrow ? de : tomorrow, ate, settled(entries), deferrals);
  const all = [...late, ...ahead];

  return {
    de,
    ate,
    total_a_pagar: brl(sum(all.filter((o) => o.direction === 'out'))),
    total_a_receber: brl(sum(all.filter((o) => o.direction === 'in'))),
    itens: all.slice(0, 80).map((o) => occurrenceView(o, today)),
    itens_omitidos: Math.max(0, all.length - 80),
  };
}

function lancamentos(ledger: Ledger, args: Args) {
  const de = maybe(args.de, (v) => day(v, 'de'));
  const ate = maybe(args.ate, (v) => day(v, 'ate'));
  const categoria = maybe(args.categoria, (v) => text(v, 'categoria'));
  const conta = maybe(args.conta_id, (v) => text(v, 'conta_id', 80));
  const direcao = maybe(args.direcao, (v) => oneOf(v, 'direcao', ['entrada', 'saida'] as const));
  const busca = maybe(args.busca, (v) => text(v, 'busca', 80).toLocaleLowerCase('pt-BR'));
  const limite = maybe(args.limite, (v) => int(v, 'limite', 1, 200)) ?? 50;

  const hit = ledger.entries
    .filter((e) =>
      (de === null || e.date >= de) &&
      (ate === null || e.date <= ate) &&
      (categoria === null || sameName(e.category, categoria)) &&
      (conta === null || e.accountId === conta) &&
      (direcao === null || dir(e.direction) === direcao) &&
      (busca === null || e.title.toLocaleLowerCase('pt-BR').includes(busca)))
    .sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? 1 : -1)
      : (a.time ?? '') !== (b.time ?? '') ? ((a.time ?? '') < (b.time ?? '') ? 1 : -1)
      : (a.recordedAt ?? '') < (b.recordedAt ?? '') ? 1 : -1);

  const cards = new Set(ledger.accounts.filter((a) => a.kind === 'card').map((a) => a.id));
  return {
    encontrados: hit.length,
    total_entradas: brl(sum(hit.filter((e) => e.direction === 'in'))),
    total_saidas: brl(sum(hit.filter((e) => e.direction === 'out'))),
    itens: hit.slice(0, limite).map((e) => compact({
      id: e.id,
      data: e.date,
      hora: e.time,
      titulo: e.title,
      categoria: e.category,
      direcao: dir(e.direction),
      valor: brl(e.amountCents),
      valor_centavos: e.amountCents,
      conta: accountName(ledger, e.accountId),
      conta_id: e.accountId,
      no_cartao: cards.has(e.accountId),
      paga_recorrencia_id: e.seriesId,
    })),
  };
}

function recorrencias(ledger: Ledger, args: Args, today: string) {
  const tipo = maybe(args.tipo, (v) => oneOf(v, 'tipo', ['entrada', 'saida', 'divida', 'cartao'] as const));
  const deferrals = deferralMap(ledger.deferrals);
  const plan = commitments(ledger.series, today);
  const matches = (s: Series) => tipo === null || kindOf(s).startsWith(tipo);

  return {
    entradas_fixas_por_mes: brl(plan.monthlyIn),
    saidas_fixas_por_mes: brl(plan.monthlyOut),
    sobra_depois_dos_compromissos: brl(plan.free),
    itens: ledger.series.filter(matches).map((s) => {
      const c = commitmentFor(s, today);
      const next = nextOpen(s, ledger.entries, today, deferrals);
      return compact({
        id: s.id,
        tipo: kindOf(s),
        titulo: s.title,
        categoria: s.category,
        valor: brl(s.amountCents),
        valor_centavos: s.amountCents,
        dia_do_mes: s.dayOfMonth,
        conta: accountName(ledger, s.accountId),
        conta_id: s.accountId,
        nos_proximos_12_meses: brl(c.yearCents),
        inicio: s.startDate,
        fim: s.endDate,
        com: s.counterparty,
        parcelas: c.remaining && s.totalCount != null
          ? {
              pagas: s.paidCount,
              total: s.totalCount,
              restantes: c.remaining.count,
              valor_restante: brl(c.remaining.cents),
              ultima: monthLabel(monthOf(c.remaining.finishes)),
            }
          : null,
        proxima_em_aberto: next
          ? compact({ vence: next.date, cai_em: next.on !== next.date ? next.on : null, parcela: next.installment ? `${next.installment.n}/${next.installment.of}` : null })
          : null,
        compartilhada: s.linkedShareToken !== null,
      });
    }),
  };
}

function gastos(ledger: Ledger, args: Args, today: string) {
  const meses = maybe(args.meses, (v) => int(v, 'meses', 1, 24)) ?? 6;
  const { entries, series } = ledger;
  const pace = spendPace(entries, series, today, meses);
  return {
    por_mes: pace.history.map((m) => compact({
      mes: m.month,
      total: brl(m.cents),
      ate_o_mesmo_dia: m.month === monthOf(today) ? null : brl(m.toDate),
      completo: m.complete,
    })),
    este_mes: compact({
      gasto_ate_hoje: brl(pace.spent),
      habitual_ate_hoje: pace.usual === null ? null : brl(pace.usual),
      diferenca: pace.delta === null ? null : brl(pace.delta),
      meses_de_base: pace.basis,
      sem_base_suficiente: pace.usual === null,
    }),
    por_categoria_este_mes: categoryPace(entries, series, today, meses).slice(0, 15).map((c) => compact({
      categoria: c.category,
      gasto: brl(c.cents),
      habitual: c.usual === null ? null : brl(c.usual),
      diferenca: c.delta === null ? null : brl(c.delta),
    })),
    tetos: capReadings(ledger.caps, entries, series, today).map((r) => compact({
      categoria: r.category,
      teto: brl(r.capCents),
      gasto: brl(r.spent),
      resta: brl(r.leftCents),
      usado: `${Math.round(r.used * 100)}%`,
      projecao_no_fim_do_mes: brl(r.projectedCents),
      estoura_em: r.burstsOn,
    })),
    categorias: categoryViews(ledger.categories, ledger.caps, entries, series).slice(0, 60).map((c) => compact({
      nome: c.name,
      descricao: c.description,
      teto: c.capCents === null ? null : brl(c.capCents),
    })),
  };
}

export const READS = ['resumo', 'mes', 'previstos', 'lancamentos', 'recorrencias', 'gastos'] as const;

export function runRead(name: string, args: Args, ledger: Ledger, today: string): ReadResult {
  try {
    switch (name) {
      case 'resumo': return { ok: true, data: resumo(ledger, today) };
      case 'mes': return { ok: true, data: mes(ledger, args, today) };
      case 'previstos': return { ok: true, data: previstos(ledger, args, today) };
      case 'lancamentos': return { ok: true, data: lancamentos(ledger, args) };
      case 'recorrencias': return { ok: true, data: recorrencias(ledger, args, today) };
      case 'gastos': return { ok: true, data: gastos(ledger, args, today) };
      default: return { ok: false, error: `ferramenta desconhecida: ${name}.` };
    }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

/** The digest every request carries, so the first answer needs no round trip. */
export function digest(ledger: Ledger, today: string): string {
  return JSON.stringify(resumo(ledger, today));
}

// ---------------------------------------------------------------------------------------------
// Writes. Each returns the card and the exact call; none of them touches anything.

const L = (label: string, value: string, extra: Omit<PlanLine, 'label' | 'value'> = {}): PlanLine => ({ label, value, ...extra });
const arrow = (before: string, after: string) => `${before} → ${after}`;

function entryFor(ledger: Ledger, raw: unknown): Entry {
  const id = text(raw, 'id', 80);
  return ledger.entries.find((e) => e.id === id) ?? fail(`lançamento ${id} não existe; consulte \`lancamentos\`.`);
}

function accountLine(a: Account): PlanLine {
  return L(a.kind === 'card' ? 'Cartão' : 'Conta', a.name);
}

function criarLancamento(ledger: Ledger, args: Args, env: Env): Plan {
  const amount = cents(args.valor_centavos, 'valor_centavos');
  const direction = oneOf(args.direcao, 'direcao', ['entrada', 'saida'] as const) === 'entrada' ? 'in' : 'out';
  const title = text(args.titulo, 'titulo');
  const category = categoryName(ledger, args.categoria);
  const account = accountFor(ledger, args.conta_id, { card: true });
  const date = maybe(args.data, (v) => day(v, 'data')) ?? env.today;
  // An entry is a fact, and a fact cannot sit in the future — the same rule `lançar` holds.
  if (date > env.today) fail('data: um lançamento não pode ser no futuro. Para algo que ainda vai acontecer, use uma recorrência.');
  const hour = maybe(args.hora, time);

  const entry: Entry = {
    id: env.newId(),
    seriesId: null,
    settlesDate: null,
    date,
    time: hour,
    recordedAt: env.now(),
    amountCents: amount,
    direction,
    title,
    category,
    accountId: account.id,
  };
  return {
    title: direction === 'in' ? 'Registrar entrada' : 'Registrar gasto',
    lines: [
      L('Valor', brl(amount), { tone: money(amount, direction), mono: true }),
      L('Descrição', title),
      L('Categoria', category),
      accountLine(account),
      L('Data', hour ? `${dayLabel(date)}, ${hour}` : dayLabel(date), { mono: true }),
    ],
    destructive: false,
    note: account.kind === 'card' ? 'No cartão: entra na fatura e não mexe no saldo de hoje.' : undefined,
    mutation: { op: 'insertEntry', entry },
    done: `lançamento registrado (id ${entry.id})`,
  };
}

function editarLancamento(ledger: Ledger, args: Args, env: Env): Plan {
  const existing = entryFor(ledger, args.id);
  const amount = maybe(args.valor_centavos, (v) => cents(v, 'valor_centavos')) ?? existing.amountCents;
  const dirArg = maybe(args.direcao, (v) => oneOf(v, 'direcao', ['entrada', 'saida'] as const));
  const direction = dirArg === null ? existing.direction : dirArg === 'entrada' ? 'in' : 'out';
  const title = maybe(args.titulo, (v) => text(v, 'titulo')) ?? existing.title;
  const category = args.categoria == null ? existing.category : categoryName(ledger, args.categoria);
  const account = args.conta_id == null
    ? (ledger.accounts.find((a) => a.id === existing.accountId) ?? fail('a conta deste lançamento não existe mais.'))
    : accountFor(ledger, args.conta_id, { card: true });
  const date = maybe(args.data, (v) => day(v, 'data')) ?? existing.date;
  if (date > env.today) fail('data: um lançamento não pode ser no futuro.');
  const hour = args.hora == null ? existing.time : time(args.hora);

  const next: Entry = {
    ...existing,
    amountCents: amount,
    direction,
    title,
    category,
    accountId: account.id,
    date,
    time: hour,
    // Same pin `lançar` applies: a settlement recorded before `settlesDate` existed is keyed by its
    // own date, and moving that date on a plain edit would hand the occurrence back to the
    // projection — the month would show the same money twice.
    settlesDate: existing.settlesDate ?? (existing.seriesId ? existing.date : null),
  };

  const lines: PlanLine[] = [L('Lançamento', existing.title)];
  if (amount !== existing.amountCents || direction !== existing.direction) {
    lines.push(L('Valor', arrow(brl(existing.amountCents), brl(amount)), { tone: money(amount, direction), mono: true }));
  }
  if (direction !== existing.direction) lines.push(L('Tipo', arrow(dir(existing.direction), dir(direction))));
  if (title !== existing.title) lines.push(L('Descrição', arrow(existing.title, title)));
  if (category !== existing.category) lines.push(L('Categoria', arrow(existing.category, category)));
  if (account.id !== existing.accountId) lines.push(L('Conta', arrow(accountName(ledger, existing.accountId), account.name)));
  if (date !== existing.date) lines.push(L('Data', arrow(dayLabel(existing.date), dayLabel(date)), { mono: true }));
  if (hour !== existing.time) lines.push(L('Hora', arrow(existing.time ?? '—', hour ?? '—'), { mono: true }));
  if (lines.length === 1) fail('nada para mudar: os valores pedidos são os atuais.');

  return {
    title: 'Editar lançamento',
    lines,
    destructive: false,
    mutation: { op: 'updateEntry', entry: next },
    done: 'lançamento alterado',
  };
}

function apagarLancamento(ledger: Ledger, args: Args): Plan {
  const e = entryFor(ledger, args.id);
  return {
    title: 'Apagar lançamento',
    lines: [
      L('Lançamento', e.title),
      L('Valor', brl(e.amountCents), { tone: money(e.amountCents, e.direction), mono: true }),
      L('Data', dayLabel(e.date), { mono: true }),
      L('Conta', accountName(ledger, e.accountId)),
    ],
    destructive: true,
    note: e.seriesId ? 'Ele pagava uma recorrência: a ocorrência volta a aparecer como em aberto.' : undefined,
    mutation: { op: 'deleteEntry', id: e.id },
    done: 'lançamento apagado',
  };
}

/**
 * Where a new rule starts, when the owner did not say.
 *
 * The rule `recorrencia.tsx` uses on creation, verbatim: a debt with installments already paid
 * started that many months ago, because installment numbers are read off the calendar from here.
 */
function startFor(isDebt: boolean, paid: number, today: string): string {
  if (!isDebt || paid <= 0) return today;
  return dayKey(startOfMonth(subMonths(parseDay(today), paid)));
}

function debtLines(s: Series): PlanLine[] {
  const total = s.totalCount ?? 0;
  const left = Math.max(0, total - s.paidCount);
  // Read the way `debtStatus` reads it: installment n falls n−1 months after the first installment,
  // which is the start's month only when the start is on or before the due day.
  const first = monthOf(firstInstallment(s));
  const finishes = dayKey(addMonths(parseDay(firstInstallment(s)), total - 1));
  return [
    L('Parcela', brl(s.amountCents), { tone: money(s.amountCents, s.direction), mono: true }),
    L('Parcelas', `${total} · ${s.paidCount} já ${s.direction === 'in' ? 'recebidas' : 'pagas'}`, { mono: true }),
    L('Total', brl(total * s.amountCents), { mono: true }),
    L('Ainda falta', brl(left * s.amountCents), { tone: money(left * s.amountCents, s.direction), mono: true }),
    L('Vence todo dia', String(s.dayOfMonth), { mono: true }),
    L('Parcela 1', monthLabel(first), { mono: true }),
    L('Última parcela', monthLabel(monthOf(finishes)), { mono: true }),
  ];
}

function criarRecorrencia(ledger: Ledger, args: Args, env: Env): Plan {
  const tipo = oneOf(args.tipo, 'tipo', ['entrada', 'saida', 'divida_a_pagar', 'divida_a_receber'] as const);
  const isDebt = tipo.startsWith('divida');
  const title = text(args.titulo, 'titulo');
  const category = categoryName(ledger, args.categoria);
  const amount = cents(args.valor_centavos, 'valor_centavos');
  const dayOfMonth = int(args.dia_do_mes, 'dia_do_mes', 1, 31);
  const account = accountFor(ledger, args.conta_id, { card: true });
  const total = isDebt ? int(args.total_parcelas, 'total_parcelas', 1, 480) : null;
  if (!isDebt && args.total_parcelas != null) fail('total_parcelas: só existe em dívidas.');
  const paid = isDebt ? (maybe(args.parcelas_pagas, (v) => int(v, 'parcelas_pagas', 0, total as number)) ?? 0) : 0;
  const first = maybe(args.mes_primeira_parcela, (v) => month(v, 'mes_primeira_parcela'));
  const counterparty = isDebt ? maybe(args.contraparte, (v) => text(v, 'contraparte', 80)) : null;

  const series: Series = {
    id: env.newId(),
    kind: isDebt ? 'debt' : tipo === 'entrada' ? 'inflow' : 'outflow',
    title,
    category,
    accountId: account.id,
    amountCents: amount,
    direction: tipo === 'entrada' || tipo === 'divida_a_receber' ? 'in' : 'out',
    dayOfMonth,
    startDate: first ? monthStart(first) : startFor(isDebt, paid, env.today),
    endDate: null,
    totalCount: total,
    paidCount: paid,
    counterparty,
    linkedShareToken: null,
  };

  const lines: PlanLine[] = [L('Tipo', KIND_LABEL[tipo] as string), L('Nome', title)];
  if (counterparty) lines.push(L(series.direction === 'in' ? 'Quem paga' : 'Com quem', counterparty));
  if (isDebt) {
    lines.push(...debtLines(series));
  } else {
    lines.push(
      L('Valor por mês', brl(amount), { tone: money(amount, series.direction), mono: true }),
      L('Todo dia', String(dayOfMonth), { mono: true }),
      L('Nos próximos 12 meses', brl(commitmentFor(series, env.today).yearCents), { mono: true }),
      L('Começa', first ? monthLabel(first) : dayLabel(series.startDate), { mono: true }),
    );
  }
  lines.push(L('Categoria', category), accountLine(account));

  return {
    title: isDebt ? (series.direction === 'in' ? 'Criar valor a receber' : 'Criar dívida') : 'Criar recorrência',
    lines,
    destructive: false,
    mutation: { op: 'insertSeries', series },
    done: `recorrência criada (id ${series.id})`,
  };
}

function editarRecorrencia(ledger: Ledger, args: Args): Plan {
  const s = seriesFor(ledger, args.id);
  const isDebt = s.kind === 'debt';
  if (!isDebt && (args.total_parcelas != null || args.parcelas_pagas != null || args.contraparte != null)) {
    fail('parcelas e contraparte só existem em dívidas.');
  }
  const total = isDebt ? (maybe(args.total_parcelas, (v) => int(v, 'total_parcelas', 1, 480)) ?? s.totalCount) : s.totalCount;
  const paid = isDebt ? (maybe(args.parcelas_pagas, (v) => int(v, 'parcelas_pagas', 0, 480)) ?? s.paidCount) : s.paidCount;
  if (isDebt && total != null && paid > total) fail('parcelas_pagas não pode passar do total.');

  const next: Series = {
    ...s,
    title: maybe(args.titulo, (v) => text(v, 'titulo')) ?? s.title,
    category: args.categoria == null ? s.category : categoryName(ledger, args.categoria),
    amountCents: maybe(args.valor_centavos, (v) => cents(v, 'valor_centavos')) ?? s.amountCents,
    dayOfMonth: maybe(args.dia_do_mes, (v) => int(v, 'dia_do_mes', 1, 31)) ?? s.dayOfMonth,
    accountId: args.conta_id == null ? s.accountId : accountFor(ledger, args.conta_id, { card: true }).id,
    totalCount: total,
    paidCount: paid,
    counterparty: isDebt ? (maybe(args.contraparte, (v) => text(v, 'contraparte', 80)) ?? s.counterparty) : s.counterparty,
  };

  const lines: PlanLine[] = [L('Recorrência', s.title)];
  if (next.title !== s.title) lines.push(L('Nome', arrow(s.title, next.title)));
  if (next.amountCents !== s.amountCents) lines.push(L(isDebt ? 'Parcela' : 'Valor', arrow(brl(s.amountCents), brl(next.amountCents)), { tone: money(next.amountCents, s.direction), mono: true }));
  if (next.dayOfMonth !== s.dayOfMonth) lines.push(L('Dia', arrow(String(s.dayOfMonth), String(next.dayOfMonth)), { mono: true }));
  if (next.category !== s.category) lines.push(L('Categoria', arrow(s.category, next.category)));
  if (next.accountId !== s.accountId) lines.push(L('Conta', arrow(accountName(ledger, s.accountId), accountName(ledger, next.accountId))));
  if (next.totalCount !== s.totalCount) lines.push(L('Parcelas', arrow(String(s.totalCount), String(next.totalCount)), { mono: true }));
  if (next.paidCount !== s.paidCount) lines.push(L('Já pagas', arrow(String(s.paidCount), String(next.paidCount)), { mono: true }));
  if (next.counterparty !== s.counterparty) lines.push(L('Com quem', arrow(s.counterparty ?? '—', next.counterparty ?? '—')));
  if (lines.length === 1) fail('nada para mudar: os valores pedidos são os atuais.');

  return {
    title: 'Editar recorrência',
    lines,
    destructive: false,
    note: 'Vale para as próximas ocorrências; o que já foi lançado não muda.',
    mutation: { op: 'updateSeries', series: next },
    done: 'recorrência alterada',
  };
}

function apagarRecorrencia(ledger: Ledger, args: Args): Plan {
  const s = seriesFor(ledger, args.id);
  const recorded = ledger.entries.filter((e) => e.seriesId === s.id).length;
  return {
    title: 'Apagar recorrência',
    lines: [
      L('Recorrência', s.title),
      L('Tipo', KIND_LABEL[kindOf(s)] as string),
      L(s.kind === 'debt' ? 'Parcela' : 'Valor', brl(s.amountCents), { tone: money(s.amountCents, s.direction), mono: true }),
    ],
    destructive: true,
    note: recorded > 0
      ? `As previsões e adiamentos somem. ${recorded} ${recorded === 1 ? 'lançamento já feito fica' : 'lançamentos já feitos ficam'} no razão.`
      : 'As previsões e adiamentos dela somem.',
    mutation: { op: 'deleteSeries', id: s.id },
    done: 'recorrência apagada',
  };
}

/** The one occurrence of `s` whose identity is month `m`, or a sentence saying there is none. */
function occurrenceIn(s: Series, m: string): Occurrence {
  return occurrences(s, monthStart(m), monthEnd(m))[0] ?? fail(`${s.title} não tem ocorrência em ${monthLabel(m)}.`);
}

function adiarParcela(ledger: Ledger, args: Args): Plan {
  // A statement's due day is the card's contract, not a rule the owner wrote — there is nothing here
  // to move. Paying part of it now is the honest version of "empurrar a fatura".
  if (typeof args.recorrencia_id === 'string' && isStatementSeries(args.recorrencia_id)) {
    fail('fatura de cartão não se adia: o vencimento é do contrato do cartão. Para pagar só uma parte agora, use `registrar_pagamento` com valor menor.');
  }
  const s = seriesFor(ledger, args.recorrencia_id);
  const m = month(args.mes, 'mes');
  const o = occurrenceIn(s, m);
  if (settled(ledger.entries).has(occurrenceKey(s.id, o.date))) fail('essa ocorrência já foi paga; não há o que adiar.');
  const current = ledger.deferrals.find((d) => d.seriesId === s.id && d.month === m) ?? null;
  const to = maybe(args.para, (v) => day(v, 'para'));
  const what = o.installment ? `parcela ${o.installment.n}/${o.installment.of}` : monthLabel(m);

  if (to === null) {
    if (!current) fail('essa ocorrência não está adiada.');
    return {
      title: 'Desfazer adiamento',
      lines: [L('Recorrência', s.title), L('Ocorrência', what), L('Volta para', dayLabel(o.date), { mono: true })],
      destructive: false,
      mutation: { op: 'defer', seriesId: s.id, month: m, to: null },
      done: `adiamento desfeito; volta a vencer em ${o.date}`,
    };
  }
  // `landsOn` reads a day at or before the original as no deferral at all — refusing it here keeps
  // the card from promising a move the engine would silently ignore.
  if (to <= o.date) fail(`para: precisa ser depois do vencimento original (${o.date}).`);
  if (differenceInCalendarDays(parseDay(to), parseDay(o.date)) > 366) fail('para: no máximo um ano depois do vencimento.');

  const lines = [
    L('Recorrência', s.title),
    L('Ocorrência', what),
    L('Valor', brl(o.amountCents), { tone: money(o.amountCents, o.direction), mono: true }),
    L('Vencia', dayLabel(o.date), { mono: true }),
  ];
  if (current) lines.push(L('Já adiada para', dayLabel(current.to), { mono: true }));
  lines.push(L('Passa para', dayLabel(to), { mono: true }));
  return {
    title: 'Adiar ocorrência',
    lines,
    destructive: false,
    note: 'Só esta ocorrência muda de dia; a regra continua igual.',
    mutation: { op: 'defer', seriesId: s.id, month: m, to },
    done: `${what} de ${s.title} adiada para ${to}`,
  };
}

function registrarPagamento(ledger: Ledger, args: Args, env: Env): Plan {
  if (typeof args.recorrencia_id === 'string' && isStatementSeries(args.recorrencia_id)) {
    return pagarFatura(ledger, args.recorrencia_id, args, env);
  }
  const s = seriesFor(ledger, args.recorrencia_id);
  const deferrals = deferralMap(ledger.deferrals);
  const m = maybe(args.mes, (v) => month(v, 'mes'));
  let o: Occurrence;
  if (m === null) {
    o = nextOpen(s, ledger.entries, env.today, deferrals) ?? fail(`${s.title} não tem nenhuma ocorrência em aberto.`);
  } else {
    o = occurrenceIn(s, m);
    if (settled(ledger.entries).has(occurrenceKey(s.id, o.date))) fail(`a ocorrência de ${monthLabel(m)} já foi registrada.`);
  }
  const amount = maybe(args.valor_centavos, (v) => cents(v, 'valor_centavos')) ?? s.amountCents;
  // Where the settlement lands when nobody said: the rule's own account — unless that is a card,
  // where money cannot arrive. Then the first conta, which is `recorrencia.tsx`'s choice too.
  const account = args.conta_id != null
    ? accountFor(ledger, args.conta_id, { card: true })
    : (() => {
        const own = ledger.accounts.find((a) => a.id === s.accountId);
        if (own && own.kind !== 'card') return own;
        return holdingOf(ledger)[0] ?? fail('não há nenhuma conta para registrar o pagamento.');
      })();

  const what = o.installment ? `Parcela ${o.installment.n}/${o.installment.of}` : monthLabel(monthOf(o.date));
  const incoming = s.direction === 'in';
  return {
    title: incoming ? 'Registrar recebimento' : 'Registrar pagamento',
    lines: [
      L('Recorrência', s.title),
      L('Ocorrência', what),
      L('Valor', brl(amount), { tone: money(amount, s.direction), mono: true }),
      L('Vencimento', dayLabel(o.on), { mono: true }),
      L(incoming ? 'Entra em' : 'Sai de', account.name),
      L('Data do lançamento', `hoje, ${dayLabel(env.today)}`, { mono: true }),
    ],
    destructive: false,
    note: amount !== s.amountCents ? `A regra continua em ${brl(s.amountCents)}; só esta ocorrência é registrada com outro valor.` : undefined,
    mutation: {
      op: 'settle',
      seriesId: s.id,
      scheduled: o.date,
      entry: {
        id: env.newId(),
        date: env.today,
        time: null,
        amountCents: amount,
        direction: s.direction,
        title: s.title,
        category: s.category,
        accountId: account.id,
      },
    },
    done: `${what} de ${s.title} registrada como ${incoming ? 'recebida' : 'paga'}`,
  };
}

/**
 * "Paguei a fatura do Nubank."
 *
 * The same settlement `lançar` writes when the owner taps a projected statement: one entry on a
 * conta, carrying the statement's id and due date, through the same `settleOccurrence`. The
 * statement is the one `statementForecast` projects — so the figure on the card is the figure the
 * Home shows — and a payment below it leaves the rest projected on the same day.
 */
function pagarFatura(ledger: Ledger, id: string, args: Args, env: Env): Plan {
  const card = ledger.accounts.find((a) => a.kind === 'card' && statementSeriesId(a.id) === id)
    ?? fail(`fatura ${id} não existe; consulte \`resumo\` ou \`previstos\`.`);
  const m = maybe(args.mes, (v) => month(v, 'mes'));
  const open = statementForecast(ledger.accounts, ledger.entries, env.today).filter((s) => s.id === id);
  const s = (m === null ? open[0] : open.find((o) => monthOf(o.startDate) === m))
    ?? fail(m === null
      ? `${card.name} não tem fatura em aberto.`
      : `a fatura de ${card.name} que vence em ${monthLabel(m)} não está em aberto (paga, sem compras ou já vencida).`);
  const due = s.startDate;
  const amount = maybe(args.valor_centavos, (v) => cents(v, 'valor_centavos')) ?? s.amountCents;
  const account = args.conta_id != null
    ? accountFor(ledger, args.conta_id, { card: false })
    : ledger.accounts.find((a) => a.id === s.accountId) ?? fail('não há nenhuma conta para pagar a fatura.');

  return {
    title: 'Pagar fatura',
    lines: [
      L('Fatura', s.title),
      L('Vencimento', dayLabel(due), { mono: true }),
      L('Valor', brl(amount), { tone: money(amount, 'out'), mono: true }),
      L('Sai de', account.name),
      L('Data do lançamento', `hoje, ${dayLabel(env.today)}`, { mono: true }),
    ],
    destructive: false,
    note: amount < s.amountCents
      ? `Pagamento parcial: ${brl(s.amountCents - amount)} continuam previstos para ${dayLabel(due)}.`
      : 'Não conta como gasto: as compras do cartão já contaram.',
    mutation: {
      op: 'settle',
      seriesId: id,
      scheduled: due,
      entry: {
        id: env.newId(),
        date: env.today,
        time: null,
        amountCents: amount,
        direction: 'out',
        title: s.title,
        category: s.category,
        accountId: account.id,
      },
    },
    done: `${s.title} de ${monthLabel(monthOf(due))} registrada como paga (${brl(amount)})`,
  };
}

/**
 * "Coloca meu novo saldo."
 *
 * The contas screen sets a conta's balance through `openingCents`; this does the same and nothing
 * else, so no lançamento is invented to explain the difference. The opening figure is solved for, so
 * that `balanceToday` — the figure on the Home and on Contas — reads exactly what the owner said.
 */
function definirSaldo(ledger: Ledger, args: Args, env: Env): Plan {
  const account = accountFor(ledger, args.conta_id, { card: false });
  const target = cents(args.saldo_centavos, 'saldo_centavos', { min: -MAX_CENTS });
  const current = balanceToday([account], ledger.entries, env.today);
  if (current === target) fail(`o saldo de ${account.name} já é ${brl(target)}.`);
  return {
    title: 'Atualizar saldo',
    lines: [
      L('Conta', account.name),
      L('Saldo hoje', arrow(brl(current), brl(target)), { tone: target < 0 ? 'negative' : undefined, mono: true }),
      L('Diferença', brl(target - current), { tone: target - current < 0 ? 'negative' : 'positive', mono: true }),
    ],
    destructive: false,
    note: 'Ajusta o saldo da conta sem criar lançamento — como editar o saldo em Contas.',
    mutation: { op: 'updateAccount', account: { ...account, openingCents: openingFor(account, current, target) } },
    done: `saldo de ${account.name} agora é ${brl(target)}`,
  };
}

function criarConta(ledger: Ledger, args: Args, env: Env): Plan {
  const name = text(args.nome, 'nome', 40);
  const tipo = oneOf(args.tipo, 'tipo', ['corrente', 'poupanca', 'cartao'] as const);
  const card = tipo === 'cartao';
  if (ledger.accounts.some((a) => sameName(a.name, name))) fail(`já existe uma conta chamada ${name}.`);
  const closingDay = card ? int(args.dia_fechamento, 'dia_fechamento', 1, 31) : null;
  const dueDay = card ? int(args.dia_vencimento, 'dia_vencimento', 1, 31) : null;
  const limitCents = card ? maybe(args.limite_centavos, (v) => cents(v, 'limite_centavos')) : null;
  const opening = card ? 0 : (maybe(args.saldo_inicial_centavos, (v) => cents(v, 'saldo_inicial_centavos', { min: -MAX_CENTS })) ?? 0);
  if (!card && (args.dia_fechamento != null || args.dia_vencimento != null || args.limite_centavos != null)) {
    fail('fechamento, vencimento e limite só existem em cartões.');
  }

  const account: Account = {
    id: env.newId(),
    name,
    kind: card ? 'card' : tipo === 'poupanca' ? 'savings' : 'checking',
    openingCents: opening,
    closingDay,
    dueDay,
    limitCents,
  };
  const lines = [L('Nome', name), L('Tipo', card ? 'Cartão de crédito' : tipo === 'poupanca' ? 'Poupança' : 'Conta corrente')];
  if (card) {
    lines.push(L('Fecha todo dia', String(closingDay), { mono: true }), L('Vence todo dia', String(dueDay), { mono: true }));
    if (limitCents != null) lines.push(L('Limite', brl(limitCents), { mono: true }));
  } else {
    lines.push(L('Saldo hoje', brl(opening), { tone: opening < 0 ? 'negative' : undefined, mono: true }));
  }
  return {
    title: card ? 'Criar cartão' : 'Criar conta',
    lines,
    destructive: false,
    mutation: { op: 'insertAccount', account },
    done: `${card ? 'cartão' : 'conta'} criada (id ${account.id})`,
  };
}

function editarConta(ledger: Ledger, args: Args): Plan {
  const a = accountFor(ledger, text(args.id, 'id', 80), { card: true });
  const card = a.kind === 'card';
  if (!card && (args.dia_fechamento != null || args.dia_vencimento != null || args.limite_centavos != null)) {
    fail('fechamento, vencimento e limite só existem em cartões.');
  }
  const name = maybe(args.nome, (v) => text(v, 'nome', 40)) ?? a.name;
  if (name !== a.name && ledger.accounts.some((x) => x.id !== a.id && sameName(x.name, name))) fail(`já existe uma conta chamada ${name}.`);
  const next: Account = {
    ...a,
    name,
    closingDay: maybe(args.dia_fechamento, (v) => int(v, 'dia_fechamento', 1, 31)) ?? a.closingDay,
    dueDay: maybe(args.dia_vencimento, (v) => int(v, 'dia_vencimento', 1, 31)) ?? a.dueDay,
    limitCents: maybe(args.limite_centavos, (v) => cents(v, 'limite_centavos')) ?? a.limitCents,
  };
  const lines: PlanLine[] = [L(card ? 'Cartão' : 'Conta', a.name)];
  if (next.name !== a.name) lines.push(L('Nome', arrow(a.name, next.name)));
  if (next.closingDay !== a.closingDay) lines.push(L('Fechamento', arrow(String(a.closingDay ?? '—'), String(next.closingDay)), { mono: true }));
  if (next.dueDay !== a.dueDay) lines.push(L('Vencimento', arrow(String(a.dueDay ?? '—'), String(next.dueDay)), { mono: true }));
  if (next.limitCents !== a.limitCents) lines.push(L('Limite', arrow(a.limitCents == null ? '—' : brl(a.limitCents), brl(next.limitCents as number)), { mono: true }));
  if (lines.length === 1) fail('nada para mudar: os valores pedidos são os atuais.');
  return {
    title: card ? 'Editar cartão' : 'Editar conta',
    lines,
    destructive: false,
    mutation: { op: 'updateAccount', account: next },
    done: `${card ? 'cartão' : 'conta'} alterada`,
  };
}

function apagarConta(ledger: Ledger, args: Args, env: Env): Plan {
  const a = accountFor(ledger, text(args.id, 'id', 80), { card: true });
  // The same refusal Contas makes: the last conta that holds money is where `lançar` books to.
  if (a.kind !== 'card' && holdingOf(ledger).length <= 1) {
    fail('esta é a única conta que guarda dinheiro; o app não deixa apagá-la. Crie outra antes.');
  }
  const entries = ledger.entries.filter((e) => e.accountId === a.id).length;
  const rules = ledger.series.filter((s) => s.accountId === a.id).length;
  const lines = [L(a.kind === 'card' ? 'Cartão' : 'Conta', a.name)];
  if (a.kind !== 'card') lines.push(L('Saldo hoje', brl(balanceToday([a], ledger.entries, env.today)), { mono: true }));
  return {
    title: a.kind === 'card' ? 'Apagar cartão' : 'Apagar conta',
    lines,
    destructive: true,
    note: `Apaga junto ${entries} ${entries === 1 ? 'lançamento' : 'lançamentos'} e ${rules} ${rules === 1 ? 'recorrência' : 'recorrências'}. Não dá para desfazer; o app pede sua biometria.`,
    mutation: { op: 'deleteAccount', id: a.id, name: a.name },
    done: `${a.kind === 'card' ? 'cartão' : 'conta'} ${a.name} apagada`,
  };
}

function definirTeto(ledger: Ledger, args: Args): Plan {
  const category = categoryName(ledger, args.categoria);
  const capCents = cents(args.teto_centavos, 'teto_centavos', { min: 0 });
  const current = ledger.caps.find((c) => sameName(c.category, category)) ?? null;
  if (capCents === 0 && !current) fail(`${category} não tem teto.`);
  if (current && current.capCents === capCents) fail(`o teto de ${category} já é ${brl(capCents)}.`);
  return {
    title: capCents === 0 ? 'Remover teto' : current ? 'Mudar teto' : 'Criar teto',
    lines: [
      L('Categoria', current?.category ?? category),
      L('Teto por mês', arrow(current ? brl(current.capCents) : 'sem teto', capCents === 0 ? 'sem teto' : brl(capCents)), { mono: true }),
    ],
    destructive: false,
    mutation: { op: 'setCap', category: current?.category ?? category, capCents },
    done: capCents === 0 ? `teto de ${category} removido` : `teto de ${category} agora é ${brl(capCents)} por mês`,
  };
}

function editarCategoria(ledger: Ledger, args: Args): Plan {
  const wanted = text(args.nome, 'nome');
  const views = categoryViews(ledger.categories, ledger.caps, ledger.entries, ledger.series);
  const from = views.find((v) => sameName(v.name, wanted))?.name ?? fail(`categoria ${wanted} não existe.`);
  const to = maybe(args.novo_nome, (v) => text(v, 'novo_nome')) ?? from;
  // A rename onto another existing name would merge two categories in one tap — a different act,
  // and one that cannot be undone by renaming back. Refused rather than performed by accident.
  if (!sameName(to, from) && views.some((v) => sameName(v.name, to))) fail(`já existe a categoria ${to}; renomear juntaria as duas.`);
  const stored = ledger.categories.find((c) => sameName(c.name, from));
  const description = args.descricao == null ? (stored?.description ?? null) : text(args.descricao, 'descricao', 200);
  const lines: PlanLine[] = [L('Categoria', from)];
  if (to !== from) lines.push(L('Nome', arrow(from, to)));
  if (description !== (stored?.description ?? null)) lines.push(L('Descrição', description ?? '—'));
  if (lines.length === 1) fail('nada para mudar.');
  return {
    title: 'Editar categoria',
    lines,
    destructive: false,
    note: to !== from ? 'O novo nome vale para todos os lançamentos, regras e tetos dessa categoria.' : undefined,
    mutation: { op: 'category', from, to, look: { ...lookFor(from, ledger.categories), description } },
    done: to !== from ? `categoria ${from} agora se chama ${to}` : `descrição de ${from} atualizada`,
  };
}

export const WRITES = [
  'criar_lancamento', 'editar_lancamento', 'apagar_lancamento',
  'criar_recorrencia', 'editar_recorrencia', 'apagar_recorrencia',
  'adiar_parcela', 'registrar_pagamento', 'definir_saldo',
  'criar_conta', 'editar_conta', 'apagar_conta',
  'definir_teto', 'editar_categoria',
] as const;

export function planWrite(name: string, args: Args, ledger: Ledger, env: Env): PlanResult {
  try {
    switch (name) {
      case 'criar_lancamento': return { ok: true, plan: criarLancamento(ledger, args, env) };
      case 'editar_lancamento': return { ok: true, plan: editarLancamento(ledger, args, env) };
      case 'apagar_lancamento': return { ok: true, plan: apagarLancamento(ledger, args) };
      case 'criar_recorrencia': return { ok: true, plan: criarRecorrencia(ledger, args, env) };
      case 'editar_recorrencia': return { ok: true, plan: editarRecorrencia(ledger, args) };
      case 'apagar_recorrencia': return { ok: true, plan: apagarRecorrencia(ledger, args) };
      case 'adiar_parcela': return { ok: true, plan: adiarParcela(ledger, args) };
      case 'registrar_pagamento': return { ok: true, plan: registrarPagamento(ledger, args, env) };
      case 'definir_saldo': return { ok: true, plan: definirSaldo(ledger, args, env) };
      case 'criar_conta': return { ok: true, plan: criarConta(ledger, args, env) };
      case 'editar_conta': return { ok: true, plan: editarConta(ledger, args) };
      case 'apagar_conta': return { ok: true, plan: apagarConta(ledger, args, env) };
      case 'definir_teto': return { ok: true, plan: definirTeto(ledger, args) };
      case 'editar_categoria': return { ok: true, plan: editarCategoria(ledger, args) };
      default: return { ok: false, error: `ferramenta desconhecida: ${name}.` };
    }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

/** Arguments arrive as a JSON string. A string that will not parse is the model's error, said back. */
export function parseArgs(raw: string): Args | null {
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Args) : null;
  } catch {
    return null;
  }
}
