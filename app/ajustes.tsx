import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '@/ui/Screen';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Wordmark } from '@/ui/Wordmark';
import { ChevronRight } from '@/ui/Icon';
import { useTabBarClearance } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { useSnackbar } from '@/ui/Snackbar';
import { useLock } from '@/lib/auth/lock';
import { useSession } from '@/lib/auth/session';
import { useLedger } from '@/state/ledger';

/**
 * The only screen in this app that talks about the app rather than about the money.
 *
 * **The authored idea: the mark is the control.** OTTO's whole identity is that its two O's are
 * eyes, and that they close while a password is masked — the product saying, in the only language a
 * logo has, that it is not reading over your shoulder. The trinco is that same gesture promoted from
 * a reaction to a setting: switch it on and **OTTO closes his eyes and keeps them closed**. Switch it
 * off and he opens, wide, because you decided to open them. The state of the lock is not reported by
 * the mark; it *is* the mark.
 *
 * That is only allowed because the setting is also stated in words on the row itself. The eyes are
 * the reading; they are never the only copy of it — reduced motion, web, and a stalled animation
 * layer all have to leave a screen that still says what is on and what is off.
 *
 * Everything here is a rule and a row. A settings screen is where an app usually grows its second
 * design system — inset cards, coloured icon tiles — and none of that vocabulary exists in this one.
 * The one thing borrowed is the arrow on a row that opens a place, because it is the mark a
 * first-time owner reads as "this goes somewhere" without being told.
 *
 * It is a map, in three groups by whose things they are: the money's parts, how the app behaves,
 * and the account. Deleting things lives one level down, in Privacidade e dados, so this list never
 * ends on a danger zone.
 */
export default function Ajustes() {
  return (
    <Screen bottomInset={false}>
      <AjustesBody />
    </Screen>
  );
}

function AjustesBody() {
  const clearance = useTabBarClearance();
  // One arrival for all four tabs, carrying the direction of the move that produced it.
  const ENTER = useTabEntrance();

  const snack = useSnackbar();
  const session = useSession((s) => s.session);
  const signOut = useSession((s) => s.signOut);

  const ready = useLock((s) => s.ready);
  const enabled = useLock((s) => s.enabled);
  const biometry = useLock((s) => s.biometry);
  const probe = useLock((s) => s.probe);
  const enable = useLock((s) => s.enable);
  const disable = useLock((s) => s.disable);

  const series = useLedger((s) => s.series);
  const accounts = useLedger((s) => s.accounts);
  const caps = useLedger((s) => s.caps);
  const load = useLedger((s) => s.load);

  const [busy, setBusy] = useState(false);

  /** Sair arms first and stands down on its own, so one stray tap on the last row costs nothing. */
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    void probe();
    void load();
  }, [probe, load]);

  const available = Boolean(biometry?.hardware && biometry?.enrolled);

  const toggle = async () => {
    if (busy || !available) return;
    setBusy(true);
    try {
      if (enabled) {
        await disable();
        snack('Trinco desligado.', 'info');
      } else {
        const ok = await enable();
        snack(
          ok ? 'Trinco ligado. OTTO fecha os olhos ao sair.' : 'Não foi possível confirmar que é você.',
          ok ? 'info' : 'error',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  /* Each door says what is behind it, in numbers where there are numbers, so the list reads as a
     map of the app rather than as a column of names. */
  const count = useMemo(() => {
    const holding = accounts.filter((a) => a.kind !== 'card').length;
    const cards = accounts.filter((a) => a.kind === 'card').length;
    return {
      accounts:
        `${holding} ${holding === 1 ? 'conta' : 'contas'}` +
        (cards > 0 ? ` · ${cards} ${cards === 1 ? 'cartão' : 'cartões'}` : ''),
      series:
        series.length === 0
          ? 'salário, aluguel, assinaturas e parcelas'
          : `${series.length} ${series.length === 1 ? 'cadastrada' : 'cadastradas'} · salário, aluguel, parcelas`,
      caps:
        caps.length === 0
          ? 'o máximo que você aceita gastar por categoria'
          : `${caps.length} ${caps.length === 1 ? 'categoria com teto' : 'categorias com teto'}`,
    };
  }, [accounts, series, caps]);

  return (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scroll, { paddingBottom: clearance }]}
        showsVerticalScrollIndicator={false}
      >
        {/*
          The mark at the same 22dp every other tab carries it at. It still carries the trinco's
          state; the line under it says the same in words.
        */}
        <Reveal index={0} {...ENTER.head}>
          <View style={styles.identity}>
            <Wordmark height={22} alive mood={enabled ? 'guard' : 'idle'} />
            <Txt variant="micro" t="faint" style={styles.eyebrow}>
              {enabled ? 'de olhos fechados' : 'de olhos abertos'}
            </Txt>
          </View>
        </Reveal>

        <Reveal index={1} {...ENTER.body}>
          <View style={styles.account}>
            <Txt variant="heading" f="sansSemibold" numberOfLines={1}>
              {session?.name || 'Sem nome'}
            </Txt>
            <Txt variant="body" t="muted" numberOfLines={1}>
              {session?.email ?? '—'}
            </Txt>
            <Txt variant="micro" t="faint" style={styles.since}>
              {providerLabel(session?.provider)}
              {session ? ` · desde ${format(session.createdAt, "d 'de' MMM 'de' yyyy", { locale: ptBR })}` : ''}
            </Txt>
          </View>
        </Reveal>

        {/*
          Three groups, by whose they are. The money's parts first, because they are what an owner
          comes here for most; the app's behaviour second; the account itself last. These rows used
          to be one list that ran from the trinco to "área de risco", and the parts of the app that
          are not settings at all — accounts, the calendar — were filed under a heading nobody reads
          as "where things are".
        */}
        <Reveal index={2} {...ENTER.body} rise={0}>
          <Section label="seu dinheiro" />
          <Door
            title="Contas e cartões"
            hint={count.accounts}
            onPress={() => router.push('/contas')}
          />
          <Door
            title="Recorrências"
            hint={count.series}
            onPress={() => router.push('/recorrencias')}
          />
          <Door
            title="Categorias"
            hint="nomes, ícones e cores"
            onPress={() => router.push('/categorias')}
          />
          <Door title="Tetos de gasto" hint={count.caps} onPress={() => router.push('/tetos')} />
          <Door
            title="Calendário"
            hint="o que entra, o que sai e o que vence, dia a dia"
            onPress={() => router.push('/calendario')}
          />
        </Reveal>

        <Reveal index={3} {...ENTER.body} rise={0}>
          <Section label="segurança e avisos" />
          {/*
            The trinco. The row says the state in words and the mark says it in the only other way this
            app has; neither is decoration and neither is sufficient alone.
          */}
          <Press
            onPress={() => void toggle()}
            disabled={!ready || !available || busy}
            haptic="light"
            scale={0.995}
            style={styles.row}
            accessibilityLabel="Pedir biometria ao abrir o OTTO"
            accessibilityState={{ selected: enabled, disabled: !available }}
          >
            <View style={styles.rowText}>
              <Txt variant="body" t={available ? 'ink' : 'faint'}>
                Pedir biometria ao abrir
              </Txt>
              <Txt variant="micro" t="faint">
                {!ready
                  ? 'verificando este aparelho'
                  : !biometry?.hardware
                    ? 'este aparelho não tem sensor'
                    : !biometry.enrolled
                      ? 'nenhuma biometria cadastrada no aparelho'
                      : enabled
                        ? `${biometry.name} · ligado · vale ao abrir o app do zero`
                        : `${biometry.name} · desligado`}
              </Txt>
            </View>
            <Latch on={enabled} dim={!available} />
          </Press>
          <Door
            title="Avisos"
            hint="o que merece uma notificação, e quando"
            onPress={() => router.push('/notificacoes')}
          />
        </Reveal>

        <Reveal index={4} {...ENTER.body} rise={0}>
          <Section label="sua conta" />
          <Door
            title="Privacidade e dados"
            hint="o que está guardado, e como apagar"
            onPress={() => router.push('/dados')}
          />
          {/* No biometry — nothing is lost by leaving, so the second tap is the whole confirmation. */}
          <Press
            onPress={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              setArmed(false);
              void signOut();
              router.replace('/sign-in');
            }}
            style={styles.row}
            accessibilityLabel={armed ? 'Toque de novo para sair' : 'Sair da conta'}
          >
            <View style={styles.rowText}>
              <Txt variant="body" t={armed ? 'ink' : 'muted'}>
                {armed ? 'Toque de novo para sair' : 'Sair da conta'}
              </Txt>
              <Txt variant="micro" t="faint">
                seu razão continua guardado para quando você voltar
              </Txt>
            </View>
          </Press>
        </Reveal>
      </ScrollView>
    </>
  );
}

/**
 * A row that opens a place. The arrow is the one mark a first-time owner reads without being told:
 * the old rows said "abrir" in micro type at the far edge, which looked like a caption, not a door.
 */
function Door({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={styles.row} accessibilityLabel={`${title}. ${hint}`}>
      <View style={styles.rowText}>
        <Txt variant="body">{title}</Txt>
        <Txt variant="micro" t="faint" numberOfLines={1}>
          {hint}
        </Txt>
      </View>
      <ChevronRight tint={color.inkFaint} />
    </Press>
  );
}

/**
 * The latch itself: a rule that slides, not a pill that fills.
 *
 * A stock switch would be the second selection grammar in an app whose answer to "this one is
 * chosen" is always a rule — the tab bar's marker, the segmented control in lançar, the focus line
 * under a field. So the travelling part is a rule, and it is the same weight as every other one.
 */
function Latch({ on, dim }: { on: boolean; dim: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    t.value = reduced
      ? withTiming(on ? 1 : 0, { duration: duration.state, easing: ease.out })
      : withSpring(on ? 1 : 0, spring.crisp);
  }, [on, reduced, t]);

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * (LATCH_W - LATCH_KNOB) }],
    backgroundColor: on ? color.ink : color.inkFaint,
  }));
  const rail = useAnimatedStyle(() => ({ opacity: dim ? 0.35 : 1 }));

  return (
    <Animated.View style={[styles.latch, rail]}>
      <View style={styles.latchTrack} />
      <Animated.View style={[styles.latchKnob, knob]} />
    </Animated.View>
  );
}

/** A group boundary, drawn the way this world draws one: a rule, then the label under it. */
function Section({ label }: { label: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRule} />
      <Txt variant="micro" f="sansMedium" t="muted" style={styles.sectionLabel}>
        {label.toUpperCase()}
      </Txt>
    </View>
  );
}

function providerLabel(p?: 'password' | 'google' | 'apple'): string {
  return p === 'google' ? 'Entrou com Google' : p === 'apple' ? 'Entrou com Apple' : 'E-mail e senha';
}

const LATCH_W = 44;
const LATCH_KNOB = 20;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.md, paddingBottom: space.xxl },

  identity: { alignItems: 'flex-start', paddingTop: space.lg },
  eyebrow: { paddingTop: space.sm },

  account: { paddingTop: space.xl },
  since: { paddingTop: space.xs },

  section: { paddingTop: space.xxl },
  sectionRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  sectionLabel: { letterSpacing: 0.8, paddingTop: space.md },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
  },
  rowText: { flex: 1, paddingRight: space.lg },

  /* A rule with a travelling segment on it, not a pill with a dot in it. This app answers "this one
     is chosen" with a rule everywhere else — the tab marker, the segmented control, the focus line
     under a field — and a bordered capsule read on the device as a button with a minus sign in it. */
  latch: { width: LATCH_W, height: 12, justifyContent: 'center' },
  latchTrack: { height: 2, borderRadius: 1, backgroundColor: color.hairline },
  latchKnob: {
    position: 'absolute',
    width: LATCH_KNOB,
    height: 2,
    borderRadius: 1,
  },

});
