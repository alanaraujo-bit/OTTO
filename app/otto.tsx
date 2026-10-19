import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useAudioRecorderState, type AudioRecorder } from 'expo-audio';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Amount } from '@/ui/Amount';
import { ArrowUp, Check, Close, Mic } from '@/ui/Icon';
import { Txt } from '@/theme/text';
import { color, font, HIT, space, type } from '@/theme/tokens';
import { useReducedMotion } from '@/theme/motion';
import { useLedger } from '@/state/ledger';
import { useSession } from '@/lib/auth/session';
import { useChat, type Bubble } from '@/assistant/chat';
import { canDictate, MAX_DICTATION_MS, useDictation } from '@/assistant/dictation';
import { dayKey, monthCurve } from '@/domain/projection';

/**
 * Otto — ask the ledger, in words.
 *
 * **A transcript, not a messenger.** The visual world bans cards as scaffolding, so the conversation
 * is set the way the rest of the ledger is: lines of text on the dark ground, the owner's words
 * pushed right and muted, Otto's left and in ink, groups separated by space rather than boxed into
 * bubbles. Figures inside Otto's sentences are re-set in Geist Mono with tabular digits, so a
 * R$ 1.234,56 in a reply reads exactly like one on the Home.
 *
 * **The one thing that is ruled off is the confirmation**, because it is the one thing here that
 * changes money. A proposed write arrives between two hairlines with every field it will set spelled
 * out — value, day, account, installments — and nothing is written until Confirmar. A destructive
 * one says so in `negative` and the button says Apagar, not Confirmar.
 *
 * **The empty state keeps the numeral as hero.** Before the first question the screen shows what
 * the owner can spend until the month ends — the same trough the Home's curve is built on — because
 * that is the question most people open this to ask, and an empty chat screen with nothing to read
 * is a wasted arrival.
 *
 * **Speech goes into the draft, not into the conversation.** The microphone beside Enviar records,
 * the server transcribes, and the words are set into the input to be read and corrected — a figure
 * mis-heard is a figure the owner must see before Otto acts on it.
 */
export default function Otto() {
  return (
    <Screen>
      <OttoBody />
    </Screen>
  );
}

const SUGGESTIONS = [
  'Quanto devo mês que vem?',
  'Quanto posso gastar este mês?',
  'Criar uma dívida',
  'Atualizar meu saldo',
] as const;

/** The server refuses a longer message, so the input — typed or dictated — stops here. */
const MAX_DRAFT = 2000;

function OttoBody() {
  const session = useSession((s) => s.session);
  const bubbles = useChat((s) => s.bubbles);
  const thinking = useChat((s) => s.thinking);
  const error = useChat((s) => s.error);
  const send = useChat((s) => s.send);
  const retry = useChat((s) => s.retry);
  const reset = useChat((s) => s.reset);
  const claim = useChat((s) => s.claim);

  const load = useLedger((s) => s.load);
  const ready = useLedger((s) => s.ready);
  const ledgerError = useLedger((s) => s.error);
  const accounts = useLedger((s) => s.accounts);
  const entries = useLedger((s) => s.entries);
  const series = useLedger((s) => s.series);
  const deferrals = useLedger((s) => s.deferralsBySlot);

  const [draft, setDraft] = useState('');
  const scroll = useRef<ScrollView>(null);
  // Dictation adds to what is already typed rather than replacing it, within the input's own limit.
  const dictation = useDictation((text) =>
    setDraft((d) => (d.trim() ? `${d.trimEnd()} ${text}` : text).slice(0, MAX_DRAFT)),
  );

  // A conversation belongs to whoever is signed in. Another owner on this phone starts clean.
  useEffect(() => {
    if (session) claim(session.id);
  }, [session, claim]);

  useEffect(() => {
    void load();
  }, [load]);

  const spendable = useMemo(() => {
    if (!ready || ledgerError) return null;
    return monthCurve(accounts, entries, series, dayKey(new Date()), deferrals).trough.balance;
  }, [ready, ledgerError, accounts, entries, series, deferrals]);

  const firstName = session?.name.trim().split(/\s+/)[0] ?? '';
  const empty = bubbles.length === 0;
  const canSend = draft.trim().length > 0 && !thinking;

  const submit = (text: string) => {
    const t = text.trim();
    if (!t || thinking || dictation.phase !== 'idle') return;
    setDraft('');
    void send(t);
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.bar}>
        <BackBar />
        <Txt variant="body" f="sansSemibold" style={styles.barTitle}>
          Otto
        </Txt>
        {empty ? (
          <View style={styles.barSide} />
        ) : (
          <Press
            onPress={reset}
            style={styles.barAction}
            accessibilityLabel="Começar uma nova conversa"
          >
            <Txt variant="label" t="muted">
              Nova conversa
            </Txt>
          </Press>
        )}
      </View>

      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
      >
        {empty ? (
          <Animated.View entering={FadeIn.duration(260)}>
            <View style={styles.hero}>
              {spendable === null ? (
                <Txt variant="display" f="monoSemibold" t="faint" tabular>
                  —
                </Txt>
              ) : (
                <Amount cents={spendable} size="hero" tone={spendable < 0 ? 'negative' : 'ink'} />
              )}
              <Txt variant="label" t="muted" style={styles.heroLabel}>
                {/* A month that dips below zero has nothing to spend, and "R$ 0,00" would hide by how
                    much — so the figure becomes the dip itself, said as what it is. */}
                {spendable !== null && spendable < 0
                  ? 'o mês fica negativo nesse ponto'
                  : 'dá para gastar até o fim do mês'}
              </Txt>
            </View>

            <Txt variant="heading" f="sansSemibold" style={styles.greet}>
              {firstName ? `Oi, ${firstName}.` : 'Oi.'}
            </Txt>
            <Txt variant="body" t="muted" style={styles.greetSub}>
              Pergunte qualquer coisa sobre o seu dinheiro no OTTO, ou peça para eu registrar, pagar,
              adiar ou corrigir algo. Eu mostro antes de mudar qualquer coisa.
            </Txt>

            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Press
                  key={s}
                  onPress={() => submit(s)}
                  style={styles.suggestion}
                  accessibilityLabel={`Perguntar: ${s}`}
                >
                  <Txt variant="body">{s}</Txt>
                </Press>
              ))}
            </View>
          </Animated.View>
        ) : (
          bubbles.map((b, i) => (
            <Line key={b.id} bubble={b} gapAbove={i > 0 && bubbles[i - 1]?.kind !== b.kind} />
          ))
        )}

        {thinking ? <Typing /> : null}

        {error ? (
          <View style={styles.error} accessibilityLiveRegion="polite">
            <Txt variant="body" t="warning">
              {error.text}
            </Txt>
            {error.retry ? (
              <Press onPress={() => void retry()} style={styles.retry} accessibilityLabel="Tentar de novo">
                <Txt variant="label" f="sansMedium">
                  Tentar de novo
                </Txt>
              </Press>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        {dictation.phase === 'recording' ? (
          <Recording recorder={dictation.recorder} onCancel={dictation.cancel} onDone={dictation.finish} />
        ) : dictation.phase === 'transcribing' ? (
          <Transcribing />
        ) : (
          <>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Pergunte ao Otto"
              placeholderTextColor={color.inkFaint}
              style={styles.input}
              multiline
              maxLength={MAX_DRAFT}
              selectionColor={color.ink}
              cursorColor={color.ink}
              accessibilityLabel="Mensagem para o Otto"
              onSubmitEditing={() => submit(draft)}
              submitBehavior="submit"
              returnKeyType="send"
            />
            {canDictate ? (
              <Press
                onPress={() => void dictation.start()}
                disabled={dictation.phase !== 'idle'}
                haptic="light"
                style={styles.send}
                accessibilityLabel="Falar em vez de digitar"
                accessibilityState={{ disabled: dictation.phase !== 'idle' }}
              >
                <Mic tint={color.inkMuted} />
              </Press>
            ) : null}
            <Press
              onPress={() => submit(draft)}
              disabled={!canSend}
              haptic="light"
              style={styles.send}
              accessibilityLabel="Enviar"
              accessibilityState={{ disabled: !canSend }}
            >
              <ArrowUp tint={canSend ? color.ink : color.inkFaint} />
            </Press>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Line({ bubble: b, gapAbove }: { bubble: Bubble; gapAbove: boolean }) {
  if (b.kind === 'user') {
    return (
      <Animated.View entering={FadeIn.duration(180)} style={[styles.user, gapAbove && styles.gap]}>
        <Txt variant="body" t="muted" style={styles.userText}>
          {b.text}
        </Txt>
      </Animated.View>
    );
  }
  if (b.kind === 'otto') {
    return (
      <Animated.View
        entering={FadeIn.duration(260)}
        style={[styles.otto, gapAbove && styles.gap]}
        accessibilityLiveRegion="polite"
      >
        <Rich text={b.text} />
      </Animated.View>
    );
  }
  return <ActionCard bubble={b} />;
}

/**
 * Otto's words, with its figures set as figures.
 *
 * Three marks are honoured and nothing else: `**negrito**`, which the instructions allow sparingly;
 * a line opening with `- `, `* ` or `• `, which the model writes for a list however it is told, and
 * which is set as a bullet with a hanging indent rather than shown as a stray hyphen; and any R$
 * amount, which is re-set in mono with tabular digits. A negative amount — the minus the formatter
 * writes — takes `negative`; every other figure stays in ink, because a sentence about a bill is not
 * itself money moving.
 *
 * The list marker is read off the line before the amounts are, and that order matters: "- R$ 234,35"
 * as a list item would otherwise match the amount pattern with its minus, and a bill would be set
 * as a negative figure because of a bullet.
 */
function Rich({ text }: { text: string }) {
  return (
    <View>
      {text.split('\n').map((line, i) => {
        const item = /^\s*[-*•]\s+(.*)$/.exec(line);
        if (item) {
          return (
            <View key={i} style={styles.bullet}>
              <Txt variant="body" t="faint">•</Txt>
              <Txt variant="body" style={styles.bulletText}>
                {inline(item[1] as string)}
              </Txt>
            </View>
          );
        }
        // A blank line is a paragraph break: a little air, never an empty line of type.
        if (!line.trim()) return <View key={i} style={styles.paragraph} />;
        return (
          <Txt key={i} variant="body">
            {inline(line)}
          </Txt>
        );
      })}
    </View>
  );
}

function inline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|[−-]?\s?R\$\s?\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g);
  return parts.map((p, i) => {
    if (!p) return null;
    if (p.startsWith('**') && p.endsWith('**')) {
      return (
        <Txt key={i} variant="body" f="sansSemibold">
          {p.slice(2, -2)}
        </Txt>
      );
    }
    if (/R\$/.test(p)) {
      const negative = /^[−-]/.test(p);
      return (
        <Txt key={i} variant="body" f="monoMedium" t={negative ? 'negative' : 'ink'} tabular>
          {p}
        </Txt>
      );
    }
    return p;
  });
}

function ActionCard({ bubble: b }: { bubble: Extract<Bubble, { kind: 'action' }> }) {
  const confirm = useChat((s) => s.confirm);
  const cancel = useChat((s) => s.cancel);
  const { plan, state } = b;
  const live = state === 'pending' || state === 'working';

  useEffect(() => {
    if (state === 'failed') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [state]);

  return (
    <Animated.View entering={FadeIn.duration(220)} style={styles.card}>
      <View style={[styles.cardRule, plan.destructive && styles.cardRuleDanger]} />
      <Txt
        variant="micro"
        f="sansMedium"
        t={plan.destructive ? 'negative' : 'muted'}
        style={styles.cardLabel}
      >
        {(live ? `confirmar · ${plan.title}` : plan.title).toUpperCase()}
      </Txt>

      <View style={styles.cardLines}>
        {plan.lines.map((l, i) => (
          <View key={`${l.label}-${i}`} style={styles.cardLine}>
            <Txt variant="label" t="faint" style={styles.cardKey}>
              {l.label}
            </Txt>
            <Txt
              variant="body"
              f={l.mono ? 'mono' : 'sans'}
              t={l.tone ?? 'ink'}
              tabular={l.mono}
              style={styles.cardValue}
            >
              {l.value}
            </Txt>
          </View>
        ))}
      </View>

      {plan.note ? (
        <Txt variant="micro" t="faint" style={styles.cardNote}>
          {plan.note}
        </Txt>
      ) : null}

      {live ? (
        <View style={styles.cardActions}>
          <Button
            label={plan.destructive ? 'Apagar' : 'Confirmar'}
            onPress={() => void confirm(b.callId)}
            loading={state === 'working'}
            accessibilityHint={`${plan.title}. ${plan.lines.map((l) => `${l.label}: ${l.value}`).join('. ')}`}
          />
          <Press
            onPress={() => void cancel(b.callId)}
            disabled={state === 'working'}
            style={styles.cardCancel}
            accessibilityLabel={`Cancelar: ${plan.title}`}
          >
            <Txt variant="label" t="faint" center>
              Cancelar
            </Txt>
          </Press>
        </View>
      ) : (
        <View style={styles.cardOutcome} accessibilityLiveRegion="polite">
          {state === 'done' ? <Check size={16} tint={color.ink} /> : null}
          <Txt
            variant="label"
            t={state === 'done' ? 'ink' : state === 'failed' ? 'warning' : 'faint'}
            style={styles.cardOutcomeText}
          >
            {state === 'done' ? 'Feito.' : state === 'cancelled' ? 'Cancelado. Nada mudou.' : 'Não deu certo.'}
            {b.note ? ` ${b.note}` : ''}
          </Txt>
        </View>
      )}
      <View style={[styles.cardRule, styles.cardRuleBottom]} />
    </Animated.View>
  );
}

/** Three dots, breathing in sequence. Under reduced motion they sit still — the label still says it. */
function Typing() {
  return (
    <View style={styles.typing} accessible accessibilityLabel="Otto está pensando" accessibilityLiveRegion="polite">
      {[0, 1, 2].map((i) => (
        <Dot key={i} index={i} />
      ))}
    </View>
  );
}

/** Bars in the level trace: about three seconds of the voice at the recorder's 100 ms poll. */
const BARS = 32;

/** dBFS to 0–1: a quiet room sits near -60, a voice close to the phone near -10. */
const loudness = (db: number | undefined) => (db === undefined ? 0 : Math.min(1, Math.max(0, (db + 60) / 50)));

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * The composer while the owner speaks: how long, how loud, and the two ways out.
 *
 * Loudness is drawn as a short trace of the last few seconds rather than a pulsing dot, so a voice
 * too far from the microphone shows as a flat line before it shows as a bad transcript. It is in
 * ink, because colour is for money; only the clock turns, in the last ten seconds before the cap.
 * Polled here and not in the screen, so ten updates a second redraw this row and not the transcript.
 */
function Recording({
  recorder,
  onCancel,
  onDone,
}: {
  recorder: AudioRecorder;
  onCancel: () => void;
  onDone: () => void;
}) {
  const state = useAudioRecorderState(recorder, 100);
  const [trace, setTrace] = useState<number[]>(() => new Array<number>(BARS).fill(0));
  const seconds = Math.floor(state.durationMillis / 1000);

  useEffect(() => {
    setTrace((t) => [...t.slice(1), loudness(state.metering)]);
  }, [state]);

  // The cap transcribes what was said rather than throwing it away.
  useEffect(() => {
    if (state.durationMillis >= MAX_DICTATION_MS) onDone();
  }, [state.durationMillis, onDone]);

  return (
    <View style={styles.dictation}>
      <Press onPress={onCancel} style={styles.send} accessibilityLabel="Cancelar gravação">
        <Close tint={color.inkMuted} />
      </Press>
      <View style={styles.level} accessible accessibilityLabel={`Gravando, ${seconds} segundos`}>
        <Txt variant="body" f="mono" t={state.durationMillis >= MAX_DICTATION_MS - 10_000 ? 'warning' : 'ink'} tabular>
          {clock(seconds)}
        </Txt>
        <View style={styles.trace}>
          {trace.map((v, i) => (
            <View key={i} style={[styles.traceBar, { height: 3 + v * 19 }]} />
          ))}
        </View>
      </View>
      <Press onPress={onDone} haptic="light" style={styles.send} accessibilityLabel="Concluir e transcrever">
        <Check size={22} tint={color.ink} />
      </Press>
    </View>
  );
}

function Transcribing() {
  return (
    <View style={styles.dictation} accessible accessibilityLabel="Transcrevendo o áudio" accessibilityLiveRegion="polite">
      <View style={styles.transcribing}>
        {[0, 1, 2].map((i) => (
          <Dot key={i} index={i} />
        ))}
      </View>
      <Txt variant="body" t="muted">
        Transcrevendo…
      </Txt>
    </View>
  );
}

function Dot({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const v = useSharedValue(0.35);
  useEffect(() => {
    if (reduced) return;
    v.value = withDelay(
      index * 160,
      withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.35, { duration: 380 })), -1),
    );
  }, [reduced, index, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[styles.dot, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  barTitle: { paddingTop: space.md },
  barSide: { width: HIT },
  barAction: { paddingTop: space.md, alignItems: 'flex-end' },

  scroll: { paddingTop: space.lg, paddingBottom: space.xl },

  hero: { paddingTop: space.lg },
  heroLabel: { paddingTop: space.xs },
  greet: { paddingTop: space.xxl },
  greetSub: { paddingTop: space.sm },

  suggestions: {
    marginTop: space.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  suggestion: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },

  gap: { marginTop: space.lg },
  user: { alignItems: 'flex-end', paddingTop: space.sm, paddingLeft: space.xxxl },
  userText: { textAlign: 'right' },
  otto: { paddingTop: space.sm, paddingRight: space.xl },
  bullet: { flexDirection: 'row', gap: space.sm, paddingTop: space.xs },
  bulletText: { flex: 1 },
  paragraph: { height: space.sm },

  card: { marginTop: space.lg },
  cardRule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong },
  cardRuleDanger: { backgroundColor: color.negative, opacity: 0.6, height: 1 },
  cardRuleBottom: { marginTop: space.md },
  cardLabel: { paddingTop: space.md, letterSpacing: 0.8 },
  cardLines: { paddingTop: space.sm },
  cardLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: space.xs + 2,
  },
  cardKey: { paddingRight: space.lg },
  cardValue: { flexShrink: 1, textAlign: 'right' },
  cardNote: { paddingTop: space.sm },
  cardActions: { paddingTop: space.lg },
  cardCancel: { marginTop: space.xs },
  cardOutcome: { flexDirection: 'row', alignItems: 'center', paddingTop: space.md },
  cardOutcomeText: { paddingLeft: space.xs, flexShrink: 1 },

  typing: { flexDirection: 'row', paddingTop: space.lg, height: HIT, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.inkMuted, marginRight: 6 },

  error: { paddingTop: space.lg },
  retry: { alignSelf: 'flex-start' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  input: {
    flex: 1,
    minHeight: HIT,
    maxHeight: 120,
    color: color.ink,
    fontFamily: font.sans,
    fontSize: type.body.size,
    lineHeight: type.body.leading,
    paddingVertical: space.md,
    paddingRight: space.md,
  },
  send: { width: HIT, alignItems: 'center' },

  dictation: { flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: HIT },
  level: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.xs },
  trace: { flex: 1, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2, overflow: 'hidden' },
  traceBar: { width: 2, borderRadius: 1, backgroundColor: color.inkMuted },
  transcribing: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.md, paddingRight: space.sm },
});
