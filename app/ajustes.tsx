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
import { TabBar } from '@/ui/TabBar';
import { useTabEntrance } from '@/ui/useTabEntrance';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { duration, ease, spring, useReducedMotion } from '@/theme/motion';
import { useSnackbar } from '@/ui/Snackbar';
import { saidPlainly } from '@/lib/errors';
import { useLock } from '@/lib/auth/lock';
import { useSession } from '@/lib/auth/session';
import { useLedger } from '@/state/ledger';
import { clearLedger } from '@/db/repo';
import { confirmDestructiveAction } from '@/lib/auth/lock';
import { parseDay } from '@/domain/projection';

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
 * design system — inset cards, coloured icon tiles, chevrons — and none of that vocabulary exists in
 * this one.
 */
export default function Ajustes() {
  return (
    <Screen bottomInset={false}>
      <AjustesBody />
    </Screen>
  );
}

function AjustesBody() {
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

  const entries = useLedger((s) => s.entries);
  const series = useLedger((s) => s.series);
  const accounts = useLedger((s) => s.accounts);
  const load = useLedger((s) => s.load);

  const [busy, setBusy] = useState(false);

  /**
   * The destructive action arms itself and disarms on its own.
   *
   * Confirming in the row rather than in a system `Alert` keeps this app's one voice — there is no
   * dialog anywhere else in it. But an armed state with no way out is a trap: leave it armed and the
   * next stray tap on that row wipes the ledger. So it stands down after a few seconds, which is the
   * cancel button a dialog would have had.
   */
  const [armed, setArmed] = useState<string | null>(null);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 5000);
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
          ok ? 'Trinco ligado. OTTO fecha os olhos ao sair.' : 'Não consegui confirmar que é você.',
          ok ? 'info' : 'error',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  /** A second deliberate tap arms the OS biometric prompt; neither step alone can erase data. */
  const destroy = async (key: string, prompt: string, work: () => Promise<void>, done: string) => {
    if (busy) return;
    if (armed !== key) {
      setArmed(key);
      snack('Toque novamente para confirmar. A biometria será solicitada.', 'info');
      return;
    }
    setArmed(null);
    setBusy(true);
    try {
      const confirmed = await confirmDestructiveAction(prompt);
      if (!confirmed) {
        snack('Exclusão cancelada: a biometria não foi confirmada.', 'error');
        return;
      }
      await work();
      snack(done, 'info');
    } catch (error) {
      snack(saidPlainly(error), 'error');
    } finally {
      setBusy(false);
    }
  };

  /** What the ledger holds, said plainly. The one place the app describes its own contents. */
  const held = useMemo(() => {
    const first = entries.reduce<string | null>(
      (min, e) => (min === null || e.date < min ? e.date : min),
      null,
    );
    return {
      entries: entries.length,
      series: series.length,
      accounts: accounts.filter((a) => a.kind !== 'card').length,
      cards: accounts.filter((a) => a.kind === 'card').length,
      since: first ? format(parseDay(first), "MMMM 'de' yyyy", { locale: ptBR }) : null,
    };
  }, [entries, series, accounts]);

  return (
    <>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/*
          The mark at reading size, not at header size. This is the one screen where it is the
          subject rather than the letterhead, so it is given the room to be looked at — and it is
          carrying the trinco's state while you look.
        */}
        <Reveal index={0} {...ENTER.head}>
          <View style={styles.identity}>
            <Wordmark height={40} alive mood={enabled ? 'guard' : 'idle'} />
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

        <Section label="proteção" />

        {/*
          The trinco. The row says the state in words and the mark says it in the only other way this
          app has; neither is decoration and neither is sufficient alone.
        */}
        <Reveal index={2} {...ENTER.body} rise={0}>
          <Press
            onPress={() => void toggle()}
            disabled={!ready || !available || busy}
            haptic="light"
            scale={0.995}
            style={styles.row}
            accessibilityLabel="Exigir desbloqueio ao abrir o OTTO"
            accessibilityState={{ selected: enabled, disabled: !available }}
          >
            <View style={styles.rowText}>
              <Txt variant="body" t={available ? 'ink' : 'faint'}>
                Exigir desbloqueio ao abrir
              </Txt>
              <Txt variant="micro" t="faint">
                {!ready
                  ? 'verificando este aparelho'
                  : !biometry?.hardware
                    ? 'este aparelho não tem sensor'
                    : !biometry.enrolled
                      ? `nenhuma ${biometry.name.toLowerCase()} cadastrada no aparelho`
                      : enabled
                        ? `${biometry.name} · ligado`
                        : `${biometry.name} · desligado`}
              </Txt>
            </View>
            <Latch on={enabled} dim={!available} />
          </Press>
        </Reveal>

        {/* Said once, plainly, so the control never over-promises what it covers. */}
        <Txt variant="micro" t="faint" style={styles.note}>
          Vale ao abrir o app do zero. Trocar de tela ou voltar de outro aplicativo não pede de novo.
        </Txt>

        <Section label="avisos" />
        <Press
          onPress={() => router.push('/notificacoes')}
          style={styles.row}
          accessibilityLabel="Avisos inteligentes"
        >
          <View style={styles.rowText}>
            <Txt variant="body">
              Avisos inteligentes
            </Txt>
            <Txt variant="micro" t="faint">
              escolha o que merece interromper você
            </Txt>
          </View>
          <Txt variant="micro" t="muted">abrir</Txt>
        </Press>

        <Section label="organização financeira" />

        <Press
          onPress={() => router.push('/contas')}
          style={styles.row}
          accessibilityLabel="Contas e cartões"
        >
          <View style={styles.rowText}>
            <Txt variant="body">Contas e cartões</Txt>
            <Txt variant="micro" t="faint">
              {held.accounts} {held.accounts === 1 ? 'conta' : 'contas'}
              {held.cards > 0 ? ` · ${held.cards} ${held.cards === 1 ? 'cartão' : 'cartões'}` : ''}
            </Txt>
          </View>
          <Txt variant="micro" t="muted">
            abrir
          </Txt>
        </Press>

        <Press
          onPress={() => router.push('/categorias')}
          style={styles.row}
          accessibilityLabel="Categorias"
        >
          <View style={styles.rowText}>
            <Txt variant="body">Categorias</Txt>
            <Txt variant="micro" t="faint">
              ícone, cor e o teto de cada uma
            </Txt>
          </View>
          <Txt variant="micro" t="muted">
            abrir
          </Txt>
        </Press>

        <Press
          onPress={() => router.push('/recorrencias')}
          style={styles.row}
          accessibilityLabel="Recorrências"
        >
          <View style={styles.rowText}>
            <Txt variant="body">Recorrências</Txt>
            <Txt variant="micro" t="faint">
              o que se repete todo mês, e o que termina
            </Txt>
          </View>
          <Txt variant="micro" t="muted">
            abrir
          </Txt>
        </Press>

        <Press
          onPress={() => router.push('/calendario')}
          style={styles.row}
          accessibilityLabel="Calendário financeiro"
        >
          <View style={styles.rowText}>
            <Txt variant="body">Calendário financeiro</Txt>
            <Txt variant="micro" t="faint">
              veja o que aconteceu, o que vem e o que está pendente
            </Txt>
          </View>
          <Txt variant="micro" t="muted">
            abrir
          </Txt>
        </Press>

        <Section label="seus dados" />

        <View style={styles.facts}>
          <Fact label="lançamentos" value={String(held.entries)} />
          <Fact label="recorrências" value={String(held.series)} />
          <Fact
            label={held.accounts === 1 ? 'conta' : 'contas'}
            value={String(held.accounts) + (held.cards > 0 ? ` · ${held.cards} cartão` : '')}
          />
          {held.since ? <Fact label="desde" value={held.since} /> : null}
        </View>

        <Section label="área de risco" />

        <Press
          onPress={() => router.push('/contas')}
          style={styles.row}
          accessibilityLabel="Gerenciar exclusões de contas e cartões"
        >
          <View style={styles.rowText}>
            <Txt variant="body" t="muted">
              Excluir conta ou cartão
            </Txt>
            <Txt variant="micro" t="faint">
              escolha o item em Contas e cartões e confirme com biometria
            </Txt>
          </View>
          <Txt variant="micro" t="muted">
            abrir
          </Txt>
        </Press>

        <Press
          onPress={() => void destroy(
            'all-data',
            'Confirme para apagar todos os seus dados financeiros',
            async () => { await clearLedger(); await load(); },
            'Todos os dados financeiros foram removidos.',
          )}
          disabled={busy}
          style={styles.row}
          accessibilityLabel="Remover todos os dados financeiros"
        >
          <View style={styles.rowText}>
            <Txt variant="body" t={armed === 'all-data' ? 'negative' : 'negative'}>
              {armed === 'all-data' ? 'Toque de novo e confirme sua biometria' : 'Remover todos os dados'}
            </Txt>
            <Txt variant="micro" t="faint">
              {armed === 'all-data'
                ? 'apaga contas, cartões, lançamentos e recorrências do banco'
                : 'mantém seu acesso, mas apaga seu razão definitivamente'}
            </Txt>
          </View>
        </Press>

        <Section label="sessão" />

        {/*
          Signing out lives here now, and not at the far end of the home screen's scroll where it was
          parked with a comment saying it would move when this screen existed.
        */}
        <Press
          onPress={() => {
            void signOut();
            router.replace('/sign-in');
          }}
          style={styles.row}
          accessibilityLabel="Sair da conta"
        >
          <View style={styles.rowText}>
            <Txt variant="body" t="muted">
              Sair da conta
            </Txt>
            <Txt variant="micro" t="faint">
                seu razão permanece protegido no banco
            </Txt>
          </View>
        </Press>
      </ScrollView>

      <TabBar
        active="settings"
        onCapture={() => router.push('/lancar')}
      />
    </>
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

/** One thing the ledger knows about itself. Figure first, in mono, because it is a figure. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Txt variant="body" f="monoMedium" t="ink" tabular>
        {value}
      </Txt>
      <Txt variant="micro" t="faint">
        {label}
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
  note: { paddingTop: space.xs },

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

  facts: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.md, rowGap: space.lg },
  fact: { width: '50%', paddingBottom: space.xs },
});
