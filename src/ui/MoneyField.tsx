import { Field, type FieldProps } from './Field';
import { centsFromTyped, typedFromCents } from './choices';

export interface MoneyFieldProps
  extends Omit<FieldProps, 'value' | 'onChangeText' | 'keyboardType' | 'numeric' | 'prefix'> {
  /** Null for an untouched, optional figure — distinct from a real R$0,00. */
  cents: number | null;
  /** Null when the field has been cleared back to nothing — again, distinct from an entered zero. */
  onChangeCents: (cents: number | null) => void;
}

/**
 * A reais amount, typed the way the lançar keypad types one: digits push in from the right as
 * centavos and the separators place themselves. "8", "0", "0" is R$ 8,00 on the way to R$ 800,00.
 *
 * **One way to write a number in this app.** This field used to follow a second convention — digits
 * as reais until a comma switched to centavos — on the argument that a rarely used field should
 * match the system keyboard rather than ask the owner to learn the keypad's rule. The audit found
 * the opposite cost: the owner meets the keypad dozens of times a day, so its rule is the one they
 * already know, and a teto that read "800" as reais while lançar read it as centavos was the app
 * disagreeing with itself about what a keystroke means (TETO-02). It is also the rule every
 * Brazilian bank's Pix field uses. `parseMoneyDraft` in `domain/money` is no longer called from here.
 *
 * **"R$" never leaves.** It is the field's `prefix`, outside the TextInput, so it stays visible while
 * typing and can never be read back as part of the value. The caret is pinned to the end, because
 * there is no position to edit from — like the keypad's readout, a digit always enters at the right
 * and backspace always takes the last one. That is also why the grouped "1.234,56" can be shown live:
 * the value is re-derived from the digits alone, so the separators are never parsed.
 */
export function MoneyField({ cents, onChangeCents, placeholder, ...rest }: MoneyFieldProps) {
  const shown = typedFromCents(cents);

  return (
    <Field
      {...rest}
      prefix="R$"
      value={shown}
      placeholder={placeholder ?? '0,00'}
      numeric
      keyboardType="number-pad"
      selection={{ start: shown.length, end: shown.length }}
      contextMenuHidden
      onChangeText={(t) => onChangeCents(centsFromTyped(t, shown))}
    />
  );
}
