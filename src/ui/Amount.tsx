import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Txt } from '@/theme/text';
import { type } from '@/theme/tokens';
import { duration, ease, useReducedMotion } from '@/theme/motion';
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

      {size === 'body' ? (
        <Txt variant={spec.major} f="monoSemibold" t={ink} tabular>
          {p.whole}
        </Txt>
      ) : (
        <Odometer text={p.whole} variant={spec.major} ink={ink} fromZero={size === 'hero'} />
      )}

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

type Ink = NonNullable<Parameters<typeof Amount>[0]['tone']>;
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const COLUMN = DIGITS.join('\n');

/**
 * The figure as a mechanical counter: every digit is a drum that rolls to its value.
 *
 * An instrument reports a new reading by moving to it, not by swapping glyphs, so when a balance
 * changes the digits that changed travel and the ones that did not stay still — the eye sees *how
 * much* moved before it reads the new number. A hero figure also counts up from zero when it first
 * appears, which is the screen arriving at its reading.
 *
 * **At rest it is plain text.** The drums exist only while a figure is moving and are taken away once
 * it settles. Mounting a drum for every digit of every figure on every tab change was measured on
 * the device as the Home stuttering on arrival; a resting number costs what any text costs.
 *
 * Columns are keyed from the right, so the units stay the units when the figure gains a digit
 * (905 → 1.905 rolls the hundreds and adds a thousands drum, rather than shuffling every column).
 * Separators and the minus are not drums; they sit still.
 */
function Odometer({
  text,
  variant,
  ink,
  fromZero,
}: {
  text: string;
  variant: 'display' | 'heading' | 'body';
  ink: Ink;
  fromZero: boolean;
}) {
  const reduced = useReducedMotion();
  /** What the drums roll from: zero for a hero arriving, the previous reading for a change. */
  const [roll, setRoll] = useState<{ from: string; key: number } | null>(() =>
    fromZero && !reduced ? { from: '', key: 0 } : null,
  );
  const shown = useRef(text);

  useEffect(() => {
    if (shown.current === text) return;
    const from = shown.current;
    shown.current = text;
    if (!reduced) setRoll((r) => ({ from, key: (r?.key ?? 0) + 1 }));
  }, [text, reduced]);

  // Back to plain text once the longest roll is over, watchdog margin included.
  useEffect(() => {
    if (!roll) return;
    const span = (roll.from === '' ? duration.focal + 280 : duration.focal) + text.length * 45 + 450;
    const t = setTimeout(() => setRoll(null), span);
    return () => clearTimeout(t);
  }, [roll, text.length]);

  if (!roll) {
    return (
      <Txt variant={variant} f="monoSemibold" t={ink} tabular>
        {text}
      </Txt>
    );
  }

  const chars = text.split('');
  const before = roll.from.split('');
  return (
    <View style={styles.odometer} key={roll.key}>
      {chars.map((c, i) => {
        const fromRight = chars.length - 1 - i;
        const was = before[before.length - 1 - fromRight];
        return /\d/.test(c) ? (
          <Drum
            key={`d${fromRight}`}
            from={was && /\d/.test(was) ? Number(was) : 0}
            value={Number(c)}
            variant={variant}
            ink={ink}
            slow={roll.from === ''}
            // Left to right, so the reading arrives the way it is read.
            delay={roll.from === '' ? i * 45 : 0}
          />
        ) : (
          <Txt key={`s${fromRight}${c}`} variant={variant} f="monoSemibold" t={ink} tabular>
            {c}
          </Txt>
        );
      })}
    </View>
  );
}

function Drum({
  from,
  value,
  variant,
  ink,
  slow,
  delay,
}: {
  from: number;
  value: number;
  variant: 'display' | 'heading' | 'body';
  ink: Ink;
  slow: boolean;
  delay: number;
}) {
  const { fontScale } = useWindowDimensions();
  /**
   * One row of the drum: the line height the column is set at, scaled as the text is.
   *
   * It used to be measured from the column, and the column lives inside the window this sizes — a
   * clipping parent constrains its child's height, so each measure shrank the window and the next
   * measure with it, until the column was one pixel tall. Every roll was invisible: the figure went
   * blank and the new one appeared when the drums were taken away.
   */
  const row = type[variant].leading * fontScale;
  const at = useSharedValue(from);

  useEffect(() => {
    at.value = withDelay(delay, withTiming(value, { duration: slow ? duration.focal + 280 : duration.focal, easing: ease.out }));
  }, [at, value, delay, slow]);

  const drum = useAnimatedStyle(() => ({ transform: [{ translateY: -at.value * row }] }));

  return (
    <View style={[styles.window, { height: row }]}>
      <Animated.View style={[{ height: row * DIGITS.length }, drum]}>
        {/* One text node holding the ten rows, not ten nodes. */}
        <Txt variant={variant} f="monoSemibold" t={ink} tabular>
          {COLUMN}
        </Txt>
      </Animated.View>
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
  odometer: { flexDirection: 'row' },
  window: { overflow: 'hidden' },
});
