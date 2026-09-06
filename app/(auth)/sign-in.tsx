import { useCallback, useRef, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { BrandHeader } from '@/ui/BrandHeader';
import { Field } from '@/ui/Field';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Button } from '@/ui/Button';
import { SocialRow } from '@/ui/SocialRow';
import { useSnackbar } from '@/ui/Snackbar';
import { useFocusSignal } from '@/ui/FocusSignal';
import { Txt } from '@/theme/text';
import { space } from '@/theme/tokens';
import { localAuth, AuthError } from '@/lib/auth/provider';
import { useSession } from '@/lib/auth/session';
import { validateEmail, validatePassword } from '@/lib/validation';

/**
 * Long enough for the confirmation to register, short enough not to feel like waiting.
 *
 * Sized against the confirmation itself, not by feel: the mark re-rules its crossbar over
 * `duration.focal` (620ms) after the header has finished expanding, so anything shorter navigates
 * away mid-gesture.
 */
const CONFIRM_HOLD = 820;

/**
 * The screen's own body, one level inside `Screen` — `useFocusSignal` needs the provider above it.
 */
export default function SignIn() {
  return (
    <Screen>
      <SignInBody />
    </Screen>
  );
}

function SignInBody() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const snack = useSnackbar();
  const { look } = useFocusSignal();
  const signIn = useSession((s) => s.signIn);
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<{ email?: string | null; password?: string | null }>({});
  const [busy, setBusy] = useState<null | 'password' | 'google' | 'apple'>(null);
  const [done, setDone] = useState(false);

  const land = useCallback(async (session: Awaited<ReturnType<typeof localAuth.withPassword>>) => {
    // Put the keyboard away first: the brand header expands back to full size, so the mark signs the
    // entry off at 40dp instead of at the 22dp it shrinks to while typing.
    Keyboard.dismiss();
    await signIn(session);
    setDone(true);
    // The button confirms before the screen changes under the user.
    const destination = typeof next === 'string' && next.startsWith('/divida/') ? next : '/home';
    setTimeout(() => router.replace(destination as never), CONFIRM_HOLD);
  }, [next, signIn]);

  const submit = useCallback(async () => {
    const next = { email: validateEmail(email), password: validatePassword(password) };
    setErrors(next);
    if (next.email || next.password) return;

    setBusy('password');
    try {
      await land(await localAuth.withPassword(email, password));
    } catch (e) {
      snack(e instanceof AuthError ? e.message : 'Não deu para entrar agora.', 'error');
      setBusy(null);
    }
  }, [email, password, land, snack]);

  const social = useCallback(
    async (which: 'google' | 'apple') => {
      setBusy(which);
      try {
        await land(
          which === 'google' ? await localAuth.withGoogle() : await localAuth.withApple(),
        );
      } catch (e) {
        snack(e instanceof AuthError ? e.message : 'Não deu para entrar agora.', 'error');
        setBusy(null);
      }
    },
    [land, snack],
  );

  return (
    <KeyboardAwareScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* The mark watches the form being filled in — see Wordmark. It shrinks rather than folds
          away, because the keyboard is up for exactly the window where it has something to say. */}
      <BrandHeader mood={done ? 'done' : 'idle'} />

      <View style={styles.block}>
        <Reveal index={0}>
          <Txt variant="title" f="sansSemibold">
            Bom te ver de novo.
          </Txt>
          <Txt variant="body" t="muted" style={styles.sub}>
            Entre para continuar de onde você parou.
          </Txt>
        </Reveal>

        <View style={styles.form}>
          <Field
            index={1}
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
            index={2}
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

          <Reveal index={3}>
            <Pressable
              onPress={() => {
                void Haptics.selectionAsync();
                look(1);
                router.push('/forgot');
              }}
              hitSlop={10}
              style={styles.forgot}
              accessibilityRole="button"
            >
              <Txt variant="label" t="muted">
                Esqueci minha senha
              </Txt>
            </Pressable>
          </Reveal>
        </View>

        <Reveal index={4}>
          <Button
            label="Entrar"
            onPress={submit}
            loading={busy === 'password' && !done}
            success={done}
            disabled={busy !== null && busy !== 'password'}
          />
        </Reveal>

        <Reveal index={5} style={styles.social}>
          <SocialRow
            onGoogle={() => void social('google')}
            onApple={() => void social('apple')}
            busy={busy !== null}
          />
        </Reveal>
      </View>

      <Reveal index={6} style={styles.footer}>
        <Txt variant="label" t="faint">
          Ainda não tem conta?{' '}
        </Txt>
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            // The mark glances toward the screen that is about to slide in, a beat before it
            // does. The stack animation is the same 320ms it always was; this is what makes it
            // read as intentional rather than as a default.
            look(1);
            router.push('/sign-up');
          }}
          hitSlop={12}
          accessibilityRole="button"
        >
          <Txt variant="label" f="sansSemibold" t="ink">
            Criar conta
          </Txt>
        </Pressable>
      </Reveal>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, paddingTop: space.xxxl },
  block: { flex: 1 },
  sub: { paddingTop: space.sm },
  form: { paddingTop: space.sm, paddingBottom: space.xl },
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
