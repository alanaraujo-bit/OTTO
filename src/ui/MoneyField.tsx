import { useRef, useState } from 'react';
import { Field, type FieldProps } from './Field';
import {
  draftCents,
  draftFromCents,
  formatMoneyDraft,
  parseMoneyDraft,
  type MoneyDraft,
} from '@/domain/money';

export interface MoneyFieldProps
  extends Omit<FieldProps, 'value' | 'onChangeText' | 'keyboardType' | 'numeric'> {
  /** Null for an untouched, optional figure — distinct from a real R$0,00. */
  cents: number | null;
  /** Null when the field has been cleared back to nothing — again, distinct from an entered zero. */
  onChangeCents: (cents: number | null) => void;
}

/**
 * A reais amount, typed the way every other money field on the owner's phone is: digits are the
 * integer part until a comma switches to centavos, and a bare "20" means twenty reais, not twenty
 * centavos. See `parseMoneyDraft` in `domain/money.ts` for the arithmetic and why it is a different
 * convention from the keypad in `lançar` — that one is typed dozens of times a day and earns a
 * dedicated, non-standard control; this one is typed a handful of times ever, through the system
 * keyboard, and a rare field should not ask the owner to learn a second way to write a number.
 *
 * **Grouped only while not being edited.** `parseMoneyDraft` has to treat "." as a decimal trigger
 * too — plenty of system keyboards send it regardless of locale — which means the "." this field
 * inserts for thousands (1.234,56) can never be shown back to the parser without corrupting the
 * figure the moment the owner types one more digit. So the live buffer while focused is always the
 * bare, undecorated draft; refocusing rebuilds it from the committed cents rather than by re-reading
 * whatever is on screen, and only a blurred field ever shows the grouped, readable form.
 */
export function MoneyField({ cents, onChangeCents, ...rest }: MoneyFieldProps) {
  const [draft, setDraft] = useState<MoneyDraft>(() => draftFromCents(cents));
  const [focused, setFocused] = useState(false);
  // The figure last reported outward, so a refocus can rebuild a draft from the committed value
  // rather than from a prop that may not have round-tripped back yet.
  const committed = useRef<number | null>(cents);

  // The "R$" is cosmetic and only ever appears on the read-only, blurred form — never in the live
  // buffer `parseMoneyDraft` reads, so it can never be mistaken for a digit the owner typed.
  const grouped = formatMoneyDraft(draft);
  const shown = focused ? draftText(draft) : grouped === '' ? '' : `R$ ${grouped}`;

  return (
    <Field
      {...rest}
      value={shown}
      numeric
      keyboardType="decimal-pad"
      onFocus={(e) => {
        setDraft(draftFromCents(committed.current));
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      onChangeText={(t) => {
        const next = parseMoneyDraft(t);
        setDraft(next);
        // A field cleared all the way back is "untouched" again, not "the owner entered zero" —
        // the same distinction `cents: number | null` draws on the way in.
        const empty = next.whole === '' && next.cents === '' && !next.hasComma;
        const c = empty ? null : draftCents(next);
        committed.current = c;
        onChangeCents(c);
      }}
    />
  );
}

/** The undecorated live-typing text: no thousands grouping, since that character must stay unique
    to `formatMoneyDraft`'s output while a real decimal trigger is on the screen. */
function draftText(d: MoneyDraft): string {
  if (d.whole === '' && d.cents === '' && !d.hasComma) return '';
  return d.hasComma ? `${d.whole},${d.cents}` : d.whole;
}
