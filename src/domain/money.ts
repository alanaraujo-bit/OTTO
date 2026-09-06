/**
 * Money in OTTO is an integer number of centavos. Never a float.
 *
 * `0.1 + 0.2` is the oldest bug in finance software and it is not going to happen in this one. Every
 * amount that crosses a boundary — SQLite, the projection engine, a component prop — is cents.
 */
export type Cents = number;

const NBSP = ' ';

/**
 * BRL, split into the parts the type system sets differently.
 *
 * DESIGN.md: "Currency symbols and cents are set smaller and in tertiary ink, so the magnitude reads
 * first and the precision reads second." That is only possible if the formatter hands back the parts
 * separately, so it does — no string surgery at the call site, and no `Intl` dependency whose
 * grouping and separator choices vary by engine build.
 */
export interface MoneyParts {
  /** '−' for negative, '' otherwise. Minus sign U+2212, not a hyphen: it aligns with the digits. */
  sign: string;
  symbol: string;
  /** Thousands-grouped integer part, no sign. */
  whole: string;
  /** Always two digits. */
  cents: string;
}

export function parts(value: Cents): MoneyParts {
  const negative = value < 0;
  const abs = Math.abs(Math.round(value));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;

  return {
    sign: negative ? '−' : '',
    symbol: 'R$',
    whole: group(whole),
    cents: String(rest).padStart(2, '0'),
  };
}

/** One-line form, for places with no room to set the parts apart. */
export function brl(value: Cents): string {
  const p = parts(value);
  return `${p.sign}${p.symbol}${NBSP}${p.whole},${p.cents}`;
}

/** Rounded to the real, for axis ticks and any label where centavos are noise. */
export function brlShort(value: Cents): string {
  const negative = value < 0;
  const reais = Math.round(Math.abs(value) / 100);
  return `${negative ? '−' : ''}R$${NBSP}${group(reais)}`;
}

/** Signed, for a delta. The sign is always shown, including the plus. */
export function brlDelta(value: Cents): string {
  if (value === 0) return `R$${NBSP}0,00`;
  const p = parts(value);
  return `${value > 0 ? '+' : '−'}${p.symbol}${NBSP}${p.whole},${p.cents}`;
}

function group(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += '.';
    out += s[i];
  }
  return out;
}

/**
 * A reais amount, mid-keystroke — see `MoneyField`.
 *
 * This is a different convention from `lançar`'s own keypad on purpose. That keypad pushes digits in
 * from the right because it is the one control in the app typed dozens of times a day, and a decimal
 * point there costs a layout shift. Every other money field in this app is typed a handful of times
 * ever, through the system keyboard, and a rare field should read the way every other money field on
 * the owner's phone does: digits are the integer part until a comma switches to centavos, and a bare
 * "20" means twenty reais, not twenty centavos.
 */
export interface MoneyDraft {
  /** Digits of the integer part. No leading zeros, except the literal single digit "0". */
  whole: string;
  /** 0–2 digits of the fractional part. Only meaningful once `hasComma` is true. */
  cents: string;
  /** The owner typed a decimal trigger — see `parseMoneyDraft` for which characters count. */
  hasComma: boolean;
}

const EMPTY_DRAFT: MoneyDraft = { whole: '', cents: '', hasComma: false };

/**
 * Reads whatever the field currently holds, from scratch, every keystroke.
 *
 * No cursor bookkeeping: a controlled `TextInput` hands back its whole post-edit string on every
 * change — insert or backspace alike — so re-parsing that string is the entire algorithm.
 *
 * **Both "," and "." trigger the decimal, because this function must only ever be called on text
 * the owner actually typed.** A Brazilian keyboard's decimal key sends ","; some system keyboards
 * send "." regardless of locale, and refusing one of the two is not "inteligente", it is a field
 * that works on some phones and not others. `formatMoneyDraft` inserts "." of its own for thousand
 * grouping — that output must never be fed back through this function, which is why `MoneyField`
 * never shows the grouped form while the field is focused: the two rules only work together as
 * long as the ambiguous character never appears in a live buffer this function will re-read.
 */
export function parseMoneyDraft(raw: string): MoneyDraft {
  let whole = '';
  let cents = '';
  let hasComma = false;
  for (const ch of raw) {
    if (ch === ',' || ch === '.') {
      hasComma = true;
      continue;
    }
    if (ch < '0' || ch > '9') continue;
    if (hasComma) {
      if (cents.length < 2) cents += ch;
    } else {
      whole += ch;
    }
  }
  return { whole: whole.replace(/^0+(?=\d)/, ''), cents, hasComma };
}

/** The draft, read as cents — what actually gets stored. A single trailing digit is tenths: "20,5" is R$20,50. */
export function draftCents(d: MoneyDraft): Cents {
  const whole = d.whole === '' ? 0 : Number(d.whole);
  const cents = d.cents === '' ? 0 : Number(d.cents.padEnd(2, '0'));
  return whole * 100 + cents;
}

/**
 * The read-only, grouped form — for a field the owner is not actively typing into.
 *
 * Its own "." for thousands is exactly the character `parseMoneyDraft` also treats as a decimal
 * trigger, so this string must never be fed back through it. `MoneyField` only ever shows this while
 * blurred, and rebuilds a fresh, undecorated draft from the committed cents (`draftFromCents`) the
 * moment the field is focused again — never by re-parsing what is on screen.
 */
export function formatMoneyDraft(d: MoneyDraft): string {
  if (d.whole === '' && d.cents === '' && !d.hasComma) return '';
  const whole = group(d.whole === '' ? 0 : Number(d.whole));
  return d.hasComma ? `${whole},${d.cents}` : whole;
}

/** Where a draft starts from when the field opens on a figure that already exists — editing, not typing. */
export function draftFromCents(cents: Cents | null | undefined): MoneyDraft {
  if (cents == null) return EMPTY_DRAFT;
  const abs = Math.max(0, Math.round(cents));
  const whole = Math.floor(abs / 100);
  const rest = abs % 100;
  return {
    whole: whole === 0 ? '' : String(whole),
    cents: rest === 0 ? '' : String(rest).padStart(2, '0'),
    hasComma: rest !== 0,
  };
}
