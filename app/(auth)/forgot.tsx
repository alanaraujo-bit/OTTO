import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { BackBar } from '@/ui/BackBar';
import { Button } from '@/ui/Button';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';

/**
 * Esqueci a senha — said as it is.
 *
 * This screen used to ask for an e-mail and promise a link. There is no link: the API has a register
 * and a login route and nothing that sends mail or resets a password, so `requestPasswordReset`
 * could only ever throw — and the form caught nothing, so the button spun and stopped and the owner
 * was left believing a message was on its way. A form that cannot send is worse than no form.
 *
 * So the screen says what is true and what the owner can actually do: the ledger is safe on the
 * server whatever happens to the password, and getting back in today means asking whoever runs this
 * OTTO to reset it. When a reset endpoint exists, the form comes back — and it shows its errors.
 */
export default function Forgot() {
  return (
    <Screen>
      <BackBar />

      <View style={styles.body}>
        <Reveal index={0} style={styles.head}>
          <Txt variant="title" f="sansSemibold">
            Esqueceu a senha?
          </Txt>
          <Txt variant="body" t="muted" style={styles.sub}>
            Ainda não dá para redefinir a senha pelo app — o OTTO não envia e-mails por enquanto.
          </Txt>
        </Reveal>

        <Reveal index={1}>
          <Txt variant="body" t="muted" style={styles.sub}>
            Seu razão continua guardado na sua conta, no servidor, e não se perde. Para voltar a
            entrar, peça a quem administra o seu OTTO para redefinir a senha deste e-mail.
          </Txt>
        </Reveal>

        <Reveal index={2} style={styles.action}>
          <Button
            label="Voltar para o login"
            variant="outline"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
          />
        </Reveal>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1 },
  head: { paddingTop: space.xxl },
  sub: { paddingTop: space.sm },
  action: { paddingTop: space.xxl },
});
