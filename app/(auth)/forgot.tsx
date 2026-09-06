import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { BackBar } from '@/ui/BackBar';
import { Field } from '@/ui/Field';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Button } from '@/ui/Button';
import { MailSent } from '@/ui/Icon';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { localAuth } from '@/lib/auth/provider';
import { validateEmail } from '@/lib/validation';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = useCallback(async () => {
    const e = validateEmail(email);
    setError(e);
    if (e) return;

    setBusy(true);
    try {
      await localAuth.requestPasswordReset(email);
      setSent(true);
    } finally {
      setBusy(false);
    }
  }, [email]);

  return (
    <Screen>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BackBar />

        {sent ? (
          <View style={styles.done}>
            <Reveal index={0}>
              <MailSent size={28} />
              <Txt variant="title" f="sansSemibold" style={styles.doneTitle}>
                Enviamos o link.
              </Txt>
            </Reveal>

            <Reveal index={1}>
              <Txt variant="body" t="muted" style={styles.sub}>
                Se existir uma conta para {email.trim().toLowerCase()}, o link de redefinição chega
                em instantes. Verifique também o spam.
              </Txt>
            </Reveal>

            <Reveal index={2} style={styles.doneAction}>
              <Button
                label="Voltar para o login"
                variant="outline"
                onPress={() => router.replace('/sign-in')}
              />
            </Reveal>
          </View>
        ) : (
          <View>
            <Reveal index={0} style={styles.head}>
              <Txt variant="title" f="sansSemibold">
                Redefinir senha.
              </Txt>
              <Txt variant="body" t="muted" style={styles.sub}>
                Informe o e-mail da sua conta e enviamos um link para você criar uma nova senha.
              </Txt>
            </Reveal>

            <View style={styles.form}>
              <Field
                index={1}
                label="E-mail"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  if (error) setError(null);
                }}
                error={error}
                placeholder="voce@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>

            <Reveal index={2}>
              <Button label="Enviar link" onPress={submit} loading={busy} />
            </Reveal>
          </View>
        )}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  head: { paddingTop: space.xxl },
  sub: { paddingTop: space.sm },
  form: { paddingTop: space.sm, paddingBottom: space.xl },
  done: { paddingTop: space.xxxl },
  doneTitle: { paddingTop: space.lg },
  doneAction: { paddingTop: space.xxl },
});
