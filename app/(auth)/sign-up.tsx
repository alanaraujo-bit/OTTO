import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Field } from '@/ui/Field';
import { Button } from '@/ui/Button';
import { SocialRow } from '@/ui/SocialRow';
import { StrengthMeter } from '@/ui/StrengthMeter';
import { useSnackbar } from '@/ui/Snackbar';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { localAuth, AuthError } from '@/lib/auth/provider';
import { useSession } from '@/lib/auth/session';
import {
  passwordStrength,
  validateEmail,
  validateName,
  validatePassword,
} from '@/lib/validation';

export default function SignUp() {
  const snack = useSnackbar();
  const signIn = useSession((s) => s.signIn);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<Record<'name' | 'email' | 'password', string | null>>({
    name: null,
    email: null,
    password: null,
  });
  const [busy, setBusy] = useState<null | 'register' | 'google' | 'apple'>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const clear = (k: keyof typeof errors) =>
    setErrors((p) => (p[k] ? { ...p, [k]: null } : p));

  const submit = useCallback(async () => {
    const next = {
      name: validateName(name),
      email: validateEmail(email),
      password: validatePassword(password),
    };
    setErrors(next);
    if (next.name || next.email || next.password) return;

    setBusy('register');
    try {
      const session = await localAuth.register(name, email, password);
      await signIn(session);
      router.replace('/home');
    } catch (e) {
      snack(e instanceof AuthError ? e.message : 'Não deu para criar sua conta agora.', 'error');
    } finally {
      setBusy(null);
    }
  }, [name, email, password, signIn, snack]);

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
        <BackBar />

        <View style={styles.block}>
          <View style={styles.head}>
            <Txt variant="title" f="sansSemibold">
              Vamos começar.
            </Txt>
            <Txt variant="body" t="muted" style={styles.sub}>
              Leva menos de um minuto. Seus dados ficam no seu aparelho.
            </Txt>
          </View>

          <View style={styles.form}>
            <Field
              label="Nome"
              value={name}
              onChangeText={(v) => {
                setName(v);
                clear('name');
              }}
              error={errors.name}
              placeholder="Como quer ser chamado"
              autoCapitalize="words"
              autoComplete="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              submitBehavior="submit"
            />

            <Field
              ref={emailRef}
              label="E-mail"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                clear('email');
              }}
              error={errors.email}
              placeholder="voce@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
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
                clear('password');
              }}
              error={errors.password}
              placeholder="Mínimo de 8 caracteres"
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoComplete="new-password"
              returnKeyType="go"
              onSubmitEditing={submit}
              trailing={{
                label: reveal ? 'Ocultar' : 'Mostrar',
                onPress: () => setReveal((r) => !r),
              }}
            />
            <StrengthMeter strength={strength} />
          </View>

          <Button
            label="Criar conta"
            onPress={submit}
            loading={busy === 'register'}
            disabled={busy !== null && busy !== 'register'}
          />

          <Txt variant="micro" t="faint" style={styles.terms}>
            Ao criar sua conta você concorda com os Termos de Uso e com a Política de Privacidade
            do OTTO.
          </Txt>

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
            Já tem conta?{' '}
          </Txt>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))}
            hitSlop={12}
            accessibilityRole="button"
          >
            <Txt variant="label" f="sansSemibold" t="ink">
              Entrar
            </Txt>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  block: { flex: 1 },
  head: { paddingTop: space.xxl },
  sub: { paddingTop: space.sm },
  form: { paddingTop: space.lg, paddingBottom: space.xl },
  terms: { paddingTop: space.lg },
  social: { paddingTop: space.xl },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: space.xl,
    paddingBottom: space.lg,
  },
});
