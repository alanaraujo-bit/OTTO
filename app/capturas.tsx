import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { FlowAmount } from '@/ui/FlowAmount';
import { CategoryIcon } from '@/ui/CategoryIcon';
import { ChevronRight } from '@/ui/Icon';
import { useSnackbar } from '@/ui/Snackbar';
import { Txt } from '@/theme/text';
import { categoryHue, color, space } from '@/theme/tokens';
import { listLayout, rowIn, rowOut } from '@/theme/motion';
import { saidPlainly } from '@/lib/errors';
import { useLedger } from '@/state/ledger';
import { useCapture } from '@/state/capture';
import { alreadyRecorded, originOf, suggestFor, type Detected } from '@/domain/capture';
import { lookFor } from '@/domain/category';

const ENTER = { delay: 160, step: 70, cap: 6, rise: 10, shift: 26 } as const;

/**
 * Detectados: what OTTO found, waiting for a yes.
 *
 * Each row is the lançamento already written — the name, the figure, where it came from, and the
 * category and account OTTO would file it under, learned from how the owner filed the same name
 * before. Lançar is one tap; Editar opens the keypad with everything filled; Ignorar takes it away.
 * A capture that matches something already in the razão says so, so the same purchase is never
 * recorded twice by accident.
 */
export default function Capturas() {
  return (
    <Screen>
      <Body />
    </Screen>
  );
}

function Body() {
  const snack = useSnackbar();
  const { confirm: confirmParam } = useLocalSearchParams<{ confirm?: string }>();
  const items = useCapture((s) => s.items);
  const listening = useCapture((s) => s.listening);
  const supported = useCapture((s) => s.supported);
  const canListen = useCapture((s) => s.canListen);
  const refresh = useCapture((s) => s.refresh);
  const confirm = useCapture((s) => s.confirm);
  const decide = useCapture((s) => s.decide);
  const entries = useLedger((s) => s.entries);
  const accounts = useLedger((s) => s.accounts);
  const categories = useLedger((s) => s.categories);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const record = async (d: Detected) => {
    if (busy) return;
    setBusy(d.id);
    try {
      await confirm(d);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      snack(`Lançado: ${d.merchant}.`, 'info');
    } catch (e) {
      snack(saidPlainly(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  // "Lançar" pressed on OTTO's own notification arrives here with the id: it is done on arrival.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !confirmParam) return;
    const d = items.find((x) => x.id === confirmParam);
    if (!d) return;
    handled.current = true;
    void record(d);
  }, [confirmParam, items]);

  const fresh = items.filter((d) => !alreadyRecorded(d, entries));
  const all = async () => {
    for (const d of fresh) {
      try {
        await confirm(d);
      } catch (e) {
        snack(saidPlainly(e), 'error');
        return;
      }
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    snack(`${fresh.length} lançamentos feitos.`, 'info');
  };

  const edit = (d: Detected) => {
    const s = suggestFor(d, entries, accounts, categories);
    const at = new Date(d.at);
    const pad = (n: number) => String(n).padStart(2, '0');
    router.push({
      pathname: '/lancar',
      params: {
        capture: d.id,
        amount: String(d.amountCents),
        direction: d.direction,
        title: s.title,
        category: s.category,
        account: s.accountId ?? '',
        date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
        time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
      },
    });
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <BackBar onPress={() => router.back()} />
      <Reveal index={0} {...ENTER}>
        <View style={styles.heading}>
          <Txt variant="title" f="sansSemibold">
            Detectados
          </Txt>
          <Txt variant="body" t="muted" style={styles.intro}>
            {items.length
              ? `O OTTO encontrou ${items.length} ${items.length === 1 ? 'lançamento' : 'lançamentos'}. Confira e lance com um toque.`
              : 'O que o OTTO encontrar nas notificações do seu banco, nos comprovantes e nas notas fiscais aparece aqui.'}
          </Txt>
        </View>
      </Reveal>

      {fresh.length > 1 ? (
        <Reveal index={1} {...ENTER} rise={0} style={styles.allBlock}>
          <Button label={`Lançar ${fresh.length} de uma vez`} onPress={() => void all()} disabled={busy !== null} />
        </Reveal>
      ) : null}

      <Reveal index={2} {...ENTER} rise={0}>
        {items.map((d) => (
          <Animated.View key={d.id} entering={rowIn} exiting={rowOut} layout={listLayout}>
            <Row
              d={d}
              busy={busy === d.id}
              twice={alreadyRecorded(d, entries)}
              suggestion={suggestFor(d, entries, accounts, categories)}
              accountName={(id) => accounts.find((a) => a.id === id)?.name ?? ''}
              categoryLook={(name) => lookFor(name, categories)}
              onRecord={() => void record(d)}
              onEdit={() => edit(d)}
              onIgnore={() => {
                decide(d.id);
                void Haptics.selectionAsync();
              }}
            />
          </Animated.View>
        ))}
      </Reveal>

      {items.length === 0 ? (
        <Reveal index={3} {...ENTER} rise={0}>
          <View style={styles.empty}>
            <View style={styles.rule} />
            <Txt variant="body" t={listening ? 'muted' : 'ink'}>
              {!supported || !canListen
                ? 'Compartilhe um comprovante com o OTTO ou leia o QR de uma nota fiscal: o lançamento aparece aqui, pronto para confirmar.'
                : listening
                  ? 'Nada novo por aqui. Quando seu banco avisar de uma compra ou de um Pix, ele aparece neste lugar.'
                  : 'Ligue o lançamento automático e o OTTO passa a ler as notificações do seu banco.'}
            </Txt>
          </View>
        </Reveal>
      ) : null}

      <Reveal index={4} {...ENTER} rise={0}>
        <View style={styles.links}>
          <Door title="Ler nota fiscal" hint="aponte para o QR do cupom" onPress={() => router.push('/nota')} />
          <Door
            title="Lançamento automático"
            hint={listening ? 'ligado · bancos, comprovantes e notas' : canListen ? 'desligado · toque para ligar' : 'comprovantes e notas fiscais'}
            onPress={() => router.push('/automatico')}
          />
        </View>
      </Reveal>
    </ScrollView>
  );
}

function Row({
  d,
  busy,
  twice,
  suggestion,
  accountName,
  categoryLook,
  onRecord,
  onEdit,
  onIgnore,
}: {
  d: Detected;
  busy: boolean;
  twice: boolean;
  suggestion: ReturnType<typeof suggestFor>;
  accountName: (id: string | null) => string;
  categoryLook: (name: string) => ReturnType<typeof lookFor>;
  onRecord: () => void;
  onEdit: () => void;
  onIgnore: () => void;
}) {
  const look = categoryLook(suggestion.category);
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <View style={styles.rowText}>
          <Txt variant="heading" f="sansSemibold" numberOfLines={1}>
            {d.merchant}
          </Txt>
          <Txt variant="micro" t="faint" numberOfLines={1} style={styles.meta}>
            {[originOf(d), when(d.at)].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        <FlowAmount cents={d.amountCents} direction={d.direction} size="heading" />
      </View>

      <View style={styles.suggestion}>
        <CategoryIcon name={look.icon} size={16} tint={categoryHue[look.hue]} />
        <Txt variant="label" t="muted" numberOfLines={1} style={styles.suggestionText}>
          {[suggestion.category, accountName(suggestion.accountId)].filter(Boolean).join(' · ')}
        </Txt>
      </View>

      {twice ? (
        <Txt variant="micro" t="warning" style={styles.twice}>
          Parece já estar no seu razão: mesmo valor, mesmo dia.
        </Txt>
      ) : null}

      <View style={styles.actions}>
        <Press
          onPress={onRecord}
          disabled={busy}
          haptic="light"
          scale={0.96}
          style={[styles.primary, twice ? styles.primaryQuiet : null]}
          accessibilityLabel={`Lançar ${d.merchant}`}
        >
          <Txt variant="label" f="sansSemibold" t={twice ? 'ink' : 'onInk'} center>
            {busy ? 'Lançando…' : 'Lançar'}
          </Txt>
        </Press>
        <Press onPress={onEdit} style={styles.secondary} accessibilityLabel={`Editar ${d.merchant} antes de lançar`}>
          <Txt variant="label" t="muted" center>
            Editar
          </Txt>
        </Press>
        <Press onPress={onIgnore} style={styles.secondary} haptic="none" accessibilityLabel={`Ignorar ${d.merchant}`}>
          <Txt variant="label" t="faint" center>
            Ignorar
          </Txt>
        </Press>
      </View>
    </View>
  );
}

function Door({ title, hint, onPress }: { title: string; hint: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} style={styles.door} accessibilityLabel={`${title}. ${hint}`}>
      <View style={styles.rowText}>
        <Txt variant="body">{title}</Txt>
        <Txt variant="micro" t="faint">
          {hint}
        </Txt>
      </View>
      <ChevronRight tint={color.inkFaint} />
    </Press>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  const hour = format(d, 'H:mm');
  if (isToday(d)) return `hoje, ${hour}`;
  if (isYesterday(d)) return `ontem, ${hour}`;
  return format(d, "d 'de' MMM, H:mm", { locale: ptBR });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.sm, paddingBottom: space.xxxl },
  heading: { paddingTop: space.lg },
  intro: { paddingTop: space.xs },
  allBlock: { paddingTop: space.xl },

  row: {
    paddingVertical: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  rowText: { flex: 1 },
  meta: { paddingTop: 2 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.sm },
  suggestionText: { flex: 1 },
  twice: { paddingTop: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingTop: space.md },
  primary: {
    minHeight: 40,
    paddingHorizontal: space.xl,
    borderRadius: 20,
    backgroundColor: color.ink,
    justifyContent: 'center',
  },
  primaryQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.hairlineStrong },
  secondary: { minHeight: 40, paddingHorizontal: space.md, justifyContent: 'center' },

  empty: { paddingTop: space.xl },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginBottom: space.lg },
  links: { paddingTop: space.xxl },
  door: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
});
