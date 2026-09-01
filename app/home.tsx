import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { Wordmark } from '@/ui/Wordmark';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { useSession } from '@/lib/auth/session';

/**
 * Placeholder for Fase 4. It exists so the auth flow has a real destination to land on; it is not a
 * design artefact and will be replaced wholesale.
 */
export default function Home() {
  const session = useSession((s) => s.session);
  const signOut = useSession((s) => s.signOut);

  return (
    <Screen>
      <View style={styles.root}>
        <Wordmark height={30} />
        <Txt variant="title" f="sansSemibold" style={styles.title}>
          Olá, {session?.name ?? 'você'}.
        </Txt>
        <Txt variant="body" t="muted" style={styles.sub}>
          A tela inicial chega na Fase 4. Por enquanto, o acesso já está funcionando de ponta a
          ponta.
        </Txt>
        <View style={styles.action}>
          <Button
            label="Sair"
            variant="outline"
            onPress={() => {
              void signOut();
              router.replace('/sign-in');
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center' },
  title: { paddingTop: space.xl },
  sub: { paddingTop: space.sm },
  action: { paddingTop: space.xxl },
});
