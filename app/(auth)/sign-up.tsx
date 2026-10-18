import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Wordmark } from '@/ui/Wordmark';
import { Field } from '@/ui/Field';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Button } from '@/ui/Button';
import { SocialRow } from '@/ui/SocialRow';
import { StrengthMeter } from '@/ui/StrengthMeter';
import { useSnackbar } from '@/ui/Snackbar';
import { useFocusSignal } from '@/ui/FocusSignal';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { localAuth, AuthError } from '@/lib/auth/provider';
import { appleConfigured, googleConfigured } from '@/lib/auth/config';

/**
 * The arrival.
 *
 * Android's native push is short and cannot be lengthened — `animationDuration` is honoured on iOS
 * only — so a transition built on the slide alone is over before it registers. The length has to
 * come from this side instead: the content enters travelling in the same direction the page did, and
 * keeps settling for most of a second after the page itself has landed.
 *
 * The easing is heavily front-loaded, so the top of the screen is essentially composed by the time
 * the slide ends and only the lower half is still coasting. That is the difference between a page
 * that arrives empty and fills in, and one long continuous movement.
 */
const ENTER = { delay: 40, step: 72, cap: 8, shift: 34, rise: 12 } as const;
import { useSession } from '@/lib/auth/session';
import {
  passwordStrength,
  validateEmail,
  validateName,
  validatePassword,
} from '@/lib/validation';

/** The body sits one level inside `Screen`, so `useFocusSignal` has the provider above it. */
export default function SignUp() {
  return (
    <Screen>
      <SignUpBody />
    </Screen>
  );
}

function SignUpBody() {
  const snack = useSnackbar();
  /*
   * Where the owner was going before an account was needed — a shared debt they tapped "adicionar"
   * on. Sign-in already honoured it; arriving here from sign-in's "Criar conta" used to drop it, so
   * a new account landed on an empty Home and the debt that brought them was gone (DIV-07). Only a
   * debt link is accepted, the same rule sign-in applies.
   */
  const { next } = useLocalSearchParams<{ next?: string }>();
  const destination = typeof next === 'string' && next.startsWith('/divida/') ? next : '/home';
  const { look } = useFocusSignal();

  /** Back is a look to the left, forward a look to the right. The mark leads the transition. */
  const back = useCallback(() => {
    look(-1);
    if (router.canGoBack()) router.back();
    else router.replace('/sign-in');
  }, [look]);
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
      router.replace(destination as never);
    } catch (e) {
      snack(e instanceof AuthError ? e.message : 'Não deu para criar sua conta agora.', 'error');
    } finally {
      setBusy(null);
    }
  }, [name, email, password, signIn, snack, destination]);

  const social = useCallback(
    async (which: 'google' | 'apple') => {
      setBusy(which);
      try {
        const session =
          which === 'google' ? await localAuth.withGoogle() : await localAuth.withApple();
        await signIn(session);
        router.replace(destination as never);
      } catch (e) {
        snack(e instanceof AuthError ? e.message : 'Não deu para entrar agora.', 'error');
      } finally {
        setBusy(null);
      }
    },
    [signIn, snack, destination],
  );

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* The mark comes along. It sits at the same 22dp it shrinks to on the previous screen, so
          the lateral slide reads as content moving under one continuous brand rather than as two
          unrelated pages. And it keeps watching: this is the form where it matters most. */}
      <Reveal index={0} {...ENTER} rise={0}>
        <View style={styles.top}>
          <BackBar onPress={back} />
          <Wordmark height={22} alive />
        </View>
      </Reveal>

      <View style={styles.block}>
        <Reveal index={1} {...ENTER} style={styles.head}>
          <Txt variant="title" f="sansSemibold">
            Crie sua conta.
          </Txt>
          <Txt variant="body" t="muted" style={styles.sub}>
            Leva menos de um minuto. Seu razão fica guardado na sua conta, no servidor do OTTO.
          </Txt>
        </Reveal>

        <View style={styles.form}>
          <Reveal index={2} {...ENTER}>
            <Field
              index={1}
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
          </Reveal>

          <Reveal index={3} {...ENTER}>
            <Field
              index={2}
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
          </Reveal>

          <Reveal index={4} {...ENTER}>
            <Field
              index={3}
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
          </Reveal>
        </View>

        <Reveal index={5} {...ENTER}>
          <Button
            label="Criar conta"
            onPress={submit}
            loading={busy === 'register'}
            disabled={busy !== null && busy !== 'register'}
          />
        </Reveal>

        {/*
          This used to say the owner agreed to "Termos de Uso" and a "Política de Privacidade" —
          documents that do not exist anywhere to be linked (AUTH-06). Consent to an unreadable text
          is not consent, so the line now states the privacy fact itself, which is true and short.
        */}
        <Reveal index={6} {...ENTER}>
          <Txt variant="micro" t="faint" style={styles.terms}>
            Seu razão é privado: só você vê. Uma dívida só é compartilhada quando você mesmo cria o
            link, e o link pode ser revogado.
          </Txt>
        </Reveal>

        <Reveal index={7} {...ENTER} style={styles.social}>
          <SocialRow
            onGoogle={googleConfigured() ? () => void social('google') : undefined}
            onApple={appleConfigured() ? () => void social('apple') : undefined}
            busy={busy !== null}
          />
        </Reveal>
      </View>

      <Reveal index={8} {...ENTER} style={styles.footer}>
        <Txt variant="label" t="faint">
          Já tem conta?{' '}
        </Txt>
        <Pressable
          onPress={back}
          hitSlop={15}
          accessibilityRole="button"
        >
          <Txt variant="label" f="sansSemibold" t="ink">
            Entrar
          </Txt>
        </Pressable>
      </Reveal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.md },
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
