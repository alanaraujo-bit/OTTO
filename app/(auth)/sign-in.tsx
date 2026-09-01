import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { SocialRow } from '@/ui/SocialRow';
import { Wordmark } from '@/ui/Wordmark';
import { useSnackbar } from '@/ui/Snackbar';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { localAuth, AuthError } from '@/lib/auth/provider';
import { useSession } from '@/lib/auth/session';
import { validateEmail, validatePassword } from '@/lib/validation';

export default function SignIn() {
  const snack = useSnackbar();
  const signIn = useSession((s) => s.signIn);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [busy, setBusy] = useState<null | 'password' | 'google' | 'apple'>(null);

  const submit = useCallback(async () => {
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    if (next.email || next.password) return;

    setBusy('password');
    try {
      const session = await localAuth.withPassword(email, password);
      await signIn(session);
      router.replace('/home');
    } catch (e) {
      snack(e instanceof AuthError ? e.message : 'Não deu para entrar agora.', 'error');
    } finally {
      setBusy(null);
    }
  }, [email, password, signIn, snack]);

  const social = useCallback(
    async (which: 'google' | 'apple') => {
      setBusy(which);
      try {
        const session =
          which === 'google' ? await localAuth.withGoogle() : await localAuth.withApple();
        await signIn(session);
        router.replace('/home');
      } catch (e) {
        snack(e instanceof AuthError ? e.message : 'Não deu para entrar agora.', 'error');
      } finally {
        setBusy(null);
      }
    },
    [signIn, snack],
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Wordmark height={40} animate />
        </View>

        <View style={styles.block}>
          <Txt variant="title" f="sansSemibold">
            Bom te ver de novo.
          </Txt>
          <Txt variant="body" t="muted" style={styles.sub}>
            Entre para continuar de onde você parou.
          </Txt>

          <View style={styles.form}>
            <Field
              label="E-mail"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                if (errors.email) setErrors((p) => ({ ...p, email: null }));
              }}
              error={errors.email}
              placeholder="voce@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              submitBehavior="submit"
            />

            <Field
              ref={passwordRef}
              label="Senha"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (errors.password) setErrors((p) => ({ ...p, password: null }));
              }}
              error={errors.password}
              placeholder="••••••••"
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={submit}
              trailing={{
                label: reveal ? 'Ocultar' : 'Mostrar',
                onPress: () => setReveal((r) => !r),
              }}
            />

            <Pressable
              onPress={() => router.push('/forgot')}
              hitSlop={10}
              style={styles.forgot}
              accessibilityRole="button"
            >
              <Txt variant="label" t="muted">
                Esqueci minha senha
              </Txt>
            </Pressable>
          </View>

          <Button
            label="Entrar"
            onPress={submit}
            loading={busy === 'password'}
            disabled={busy !== null && busy !== 'password'}
          />

          <View style={styles.social}>
            <SocialRow
              onGoogle={() => void social('google')}
              onApple={() => void social('apple')}
              busy={busy !== null}
            />
          </View>
        </View>

        <View style={styles.footer}>
          <Txt variant="label" t="faint">
            Ainda não tem conta?{' '}
          </Txt>
          <Pressable onPress={() => router.push('/sign-up')} hitSlop={12} accessibilityRole="button">
            <Txt variant="label" f="sansSemibold" t="ink">
              Criar conta
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: space.xxxl },
  block: { flex: 1 },
  brand: { paddingBottom: space.xxxl + space.xl },
  sub: { paddingTop: space.sm },
  form: { paddingTop: space.lg, paddingBottom: space.xl },
  forgot: { alignSelf: 'flex-start', paddingTop: space.lg, minHeight: 32, justifyContent: 'center' },
  social: { paddingTop: space.xxl },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
});
