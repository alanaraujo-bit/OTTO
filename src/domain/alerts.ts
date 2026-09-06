import { addDays, endOfMonth, startOfMonth } from 'date-fns';
import { dayKey, monthCurve, parseDay, project } from './projection';
import { settled } from './settlement';
import { statementCycle, statementTotal } from './card';
import { capReadings, type Cap } from './cap';
import type { Account, Entry, Series } from './model';
import { brlShort, type Cents } from './money';

/**
 * What is worth interrupting someone for.
 *
 * The rule this whole module is built on: **OTTO only speaks when it knows something the owner does
 * not.** "O aluguel vence amanhã" is not that — the owner set the rent up, they know when it falls.
 * "Amanhã o aluguel deixa seu saldo negativo em R$ 340" is: it requires the balance, the projection
 * and the arithmetic between them, and there is no way to know it without opening the app.
 *
 * So every alert here carries a **consequence**, not an event. That is also the honest reason there
 * are so few of them. `PRODUCT.md` already says an alert that is always there becomes furniture the
 * owner learns to skip, and a notification that fires every month on the 4th is worse than furniture
 * — it is furniture that vibrates.
 *
 * Everything is derived from the same engine every screen reads, so a notification can never claim a
 * figure the app would contradict when opened.
 */

export type AlertKind = 'trough' | 'statement' | 'tomorrow' | 'cap';

export interface Alert {
  kind: AlertKind;
  /**
   * Stable across recomputations of the same fact, so rescheduling replaces an alert rather than
   * duplicating it. It carries the date and the shape, never the amount — an amount in the id would
   * make a changed figure look like a second, unrelated alert.
   */
  id: string;
  /** Local day it should fire on. */
  date: string;
  title: string;
  body: string;
}

/** How far ahead to look. Beyond a fortnight a forecast is not firm enough to wake someone up for. */
const HORIZON = 14;

/**
 * The one alert this app was built to be able to make.
 *
 * The month dips below zero, and OTTO knows the day and the amount. It fires the day before the
 * trough rather than on it, because the value of knowing is entirely in still having time to act.
 *
 * Only ever one, even if the month dips repeatedly: the first crossing is the one that can still be
 * prevented, and the rest are consequences of it.
 */
function troughAlert(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
): Alert | null {
  const curve = monthCurve(accounts, entries, series, today);
  const limit = dayKey(addDays(parseDay(today), HORIZON));

  const crossing = curve.points.find((p) => !p.actual && p.balance < 0 && p.date <= limit);
  if (!crossing) return null;

  // The day before, unless the crossing is tomorrow or today — a warning that arrives after the
  // thing it warns about is worse than none, so it is never scheduled into the past.
  const eve = dayKey(addDays(parseDay(crossing.date), -1));
  const when = eve > today ? eve : today;

  // What lands on the day it goes under. Naming it turns "you will be short" into something the
  // owner can act on, and the projection already knows.
  const cause = project(series, crossing.date, crossing.date, settled(entries))
    .filter((o) => o.direction === 'out')
    .sort((a, b) => b.amountCents - a.amountCents)[0];

  return {
    kind: 'trough',
    id: `trough:${crossing.date}`,
    date: when,
    title: `Dia ${crossing.day}: seu saldo fica negativo`,
    body: cause
      ? `${cause.title} deixa você em ${brlShort(crossing.balance)}. Ainda dá tempo de mexer nisso.`
      : `Você fica em ${brlShort(crossing.balance)}. Ainda dá tempo de mexer nisso.`,
  };
}

/**
 * The statement, on the day it closes.
 *
 * Not on the due date: by then nothing can be added or removed from it, and the owner is only being
 * told to pay a bill they already know about. On the closing day the figure is still moving, and
 * knowing it is the difference between a purchase that lands this month and one that waits.
 */
function statementAlerts(
  accounts: Account[],
  entries: Entry[],
  today: string,
): Alert[] {
  const out: Alert[] = [];
  const limit = dayKey(addDays(parseDay(today), HORIZON));

  for (const card of accounts.filter((a) => a.kind === 'card')) {
    const cycle = statementCycle(card, today);
    if (!cycle || cycle.closed || cycle.closes > limit) continue;

    const used = statementTotal(entries, card, cycle);
    if (used <= 0) continue;

    out.push({
      kind: 'statement',
      id: `statement:${card.id}:${cycle.closes}`,
      date: cycle.closes,
      title: `${card.name} fecha hoje`,
      body: `${brlShort(used)} nesta fatura. O que você passar a partir de amanhã cai na próxima.`,
    });
  }
  return out;
}

/** Tomorrow's outgoing commitments, gathered into one useful glance rather than one ping per bill. */
function tomorrowAlert(entries: Entry[], series: Series[], today: string): Alert | null {
  const date = dayKey(addDays(parseDay(today), 1));
  const out = project(series, date, date, settled(entries))
    .filter((item) => item.direction === 'out')
    .sort((a, b) => b.amountCents - a.amountCents);
  if (out.length === 0) return null;

  const total = out.reduce((sum, item) => sum + item.amountCents, 0);
  const names = out.slice(0, 2).map((item) => item.title);
  const remaining = out.length - names.length;
  return {
    kind: 'tomorrow',
    id: `tomorrow:${date}`,
    date,
    title: `Amanhã: ${out.length} ${out.length === 1 ? 'compromisso' : 'compromissos'}`,
    body: `${names.join(' e ')}${remaining > 0 ? ` e mais ${remaining}` : ''} · ${brlShort(total)}.`,
  };
}

/**
 * A ceiling the month is not going to survive.
 *
 * This is the module's own rule applied to a budget: not "você gastou R$ 240 em Alimentação", which
 * the owner can read on any screen, but **"no ritmo de agora você passa dos R$ 300 no dia 22, e
 * ainda faltam 9 dias"** — which needs the spend, the rate, the ceiling and the calendar multiplied
 * together, and cannot be arrived at by looking.
 *
 * Silent unless the pace actually breaks the ceiling before the month ends. A cap that is going to
 * hold is a cap doing its job quietly, and a warning every month about a budget that always survives
 * is the vibrating furniture this file was written against.
 *
 * Dated tomorrow rather than today, and that is not arbitrary. `reschedule` places alerts at 09:00
 * and drops anything already past, so a warning dated today is thrown away every time the owner is
 * looking at their phone in the afternoon — which is most of the time. Tomorrow morning is also
 * simply when it is useful: this is a warning about a month still running, and the action it asks
 * for is about the days ahead.
 */
function capAlerts(
  caps: Cap[],
  entries: Entry[],
  series: Series[],
  today: string,
): Alert[] {
  const t = parseDay(today);
  const tomorrow = dayKey(addDays(t, 1));
  const lastDay = dayKey(endOfMonth(t));
  // A warning dated past the end of the month is a warning about a month that no longer exists.
  if (tomorrow > lastDay) return [];

  const month = today.slice(0, 7);

  return capReadings(caps, entries, series, today)
    .filter((r) => r.burstsOn !== null)
    .map((r) => {
      const through = r.leftCents <= 0;
      return {
        kind: 'cap' as const,
        /*
         * One warning per ceiling per month, and the id says exactly that.
         *
         * The projected burst day moves as the month goes, so putting it in the id would make every
         * recalculation look like a new, unrelated alert. The month is the thing that is actually
         * stable about this warning; the text under it is free to change as the figures do.
         */
        id: `cap:${r.category}:${month}`,
        date: tomorrow,
        title: through
          ? `${r.category} passou do seu teto`
          : `${r.category}: o teto não chega ao fim do mês`,
        body: through
          ? `${brlShort(-r.leftCents)} acima dos ${brlShort(r.capCents)}, e ainda faltam ${r.daysLeft} ${r.daysLeft === 1 ? 'dia' : 'dias'}.`
          : `No ritmo de agora você passa dia ${Number((r.burstsOn as string).slice(8))}. Restam ${brlShort(r.leftCents)} para ${r.daysLeft} ${r.daysLeft === 1 ? 'dia' : 'dias'} — ${brlShort(r.perDayCents)} por dia.`,
      };
    });
}

/**
 * Everything worth saying, soonest first.
 *
 * Deliberately short. Three possible alerts, each of which is silent unless the arithmetic actually
 * produces something — a month that never dips says nothing at all, which is the correct behaviour
 * and the common one.
 */
export function alertsFor(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
  caps: Cap[] = [],
): Alert[] {
  const list: Alert[] = [];

  const trough = troughAlert(accounts, entries, series, today);
  if (trough) list.push(trough);
  list.push(...statementAlerts(accounts, entries, today));
  list.push(...capAlerts(caps, entries, series, today));
  const tomorrow = tomorrowAlert(entries, series, today);
  if (tomorrow) list.push(tomorrow);

  return list
    .filter((a) => a.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The month's closing figure, for the summary that fires on the last day. */
export function monthClose(
  accounts: Account[],
  entries: Entry[],
  series: Series[],
  today: string,
): { date: string; net: Cents } {
  const curve = monthCurve(accounts, entries, series, today);
  return {
    date: dayKey(endOfMonth(parseDay(today))),
    net: curve.balanceEnd - curve.balanceStart,
  };
}

/** The first day of the month `today` is in. Exported for the scheduler's window arithmetic. */
export const monthStart = (today: string) => dayKey(startOfMonth(parseDay(today)));
