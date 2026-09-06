import { StyleSheet, View } from 'react-native';
import { Txt } from '@/theme/text';
import { parts, type Cents } from '@/domain/money';

type Size = 'hero' | 'heading' | 'body';

/**
 * A currency amount, set the way DESIGN.md commits to setting one: the magnitude reads first, the
 * precision second.
 *
 * `R$` and the centavos are smaller and in tertiary ink, so the eye lands on the digits that decide
 * something and only then resolves the rest. The parts arrive from the formatter already separated —
 * no string surgery here, which is how a currency component usually starts mis-splitting negative
 * numbers and thousands separators.
 *
 * Figures are tabular throughout. DESIGN.md commits Geist Mono to every number in the app, and this
 * value animates and appears in aligned columns; proportional figures would make it twitch.
 */
export function Amount({
  cents,
  size = 'body',
  tone,
  showCents = true,
}: {
  cents: Cents;
  size?: Size;
  /** Defaults to neutral ink. Chroma is only ever passed in when the sign carries meaning. */
  tone?: 'ink' | 'muted' | 'faint' | 'positive' | 'negative' | 'warning';
  showCents?: boolean;
}) {
  const p = parts(cents);
  const spec = SIZE[size];
  const ink = tone ?? 'ink';

  return (
    <View style={styles.row}>
      <Txt
        variant={spec.minor}
        f="mono"
        t="faint"
        style={[styles.symbol, { paddingBottom: spec.minorDrop }]}
      >
        {p.sign}
        {p.symbol}
      </Txt>

      <Txt variant={spec.major} f="monoSemibold" t={ink} tabular>
        {p.whole}
      </Txt>

      {showCents ? (
        <Txt
          variant={spec.minor}
          f="mono"
          t="faint"
          tabular
          style={[styles.cents, { paddingBottom: spec.minorDrop }]}
        >
          ,{p.cents}
        </Txt>
      ) : null}
    </View>
  );
}

const SIZE: Record<Size, { major: 'display' | 'heading' | 'body'; minor: 'body' | 'label' | 'micro'; minorDrop: number }> = {
  // The minor parts sit on the major's baseline rather than centred on its box, which is why they
  // carry a drop rather than an alignment.
  hero: { major: 'display', minor: 'body', minorDrop: 6 },
  heading: { major: 'heading', minor: 'micro', minorDrop: 3 },
  body: { major: 'body', minor: 'micro', minorDrop: 1 },
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end' },
  symbol: { paddingRight: 4 },
  cents: { paddingLeft: 1 },
});
