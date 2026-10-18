import { addDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { pickerOrder } from '@/domain/category';
import { dayKey, parseDay } from '@/domain/projection';
import type { Category } from '@/domain/category';
import type { Direction, Entry, Series } from '@/domain/model';

/**
 * The small decisions the forms make before anything is written — kept out of the components so
 * they can be checked without rendering a screen (`tools/forms-check.mjs`). Nothing here reads or
 * writes the ledger; every function is a pure reading of what it is handed.
 */

const keyOf = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

/**
 * Seeds whose meaning is money coming in. A seed has no history to learn a direction from, so the
 * one that is unambiguous says so here — "Renda" offered first on a Saída was the audit's example of
 * a picker that does not listen.
 */
const INFLOW_SEEDS = new Set(['renda']);

/**
 * The category picker for one direction.
 *
 * Same vocabulary as `pickerOrder` — nothing is merged, renamed or hidden — in an order that
 * listens to which way the money is going:
 *
 *  1. names the owner has used in *this* direction, most used first;
 *  2. names with no history either way (authored or seeded), in `pickerOrder`'s order;
 *  3. names only ever used the *other* way, last.
 *
 * Demoted rather than removed, on purpose. "Venda" on a Saída is unusual, not impossible — a refund
 * of a sale is an outflow — and a picker that drops a name forces the owner to retype it, which
 * risks the near-duplicate the audit already found too many of.
 */
export function categoryOrderFor(
  direction: Direction,
  entries: Entry[],
  series: Series[],
  categories: Category[],
): string[] {
  const same = (x: { direction: Direction }) => x.direction === direction;
  const all = pickerOrder(entries, series, categories);
  const mine = pickerOrder(entries.filter(same), series.filter(same), categories);

  const used = new Set([...entries, ...series].filter(same).map((x) => keyOf(x.category)));
  const other = new Set(
    [...entries, ...series].filter((x) => !same(x)).map((x) => keyOf(x.category)),
  );
  for (const seed of INFLOW_SEEDS) (direction === 'in' ? used : other).add(seed);

  const first = mine.filter((n) => used.has(keyOf(n)));
  const firstKeys = new Set(first.map(keyOf));
  // Seeds promoted by direction are not in `mine`'s used block (no history), so they join here.
  for (const n of all) {
    if (!firstKeys.has(keyOf(n)) && used.has(keyOf(n))) {
      first.push(n);
      firstKeys.add(keyOf(n));
    }
  }
  const rest = all.filter((n) => !firstKeys.has(keyOf(n)));
  return [
    ...first,
    ...rest.filter((n) => !other.has(keyOf(n))),
    ...rest.filter((n) => other.has(keyOf(n))),
  ];
}

/** Ceiling for any typed figure: R$ 999.999,99, the most the layouts can hold. Same as lançar's. */
export const MAX_CENTS = 99_999_999;

/**
 * A money field's text, read the way the lançar keypad reads its keys: every digit pushes in from
 * the right as centavos, and the separators place themselves.
 *
 * `previous` is what the field showed before this keystroke. It is only consulted for one case —
 * the field holding all zeros and losing a character — which is the owner deleting their way back
 * to nothing. Without it, "0,00" minus one character is "0,0", still zero, and the field could
 * never be emptied again; with it, deleting from zero clears, while typing a zero keeps a real
 * R$ 0,00 (which "Saldo hoje" needs to be able to say).
 */
export function centsFromTyped(text: string, previous: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (digits === '') return null;
  const n = Number(digits);
  if (n === 0 && text.length < previous.length) return null;
  return Math.min(MAX_CENTS, n);
}

/** Cents as the field shows them: grouped reais, comma, two centavos. Negative shows nothing. */
export function typedFromCents(cents: number | null): string {
  if (cents === null || cents < 0) return '';
  const whole = Math.floor(cents / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${whole},${String(cents % 100).padStart(2, '0')}`;
}

/**
 * Where "Adiar esta parcela" may send one occurrence.
 *
 * Counted from whichever is later, today or the day the occurrence currently lands on: an overdue
 * bill pushed "a week" from its old due date could land in the past again and come straight back
 * as overdue, which is not what anyone deferring it meant. Every choice is strictly after the
 * occurrence's own day, which is the one rule `landsOn` enforces — so nothing offered here can be
 * silently ignored by the engine.
 *
 * Three fixed distances rather than a calendar: deferring is a negotiation ("pago semana que vem",
 * "no próximo salário"), and each chip names its exact day so the distance is never a guess.
 */
export function deferChoices(
  occurrence: { date: string; on: string },
  today: string,
): { to: string; label: string; distance: string }[] {
  const base = occurrence.on > today ? occurrence.on : today;
  return [
    { days: 7, distance: 'em 1 semana' },
    { days: 14, distance: 'em 2 semanas' },
    { days: 30, distance: 'em 30 dias' },
  ].map(({ days, distance }) => {
    const to = dayKey(addDays(parseDay(base), days));
    return { to, label: format(parseDay(to), "d 'de' MMM", { locale: ptBR }), distance };
  });
}
