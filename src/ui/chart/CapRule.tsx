import { StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { parseDay } from '@/domain/projection';
import type { CapReading } from '@/domain/cap';
import { brlShort } from '@/domain/money';
import { Press } from '../Press';

/**
 * One ceiling, read as a rule.
 *
 * The ceiling is the full length of the hairline and the spend is how much of it is drawn. Past the
 * end the rule turns `negative`, because a ceiling that is through is money that has already gone out
 * — and it is the only colour on the row, since category identity never carries meaning about money.
 *
 * The caption says the one thing the figure cannot: what the month does next. A cap that is through
 * says on which day it was crossed; one still standing says on which day it would break at this rate,
 * or how much is left to spend each day, when the rate is safe.
 */
export function CapRule({ reading, onPress }: { reading: CapReading; onPress: () => void }) {
  const r = reading;
  const through = r.used >= 1;
  const tone = through ? color.negative : r.used >= 0.8 ? color.warning : color.ink;
  const fill = Math.min(1, r.used);

  const caption = through
    ? `estourado em ${format(parseDay(r.burstsOn ?? ''), "d 'de' MMM", { locale: ptBR })}`
    : r.burstsOn
      ? `estoura em ${format(parseDay(r.burstsOn), "d 'de' MMM", { locale: ptBR })} neste ritmo`
      : `sobram ${brlShort(r.leftCents)} · ${brlShort(r.perDayCents)} por dia`;

  return (
    <Press onPress={onPress} haptic="none" accessibilityLabel={`Teto de ${r.category}`}>
      <View style={styles.row}>
        <View style={styles.head}>
          <Txt variant="body" t="ink" numberOfLines={1} style={styles.name}>
            {r.category}
          </Txt>
          <Txt variant="micro" f="mono" t="muted" tabular>
            {brlShort(r.spent)} de {brlShort(r.capCents)}
          </Txt>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fill * 100}%`, backgroundColor: tone }]} />
        </View>
        <Txt variant="micro" t={through ? 'negative' : 'faint'} style={styles.caption}>
          {caption}
        </Txt>
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  name: { flex: 1, paddingRight: space.md },
  /* The hairline is the ceiling itself: its full length is the figure the spend is measured against. */
  track: {
    height: 2,
    marginTop: space.sm,
    backgroundColor: color.hairline,
  },
  fill: { height: 2 },
  caption: { paddingTop: space.xs },
});
