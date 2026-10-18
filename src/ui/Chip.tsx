import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Press } from './Press';
import { Txt } from '@/theme/text';
import { color, radius, space } from '@/theme/tokens';

/**
 * One choice among a few, as a pill.
 *
 * **Selected is ink-filled, with ground-coloured text.** It used to be `surface` on `bg` — two greys
 * a few steps apart, which on the device read as "maybe this one" and was the audit's top finding on
 * the screen PRODUCT.md calls the product. Ink fill is the same statement the primary CTA makes ("this
 * is the one"), so the app keeps one grammar for it instead of inventing a softer second one.
 *
 * 40dp drawn, 48dp touched: the 4dp `hitSlop` on every side reaches Material's floor while the row
 * keeps the density of a list of words, and with the 8dp gap the slops of two neighbours meet
 * rather than overlap.
 */
export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Press
      onPress={onPress}
      scale={0.95}
      hitSlop={4}
      style={[styles.chip, selected ? styles.chipOn : null]}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
    >
      <Txt variant="label" f={selected ? 'sansMedium' : 'sans'} t={selected ? 'onInk' : 'muted'}>
        {label}
      </Txt>
    </Press>
  );
}

/**
 * A horizontal row of chips that bleeds to the screen edge and keeps the chosen one in view.
 *
 * **The bleed.** Clipped at the gutter, a row cut its last chip mid-word, which reads as broken
 * rather than as "there is more". Running the scroll to the panel edge (negative margin, gutter
 * padding inside) puts the cut in the curve where content visibly continues, while the resting
 * position still starts every chip inside the curve-safe gutter — nothing *rests* in the curve.
 *
 * **The chosen chip is scrolled into view** when it changes and on first layout. A category chosen
 * by "Já paguei", or the one an edit opened with, could otherwise be selected eleven chips to the
 * right, invisible, and the row would look like nothing was chosen.
 */
export function ChipRow({
  items,
  selected,
  onPick,
  after,
}: {
  items: { key: string; label: string; accessibilityLabel?: string }[];
  selected: string | null;
  onPick: (key: string) => void;
  /** Rendered after the items, inside the same scroll — the "+ Nova categoria" slot. */
  after?: ReactNode;
}) {
  const ref = useRef<ScrollView>(null);
  // Where each chip sits in the content, and how far the row is scrolled — both read, never rendered.
  const at = useRef(new Map<string, { x: number; w: number }>());
  const scrolled = useRef(0);
  const [width, setWidth] = useState(0);

  const reveal = useCallback(() => {
    if (!selected || width === 0) return;
    const chip = at.current.get(selected);
    if (!chip) return;
    const left = chip.x - space.gutter;
    const right = chip.x + chip.w + space.gutter - width;
    if (left < scrolled.current) ref.current?.scrollTo({ x: Math.max(0, left), animated: true });
    else if (right > scrolled.current) ref.current?.scrollTo({ x: right, animated: true });
  }, [selected, width]);

  useEffect(reveal, [reveal]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={styles.bleed}
      contentContainerStyle={styles.row}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onScroll={(e) => {
        scrolled.current = e.nativeEvent.contentOffset.x;
      }}
      scrollEventThrottle={32}
    >
      {items.map((item) => (
        <View
          key={item.key}
          // Relative to the content container, padding included — exactly the offset scrollTo takes.
          onLayout={(e) => {
            const { x, width: w } = e.nativeEvent.layout;
            at.current.set(item.key, { x, w });
            if (item.key === selected) reveal();
          }}
        >
          <Chip
            label={item.label}
            accessibilityLabel={item.accessibilityLabel}
            selected={selected === item.key}
            onPress={() => onPick(item.key)}
          />
        </View>
      ))}
      {after}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bleed: { marginHorizontal: -space.gutter },
  row: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.gutter },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
  },
  chipOn: { borderColor: color.ink, backgroundColor: color.ink },
});
