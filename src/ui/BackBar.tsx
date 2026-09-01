import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { HIT, space } from '@/theme/tokens';
import { ArrowLeft } from './Icon';

/**
 * A back affordance that duplicates the system Back gesture rather than replacing it — the lateral
 * edges of a quad-curved panel belong to the OS, so there is always a tappable way back too.
 */
export function BackBar({ onPress }: { onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress ?? (() => (router.canGoBack() ? router.back() : router.replace('/sign-in')))}
        hitSlop={12}
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
    marginLeft: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
