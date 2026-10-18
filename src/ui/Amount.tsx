import { StyleSheet, View } from 'react-native';
import { Txt } from '@/theme/text';
import { parts, roundToReal, type Cents } from '@/domain/money';

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
 *
 * **A flow says its direction in a character, not only in a colour.** Pass `direction` and the
 * figure is drawn as a magnitude: an inflow carries a "+" before the R$, an outflow carries nothing,
 * and the tone still applies. A minus on every bill read as a balance gone negative, and green alone
 * told a colour-blind reader nothing. Without `direction` the figure is a balance and keeps its sign.
 *
 * **One figure, one thing to hear.** The three runs of text are drawn apart for the eye, but a screen
 * reader stopping on each read "R$", "694", "vírgula 66" as three items. The row is one accessible
 * node with the whole figure as its label.
 */
export function Amount({
  cents,
  size = 'body',
  tone,
  showCents = true,
  direction,
}: {
  cents: Cents;
  size?: Size;
  /** Defaults to neutral ink. Chroma is only ever passed in when the sign carries meaning. */
  tone?: 'ink' | 'muted' | 'faint' | 'positive' | 'negative' | 'warning';
  showCents?: boolean;
  /** Draw a flow as a magnitude: "+" on an inflow, no sign on an outflow. Omit for a balance. */
  direction?: 'in' | 'out';
}) {
  // Without centavos the figure is rounded, never truncated — the rule `brlShort` uses, so a block
  // and the sentence under it cannot disagree by a real.
  const shown = direction ? Math.abs(cents) : cents;
  const p = parts(showCents ? shown : roundToReal(shown));
  const sign = direction === 'in' && shown !== 0 ? '+' : p.sign;
  const spec = SIZE[size];
  const ink = tone ?? 'ink';
  const spoken = `${sign}${p.symbol} ${p.whole}${showCents ? ',' + p.cents : ''}`;

  return (
    <View style={styles.row} accessible accessibilityLabel={spoken}>
      <Txt
        variant={spec.minor}
        f="mono"
        t="faint"
        style={[styles.symbol, { paddingBottom: spec.minorDrop }]}
      >
        {/* The sign is the direction, so it wears the figure's tone; the R$ stays tertiary. */}
        {sign ? <Txt variant={spec.minor} f="mono" t={ink}>{sign}</Txt> : null}
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
