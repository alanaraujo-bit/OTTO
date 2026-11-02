import { addDays, addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dayKey, monthCurve, overdue, parseDay, project } from './projection';
import { settled } from './settlement';
import { withStatements } from './card';
import { commitments } from './commitments';
import type { Alert } from './alerts';
import type { Account, Deferral, Entry, Occurrence, Series } from './model';
import { brlShort, type Cents } from './money';

/**
 * The rhythm: OTTO speaking first.
 *
 * `alerts.ts` is the alarm — it only speaks when the arithmetic finds a consequence, and in a month
 * that holds it says nothing at all. That stays right for what it covers. But an owner who uses the
 * app every day and is never told anything reads the silence as the app not working, not as the
 * month being fine. "Quando devo me preocupar, quando devo não me preocupar, quando uma conta está
 * chegando" — the second of those is as much information as the first.
 *
 * So this module says the things a person who kept the books for you would say, at the moments they
 * would say them:
 *
 *  - **the evening before something goes out**, with the balance it leaves (one message per day,
 *    never one per bill);
 *  - **the morning money is due to come in**, so its arrival can be recorded;
 *  - **the morning after a bill was missed**, for a few days, because an unrecorded payment is the
 *    one thing that makes every figure in the app wrong;
 *  - **every Monday**, how the week looks — tranquila, apertada or de atenção — and why;
 *  - **the 1st and the last day of the month**, what it starts with and how it ends;
 *  - **once a month, if the month closes in the red**, how much has to come in to close it at zero;
 *  - **after three quiet days**, a nudge to record what was spent.
 *
 * Every figure comes from the same projection every screen reads, so a notification can never claim
 * a number the app contradicts when it is opened. And it is all recomputed — and rescheduled — every
 * time the ledger is read, so paying a bill quietly removes the reminder about it.
 */

/** How far ahead the rhythm is scheduled. Three weeks: a phone left alone still hears from OTTO. */
export const RHYTHM_DAYS = 21;
/** How many days after a missed bill the "já pagou?" keeps asking. After that it is the past. */
const OVERDUE_DAYS = 5;
/** Below this, a week is called apertada even though it never goes negative. */
const TIGHT: Cents = 20000;

export function rhythmFor(
  accounts: Account[],
  entries: Entry[],
  rules: Series[],
  today: string,
  deferrals: Map<string, Deferral>,
): Alert[] {
  const t = parseDay(today);
  const tomorrow = dayKey(addDays(t, 1));
  const until = dayKey(addDays(t, RHYTHM_DAYS));
  // A card's statement is a bill like any other: it goes out, and it can be what makes a week tight.
  const series = withStatements(accounts, entries, rules, today);
  const done = settled(entries);
  const ahead = project(series, tomorrow, until, done, deferrals);
  const balance = balances(accounts, entries, series, today, until, deferrals);

  const out: Alert[] = [];
  out.push(...dueEves(ahead, balance, today));
  out.push(...incomeMornings(ahead));
  out.push(...missed(series, entries, today, deferrals));
  out.push(...weeks(ahead, balance, today, until));
  out.push(...monthEdges(accounts, entries, series, rules, today, until, deferrals));
  const short = shortfall(accounts, entries, series, today, deferrals);
  if (short) out.push(short);
  out.push(nudge(entries, today));

  return out
    .filter((a) => a.date >= today && a.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.hour ?? 9) - (b.hour ?? 9)));
}

/**
 * The closing balance of every day from today to `until`, read off the month curves the screens
 * draw — one per month the window touches, so a week that crosses into next month is still read
 * from the same arithmetic the Home shows when you step to that month.
 */
function balances(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
  until: string,
  deferrals: Map<string, Deferral>,
): Map<string, Cents> {
  const map = new Map<string, Cents>();
  let anchor = startOfMonth(parseDay(today));
  while (dayKey(anchor) <= until) {
    for (const p of monthCurve(accounts, entries, series, today, deferrals, dayKey(anchor)).points) {
      map.set(p.date, p.balance);
    }
    anchor = addMonths(anchor, 1);
  }
  return map;
}

const byDay = (items: Occurrence[]) => {
  const days = new Map<string, Occurrence[]>();
  for (const o of items) days.set(o.on, [...(days.get(o.on) ?? []), o]);
  return days;
};

const named = (o: Occurrence) =>
  o.installment ? `${o.title} (parcela ${o.installment.n}/${o.installment.of})` : o.title;

const list = (names: string[]) =>
  names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;

/**
 * The evening before money goes out: what, how much, and where it leaves the balance. Dated the day
 * before at 18:00 — late enough to be the day's last word, early enough to move money tonight.
 */
function dueEves(ahead: Occurrence[], balance: Map<string, Cents>, today: string): Alert[] {
  const out: Alert[] = [];
  for (const [day, items] of byDay(ahead.filter((o) => o.direction === 'out'))) {
    const eve = dayKey(addDays(parseDay(day), -1));
    if (eve < today) continue;
    const sorted = [...items].sort((a, b) => b.amountCents - a.amountCents);
    const [head] = sorted;
    if (!head) continue;
    const total = sorted.reduce((n, o) => n + o.amountCents, 0);
    const after = balance.get(day);
    const leaves =
      after === undefined
        ? ''
        : after < 0
          ? ` Seu saldo fica negativo: ${brlShort(after)}.`
          : ` Seu saldo fica em ${brlShort(after)}.`;
    const shown = sorted.slice(0, 2).map(named);
    const more = sorted.length - shown.length;
    out.push({
      kind: 'due',
      id: `due:${day}`,
      date: eve,
      hour: 18,
      route: '/calendario',
      params: { date: day },
      title:
        sorted.length === 1
          ? `Amanhã vence: ${head.title}`
          : `Amanhã: ${sorted.length} contas, ${brlShort(total)}`,
      body:
        sorted.length === 1
          ? `${head.installment ? `Parcela ${head.installment.n}/${head.installment.of}: ` : ''}${brlShort(total)} sai amanhã.${leaves}`
          : `${list(more > 0 ? [...shown, `mais ${more}`] : shown)}.${leaves}`,
    });
  }
  return out;
}

/** The morning money is due in, so that when it lands it is recorded and the balance stays true. */
function incomeMornings(ahead: Occurrence[]): Alert[] {
  const out: Alert[] = [];
  for (const [day, items] of byDay(ahead.filter((o) => o.direction === 'in'))) {
    const total = items.reduce((n, o) => n + o.amountCents, 0);
    out.push({
      kind: 'income',
      id: `income:${day}`,
      date: day,
      hour: 9,
      route: '/calendario',
      params: { date: day },
      title: items.length === 1 && items[0] ? `Hoje deve entrar: ${items[0].title}` : `Hoje devem entrar ${items.length} valores`,
      body: `+${brlShort(total)}${items.length > 1 ? ` (${list(items.map((o) => o.title))})` : ''}. Quando cair, lance para o saldo ficar certo.`,
    });
  }
  return out;
}

/**
 * "Já pagou?" — a bill whose day passed with nothing recorded against it.
 *
 * Asked the next morning and for a few mornings after, one message per rule, and it stops the moment
 * the payment is recorded (the reschedule on the next read finds nothing to ask about). An inflow
 * that did not arrive is asked about in its own words: it is not a debt, but the month is still
 * counting on it.
 */
function missed(series: Series[], entries: Entry[], today: string, deferrals: Map<string, Deferral>): Alert[] {
  const tomorrow = dayKey(addDays(parseDay(today), 1));
  const oldest = dayKey(addDays(parseDay(today), -OVERDUE_DAYS));
  return overdue(series, entries, today, deferrals)
    .filter((o) => o.on < today && o.on >= oldest)
    .map((o) => {
      const day = Number(o.on.slice(8));
      return {
        kind: 'overdue' as const,
        id: `overdue:${o.seriesId}:${o.date}`,
        date: tomorrow,
        hour: 9,
        route: '/recorrencia',
        params: { id: o.seriesId },
        title: o.direction === 'out' ? `${o.title} venceu dia ${day}` : `${o.title} ainda não entrou`,
        body:
          o.direction === 'out'
            ? `${brlShort(o.amountCents)} ainda não está no seu razão. Se já pagou, lance para o saldo ficar certo.`
            : `Era para entrar ${brlShort(o.amountCents)} dia ${day}. Se já caiu, lance; se atrasou, o OTTO segue contando com ele.`,
      };
    });
}

/**
 * Monday morning: how the week ahead looks.
 *
 * Three readings, and the quiet one is said too — "semana tranquila" is the message that tells an
 * owner the app is watching even when nothing is wrong. The lowest balance of the week is the figure
 * that decides which reading it is.
 */
function weeks(ahead: Occurrence[], balance: Map<string, Cents>, today: string, until: string): Alert[] {
  const out: Alert[] = [];
  let day = parseDay(today);
  // The next Monday after today (today itself, if it is Monday, is already under way).
  do day = addDays(day, 1);
  while (day.getDay() !== 1);

  for (; dayKey(day) <= until; day = addDays(day, 7)) {
    const from = dayKey(day);
    const to = dayKey(addDays(day, 6));
    const week = ahead.filter((o) => o.on >= from && o.on <= to);
    const leaving = week.filter((o) => o.direction === 'out').reduce((n, o) => n + o.amountCents, 0);
    const coming = week.filter((o) => o.direction === 'in').reduce((n, o) => n + o.amountCents, 0);

    let low: { date: string; cents: Cents } | null = null;
    for (let d = day; dayKey(d) <= to; d = addDays(d, 1)) {
      const cents = balance.get(dayKey(d));
      if (cents !== undefined && (low === null || cents < low.cents)) low = { date: dayKey(d), cents };
    }
    if (!low) continue;
    const weekday = format(parseDay(low.date), 'EEEE', { locale: ptBR }).replace('-feira', '');

    const bills = leaving > 0 ? `${brlShort(leaving)} em contas` : 'nenhuma conta fixa';
    const income = coming > 0 ? ` e ${brlShort(coming)} entrando` : '';
    const [title, body] =
      low.cents < 0
        ? ['Semana de atenção', `O saldo fica negativo na ${weekday} (${brlShort(low.cents)}). Esta semana: ${bills}${income}.`]
        : low.cents < TIGHT
          ? ['Semana apertada', `O saldo chega a ${brlShort(low.cents)} na ${weekday}. Esta semana: ${bills}${income}.`]
          : [
              'Semana tranquila',
              `${cap1(bills)}${income}, e o saldo não fica abaixo de ${brlShort(low.cents)}.`,
            ];
    out.push({ kind: 'week', id: `week:${from}`, date: from, hour: 9, route: '/home', title, body });
  }
  return out;
}

/** The 1st: what the month starts with. The last day: how it ends. */
function monthEdges(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  rules: Series[],
  today: string,
  until: string,
  deferrals: Map<string, Deferral>,
): Alert[] {
  const out: Alert[] = [];
  const t = parseDay(today);

  const last = dayKey(endOfMonth(t));
  if (last >= today && last <= until) {
    const curve = monthCurve(accounts, entries, series, today, deferrals);
    const net = curve.balanceEnd - curve.balanceStart;
    const month = format(t, 'MMMM', { locale: ptBR });
    out.push({
      kind: 'monthClose',
      id: `monthClose:${today.slice(0, 7)}`,
      date: last,
      hour: 20,
      route: '/home',
      title: `${cap1(month)} fecha hoje`,
      body:
        net >= 0
          ? `Se nada mudar, o mês termina com +${brlShort(net)} e saldo de ${brlShort(curve.balanceEnd)}.`
          : `Se nada mudar, o mês termina com ${brlShort(net)} e saldo de ${brlShort(curve.balanceEnd)}.`,
    });
  }

  const first = dayKey(startOfMonth(addMonths(t, 1)));
  if (first <= until) {
    const c = commitments(rules, first);
    const month = format(parseDay(first), 'MMMM', { locale: ptBR });
    if (c.monthlyIn > 0 || c.monthlyOut > 0) {
      out.push({
        kind: 'monthOpen',
        id: `monthOpen:${first.slice(0, 7)}`,
        date: first,
        hour: 9,
        route: '/recorrencias',
        title: `${cap1(month)} começa`,
        body:
          c.free >= 0
            ? `Entram ${brlShort(c.monthlyIn)} em fixas e ${brlShort(c.monthlyOut)} já têm destino. Sobram ${brlShort(c.free)} para o mês.`
            : `As contas fixas (${brlShort(c.monthlyOut)}) passam do que entra (${brlShort(c.monthlyIn)}). Faltam ${brlShort(-c.free)} no mês.`,
      });
    }
  }
  return out;
}

/**
 * The month closes below zero: say how much has to come in, once.
 *
 * Not the trough warning — that one is about a day, and the remedy is moving a bill. This is about
 * the month, and the remedy is money: earn it, or not spend it. Said once per month, the morning
 * after it is first seen.
 */
function shortfall(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
  deferrals: Map<string, Deferral>,
): Alert | null {
  const t = parseDay(today);
  const tomorrow = dayKey(addDays(t, 1));
  if (tomorrow > dayKey(endOfMonth(t))) return null;
  const curve = monthCurve(accounts, entries, series, today, deferrals);
  if (curve.balanceEnd >= 0) return null;
  const month = format(t, 'MMMM', { locale: ptBR });
  const lastDay = Number(dayKey(endOfMonth(t)).slice(8));
  return {
    kind: 'shortfall',
    id: `shortfall:${today.slice(0, 7)}`,
    date: tomorrow,
    hour: 9,
    once: true,
    route: '/home',
    title: `${cap1(month)} fecha no vermelho`,
    body: `No ritmo de agora o mês termina em ${brlShort(curve.balanceEnd)}. Para fechar no zero, precisa entrar ${brlShort(-curve.balanceEnd)} até dia ${lastDay}, ou deixar de gastar isso.`,
  };
}

/**
 * Three quiet days: a nudge to record. Dated from the last thing recorded, and pushed forward every
 * time the ledger is read, so it only ever arrives when the owner really has gone quiet.
 */
function nudge(entries: Entry[], today: string): Alert {
  const last = entries.reduce<string | null>((max, e) => {
    const d = (e.recordedAt ?? e.date).slice(0, 10);
    return max === null || d > max ? d : max;
  }, null);
  const due = last ? dayKey(addDays(parseDay(last), 3)) : today;
  const tomorrow = dayKey(addDays(parseDay(today), 1));
  return {
    kind: 'nudge',
    id: 'nudge',
    date: due > tomorrow ? due : tomorrow,
    hour: 20,
    route: '/lancar',
    title: 'Gastou alguma coisa esses dias?',
    body: 'Faz alguns dias que nada entra no seu razão. Lançar leva cinco segundos e mantém o saldo certo.',
  };
}

const cap1 = (w: string) => w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1);
