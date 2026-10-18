import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HIT, space } from '@/theme/tokens';
import { ArrowLeft } from './Icon';

/**
 * A back affordance that duplicates the system Back gesture rather than replacing it — the lateral
 * edges of a quad-curved panel belong to the OS, so there is always a tappable way back too.
 *
 * The arrow sits on the gutter line like every other left edge on the screen, and the 48dp target
 * grows only rightward and vertically from there. It used to reach 12dp *into* the gutter (a
 * negative margin, plus a hitSlop on all sides) to centre the glyph in its target, which put a touch
 * target in the curve DESIGN.md keeps clear — and the curve is exactly where the Back gesture lives.
 */
export function BackBar({ onPress }: { onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/sign-in')))}
        hitSlop={{ top: 8, bottom: 8, right: 12, left: 0 }}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
        style={styles.btn}
      >
        <ArrowLeft />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingTop: space.md },
  btn: {
    width: HIT,
    height: HIT,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
});
