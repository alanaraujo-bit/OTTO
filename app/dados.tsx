import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { ChevronRight } from '@/ui/Icon';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { saidPlainly } from '@/lib/errors';
import { confirmDestructiveAction, useLock } from '@/lib/auth/lock';
import { useSession } from '@/lib/auth/session';
import { useLedger } from '@/state/ledger';
import { clearLedger, deleteOttoAccount } from '@/db/repo';
import { parseDay } from '@/domain/projection';

/**
 * Privacidade e dados: what OTTO holds, and the ways to make it hold nothing.
 *
 * These rows used to close the Ajustes scroll, under the trinco and the five doors into the money —
 * so a first-time owner reading "ajustes" met "área de risco" as part of the same list, and an owner
 * looking for how to delete their account had to scroll past everything else to find it. Apart, the
 * settings screen is a list of places, and this one is the single place that ends things.
 */
export default function Dados() {
  return (
    <Screen>
      <DadosBody />
    </Screen>
  );
}

function DadosBody() {
  const snack = useSnackbar();
  const signOut = useSession((s) => s.signOut);

  const ready = useLock((s) => s.ready);
  const biometry = useLock((s) => s.biometry);
  const probe = useLock((s) => s.probe);

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

  /**
   * A second deliberate tap arms the OS biometric prompt; neither step alone can erase data.
   *
   * With no biometry enrolled the protection still holds — nothing is deleted — but the row says
   * why up front and the tap explains what to do, instead of arming, failing silently at the OS, and
   * then reporting "a biometria não foi confirmada" as if the owner had refused it (AJ-04).
   */
  const destroy = async (key: string, prompt: string, work: () => Promise<void>, done: string) => {
    if (busy) return;
    if (ready && !available) {
      snack(
        biometry?.hardware
          ? 'Excluir pede sua biometria, e não há nenhuma cadastrada. Cadastre uma nas configurações do Android e volte aqui.'
          : 'Excluir pede biometria, e este aparelho não tem sensor.',
        'error',
      );
      return;
    }
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
        snack('Nada foi excluído: a biometria não confirmou.', 'error');
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

  const ENTER = { step: 70, cap: 6 } as const;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BackBar onPress={() => router.back()} />
      <Reveal index={0} {...ENTER}>
        <View style={styles.heading}>
          <Txt variant="title" f="sansSemibold">
            Privacidade e dados
          </Txt>
          <Txt variant="body" t="muted" style={styles.intro}>
            O que o OTTO guarda sobre o seu dinheiro, e como apagar.
          </Txt>
        </View>
      </Reveal>

      <Reveal index={1} {...ENTER}>
        <Section label="o que está guardado" />
        <View style={styles.facts}>
          <Fact label="lançamentos" value={String(held.entries)} />
          <Fact label="recorrências" value={String(held.series)} />
          <Fact label={held.accounts === 1 ? 'conta' : 'contas'} value={String(held.accounts)} />
          {held.cards > 0 ? (
            <Fact label={held.cards === 1 ? 'cartão' : 'cartões'} value={String(held.cards)} />
          ) : null}
          {held.since ? <Fact label="desde" value={held.since} /> : null}
        </View>
      </Reveal>

      <Reveal index={2} {...ENTER} rise={0}>
        <Section label="apagar" />
        <Txt variant="micro" t="faint" style={styles.note}>
          Toda exclusão pede dois toques e a sua biometria. Não dá para desfazer.
        </Txt>

        <Press
          onPress={() => router.push('/contas')}
          style={styles.row}
          accessibilityLabel="Excluir conta bancária ou cartão"
        >
          {/* "conta bancária": a bare "conta" next to "Excluir minha conta OTTO" read as the login. */}
          <View style={styles.rowText}>
            <Txt variant="body" t="muted">
              Excluir uma conta bancária ou cartão
            </Txt>
            <Txt variant="micro" t="faint">
              escolha o item em Contas e cartões
            </Txt>
          </View>
          <ChevronRight tint={color.inkFaint} />
        </Press>

        <Press
          onPress={() =>
            void destroy(
              'all-data',
              'Confirme para excluir todos os seus dados financeiros',
              async () => {
                await clearLedger();
                await load();
              },
              'Todos os dados financeiros foram excluídos.',
            )
          }
          disabled={busy}
          style={styles.row}
          accessibilityLabel={
            armed === 'all-data' ? 'Toque de novo e confirme sua biometria' : 'Excluir todos os dados financeiros'
          }
        >
          {/*
            Red only once it is armed — the one moment red is allowed to mean something other than
            money (a destructive action about to happen). At rest it was red permanently, which made
            it the loudest row on the screen for an action nobody takes (AJ-05).
          */}
          <View style={styles.rowText}>
            <Txt variant="body" t={armed === 'all-data' ? 'negative' : 'muted'}>
              {armed === 'all-data' ? 'Toque de novo e confirme sua biometria' : 'Excluir todos os dados'}
            </Txt>
            <Txt variant="micro" t="faint">
              {ready && !available
                ? 'pede biometria: cadastre uma nas configurações do Android para poder excluir'
                : armed === 'all-data'
                  ? 'exclui contas, cartões, lançamentos e recorrências do banco'
                  : 'mantém seu login, mas apaga o seu razão para sempre'}
            </Txt>
          </View>
        </Press>

        {/* Google Play requires an in-app path to delete the account itself, not only its data. */}
        <Press
          onPress={() =>
            void destroy(
              'account',
              'Confirme para excluir sua conta OTTO',
              async () => {
                await deleteOttoAccount();
                await signOut();
                router.replace('/sign-in');
              },
              'Sua conta OTTO foi excluída.',
            )
          }
          disabled={busy}
          style={styles.row}
          accessibilityLabel={
            armed === 'account' ? 'Toque de novo e confirme sua biometria' : 'Excluir minha conta OTTO'
          }
        >
          <View style={styles.rowText}>
            <Txt variant="body" t={armed === 'account' ? 'negative' : 'muted'}>
              {armed === 'account' ? 'Toque de novo e confirme sua biometria' : 'Excluir minha conta OTTO'}
            </Txt>
            <Txt variant="micro" t="faint">
              {ready && !available
                ? 'pede biometria: cadastre uma nas configurações do Android para poder excluir'
                : 'apaga login, razão, dívidas compartilhadas e o uso do assistente'}
            </Txt>
          </View>
        </Press>
      </Reveal>
    </ScrollView>
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

/**
 * One thing the ledger knows about itself. Figure first, in mono because it is a figure — and only
 * then: "setembro de 2026" is a date written as words, which is sans like every other word.
 */
function Fact({ label, value }: { label: string; value: string }) {
  const figure = /^\d+$/.test(value);
  return (
    <View style={styles.fact}>
      <Txt variant="body" f={figure ? 'monoMedium' : 'sansMedium'} t="ink" tabular={figure}>
        {value}
      </Txt>
      <Txt variant="micro" t="faint">
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.sm, paddingBottom: space.xxxl },
  heading: { paddingTop: space.lg },
  intro: { paddingTop: space.xs },

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

  facts: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.md, rowGap: space.lg },
  fact: { width: '50%', paddingBottom: space.xs },
});
