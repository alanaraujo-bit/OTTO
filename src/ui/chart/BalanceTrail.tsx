import { StyleSheet, View } from 'react-native';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import type { Cents } from '@/domain/money';
import { Amount } from '../Amount';
import { Press } from '../Press';

export interface TrailMonth {
  key: string;
  label: string;
  /** Where the month closes, or is projected to close. */
  cents: Cents;
  era: 'past' | 'current' | 'future';
  /** The month it reads, for the row that opens it. */
  from: string;
}

const CAPTION = { past: 'fechamento', current: 'projetado hoje', future: 'previsto' } as const;

/**
 * Where the balance stood at the close of each of the last months, as rules.
 *
 * The length of a rule is the size of the balance against the largest one in the run, so the eye
 * reads the shape of the half-year in one pass. A balance below zero is drawn in `negative` — it is
 * money the owner does not have, which is the one reading colour is allowed to carry here.
 */
export function BalanceTrail({
  months,
  onOpen,
}: {
  months: TrailMonth[];
  onOpen: (from: string) => void;
}) {
  const top = Math.max(1, ...months.map((m) => Math.abs(m.cents)));

  return (
    <View>
      {months.map((m) => {
        const negative = m.cents < 0;
        return (
          <Press
            key={m.key}
            onPress={() => onOpen(m.from)}
            haptic="none"
            accessibilityLabel={`${m.label}, abrir o mês`}
          >
            <View style={styles.row}>
              <View style={styles.head}>
                <Txt variant="micro" f="mono" t="muted" style={styles.label}>
                  {m.label.toUpperCase()}
                </Txt>
                <Amount cents={m.cents} size="body" tone={negative ? 'negative' : 'ink'} />
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${(Math.abs(m.cents) / top) * 100}%`,
                      backgroundColor: negative ? color.negative : color.inkFaint,
                    },
                  ]}
                />
              </View>
              <Txt variant="micro" t="faint" style={styles.caption}>
                {CAPTION[m.era]}
              </Txt>
            </View>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { letterSpacing: 0.8 },
  track: { height: 1, marginTop: space.sm, backgroundColor: color.hairline },
  fill: { height: 1 },
  caption: { paddingTop: space.xs },
});
