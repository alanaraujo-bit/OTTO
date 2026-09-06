import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as Crypto from 'expo-crypto';
import { Screen } from '@/ui/Screen';
import { BackBar } from '@/ui/BackBar';
import { Reveal } from '@/ui/Reveal';
import { Press } from '@/ui/Press';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { MoneyField } from '@/ui/MoneyField';
import { Amount } from '@/ui/Amount';
import { KeyboardAwareScrollView } from '@/ui/KeyboardAwareScrollView';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { useSnackbar } from '@/ui/Snackbar';
import { confirmDestructiveAction } from '@/lib/auth/lock';
import { useLedger } from '@/state/ledger';
import { deleteAccount, insertAccount, updateAccount } from '@/db/repo';
import { balanceToday, dayKey, parseDay } from '@/domain/projection';
import {
  limitUse,
  statementCycle,
  statementItems,
  statementTotal,
  type Statement,
} from '@/domain/card';
import { brl, brlShort } from '@/domain/money';
import type { Account, Entry } from '@/domain/model';

/*
 * Pushed laterally from ajustes, so the content travels in from the same direction the page came
 * from and keeps settling after it lands. On Android the native slide is not stretchable —
 * `animationDuration` is iOS-only — so `shift` is where the perceived duration of this transition
 * actually comes from. Without it this screen arrives with the fast, seco slide that was rejected
 * twice in Fase 1.7 and 1.8.
 */
const ENTER = { delay: 160, step: 70, cap: 5, rise: 10, shift: 26 } as const;

/**
 * Where the money is, and where it is not.
 *
 * **The authored idea: "linha de crédito não é dinheiro", drawn.** This app has made that claim three
 * times in comments and once in arithmetic — the balance excludes card accounts, the tape excludes
 * them, the projection excludes them. This is the screen where the claim becomes something you can
 * see. Above the divide is what the owner holds. Below it is what they owe and when. Nothing crosses,
 * and the figure at the top counts only the half above.
 *
 * A card differs from an account in one way that matters: it has a date on which it turns into real
 * money. So each card carries its cycle as a rule of time — solid up to today, dashed to the close,
 * then on to the due date. The same solid/dashed grammar the balance curve uses, saying the same
 * thing: behind you is fact, ahead of you is forecast.
 *
 * **Nothing here guesses a cycle.** A card with no closing day is a card whose contract the app has
 * not been told about, and it says so and offers the fields. That is not an edge case: it is the
 * state every card is in the moment this schema migration lands on a ledger that already existed.
 *
 * A fresh account receives exactly one remote checking account and nothing else — created by the API —
 * so "+ Nova conta ou cartão" at the end of this screen is not a convenience, it is the only door
 * into the rest of what this app can track.
 *
 * Every row here is now as editable as it was creatable — tapping one opens the same form that made
 * it. Apagar carries more ceremony than most destructive rows in this app: an account's entries
 * cascade with it (`ON DELETE CASCADE`, unlike a series' softer `SET NULL`), so the confirmation
 * names how many lançamentos are about to go, and the one holding account left refuses outright —
 * there has to be somewhere for `lançar` to book to.
 */
export default function Contas() {
  return (
    <Screen>
      <ContasBody />
    </Screen>
  );
}

function ContasBody() {
  const snack = useSnackbar();
  const ready = useLedger((s) => s.ready);
  const error = useLedger((s) => s.error);
  const load = useLedger((s) => s.load);
  const accounts = useLedger((s) => s.accounts);
  const entries = useLedger((s) => s.entries);

  const [editing, setEditing] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const removeWithBiometry = async (account: Account) => {
    const confirmed = await confirmDestructiveAction(`Confirme para excluir ${account.name}`);
    if (!confirmed) {
      snack('Exclusão cancelada: a biometria não foi confirmada.', 'error');
      return;
    }
    await deleteAccount(account.id);
    await load();
    setEditing(null);
    snack(account.kind === 'card' ? 'Cartão apagado.' : 'Conta apagada.', 'info');
  };

  useEffect(() => {
    void load();
  }, [load]);

  const today = useMemo(() => dayKey(new Date()), []);

  const view = useMemo(() => {
    if (!ready || error) return null;

    const holding = accounts.filter((a) => a.kind !== 'card');
    const cards = accounts.filter((a) => a.kind === 'card');

    return {
      total: balanceToday(accounts, entries, today),
      holding: holding.map((a) => ({
        account: a,
        // One account's own balance, on the same rule the total obeys.
        cents: balanceToday([a], entries, today),
      })),
      cards: cards.map((a) => {
        const cycle = statementCycle(a, today);
        const used = cycle ? statementTotal(entries, a, cycle) : 0;
        return {
          account: a,
          cycle,
          used,
          use: limitUse(used, a),
          items: cycle ? statementItems(entries, a, cycle) : [],
        };
      }),
    };
  }, [ready, error, accounts, entries, today]);

  return (
    <>
      <BackBar />

      <KeyboardAwareScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <Reveal index={0} {...ENTER}>
            <Txt variant="heading" f="sansSemibold" style={styles.head}>
              Não consegui ler seus dados.
            </Txt>
            <Txt variant="body" t="muted" style={styles.notice}>
              {error}
            </Txt>
          </Reveal>
        ) : null}

        {view ? (
          <>
            <Reveal index={0} {...ENTER}>
              <View style={styles.hero}>
                <Amount
                  cents={view.total}
                  size="hero"
                  tone={view.total < 0 ? 'negative' : 'ink'}
                />
                <Txt variant="label" t="muted" style={styles.heroLabel}>
                  o que você tem hoje
                </Txt>
              </View>
            </Reveal>

            <Reveal index={1} {...ENTER} rise={0}>
              <Section label="contas" />
              {view.holding.map((h) => (
                <View key={h.account.id}>
                  <Press
                    onPress={() => setEditing((p) => (p === h.account.id ? null : h.account.id))}
                    style={styles.row}
                    accessibilityLabel={`Conta ${h.account.name}`}
                  >
                    <View style={styles.rowText}>
                      <Txt variant="body" numberOfLines={1}>
                        {h.account.name}
                      </Txt>
                      <Txt variant="micro" t="faint">
                        {h.account.kind === 'savings' ? 'poupança' : 'conta corrente'}
                      </Txt>
                    </View>
                    <Amount cents={h.cents} size="body" tone={h.cents < 0 ? 'negative' : 'ink'} />
                  </Press>
                  {editing === h.account.id ? (
                    <AccountForm
                      initial={h.account}
                      entryCount={entries.filter((e) => e.accountId === h.account.id).length}
                      blockDelete={view.holding.length <= 1}
                      onSave={async (a) => {
                        await updateAccount(a);
                        await load();
                        setEditing(null);
                        snack('Conta salva.', 'info');
                      }}
                      onDelete={async () => {
                        await removeWithBiometry(h.account);
                      }}
                    />
                  ) : null}
                </View>
              ))}
            </Reveal>

            {/*
              The divide. The one rule on this screen drawn in ink, because it is the claim the whole
              screen exists to make and every other rule here is a group boundary.
            */}
            <Reveal index={2} {...ENTER} rise={0}>
              <View style={styles.divide}>
                <View style={styles.divideRule} />
                <Txt variant="micro" t="faint" style={styles.divideNote}>
                  Daqui para baixo não é dinheiro seu. Uma linha de crédito é um limite para gastar,
                  não um saldo — por isso nada abaixo desta linha entra na cifra lá em cima.
                </Txt>
              </View>
            </Reveal>

            {view.cards.length === 0 ? (
              <Txt variant="body" t="faint" style={styles.notice}>
                Nenhum cartão cadastrado.
              </Txt>
            ) : null}

            {view.cards.map((c, i) => (
              <Reveal key={c.account.id} index={3 + i} {...ENTER} rise={0}>
                <Card
                  account={c.account}
                  cycle={c.cycle}
                  used={c.used}
                  use={c.use}
                  items={c.items}
                  today={today}
                  editing={editing === c.account.id}
                  entryCount={entries.filter((e) => e.accountId === c.account.id).length}
                  onEdit={() => setEditing((p) => (p === c.account.id ? null : c.account.id))}
                  onSave={async (next) => {
                    await updateAccount(next);
                    await load();
                    setEditing(null);
                    snack('Cartão salvo.', 'info');
                  }}
                  onDelete={async () => {
                    await removeWithBiometry(c.account);
                  }}
                />
              </Reveal>
            ))}

            {/*
              The only door into the rest of what this app can track. A blank install starts with
              exactly one account, and there is no other way to add a second one, or a card, or a
              poupança — so this row is not an extra, it is load-bearing.
            */}
            <Reveal index={4 + view.cards.length} {...ENTER} rise={0}>
              {creatingNew ? (
                <View style={styles.newBlock}>
                  <Section label="nova conta" />
                  <AccountForm
                    initial={null}
                    entryCount={0}
                    blockDelete
                    onSave={async (a) => {
                      await insertAccount(a);
                      await load();
                      setCreatingNew(false);
                      snack(a.kind === 'card' ? 'Cartão criado.' : 'Conta criada.', 'info');
                    }}
                    onCancel={() => setCreatingNew(false)}
                  />
                </View>
              ) : (
                <Press
                  onPress={() => setCreatingNew(true)}
                  style={styles.row}
                  accessibilityLabel="Nova conta ou cartão"
                >
                  <Txt variant="body" t="ink">
                    + Nova conta ou cartão
                  </Txt>
                </Press>
              )}
            </Reveal>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </>
  );
}

/**
 * One form, three shapes, two modes.
 *
 * The three shapes are entered by hand and are the same three the schema allows — nothing this
 * module invents. A checking or poupança account asks what it already holds; a card asks about a
 * contract instead, because a card has no balance of its own to declare, and the two kinds of
 * question never overlap in one screen.
 *
 * `initial === null` is creation, and creation alone gets to pick a shape — `updateAccount` never
 * touches `kind`, matching its own doc comment: the id and the kind are not among the things an
 * owner may change about a row that already exists. Everything else here — name, saldo, ciclo,
 * limite — is exactly as editable after the fact as it was on the way in. A control that only takes
 * a value once is a control that punishes a typo forever, which is the complaint this whole pass
 * exists to answer.
 */
function AccountForm({
  initial,
  entryCount,
  blockDelete,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: Account | null;
  /** How many lançamentos are booked here — said in the delete warning, not just implied. */
  entryCount: number;
  /** True for the one holding account left; deleting it would leave nowhere for `lançar` to book. */
  blockDelete: boolean;
  onSave: (a: Account) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel?: () => void;
}) {
  const [kind, setKind] = useState<Account['kind']>(initial?.kind ?? 'checking');
  const [name, setName] = useState(initial?.name ?? '');
  const [opening, setOpening] = useState<number | null>(initial?.openingCents ?? null);
  const [closing, setClosing] = useState(initial?.closingDay?.toString() ?? '');
  const [due, setDue] = useState(initial?.dueDay?.toString() ?? '');
  const [limit, setLimit] = useState<number | null>(initial?.limitCents ?? null);
  const [saving, setSaving] = useState(false);
  const [armed, setArmed] = useState(false);

  // A destructive action arms itself and stands down on its own — same rule as ajustes' reseed.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const closingDay = day(closing);
  const dueDay = day(due);
  const valid = name.trim() !== '' && (kind !== 'card' || (closingDay !== null && dueDay !== null));

  return (
    <View style={styles.form}>
      {!initial ? (
        <>
          <View style={styles.kinds}>
            {KINDS.map((k) => (
              <Press
                key={k.key}
                onPress={() => setKind(k.key)}
                outerStyle={styles.kindHit}
                style={styles.kind}
                accessibilityLabel={k.label}
                accessibilityState={{ selected: kind === k.key }}
              >
                <Txt variant="label" f="sansMedium" t={kind === k.key ? 'ink' : 'faint'} center>
                  {k.label}
                </Txt>
                <View style={[styles.kindRule, kind === k.key ? styles.kindRuleOn : null]} />
              </Press>
            ))}
          </View>
          <View style={styles.gap} />
        </>
      ) : null}

      <Field label="Nome" value={name} onChangeText={setName} autoCapitalize="words" maxLength={40} />

      {kind === 'card' ? (
        <>
          <View style={styles.gap} />
          <Field
            label="Dia do fechamento"
            value={closing}
            onChangeText={(t) => setClosing(t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            error={closing !== '' && closingDay === null ? 'Um dia entre 1 e 31.' : null}
          />
          <View style={styles.gap} />
          <Field
            label="Dia do vencimento"
            value={due}
            onChangeText={(t) => setDue(t.replace(/\D/g, '').slice(0, 2))}
            keyboardType="number-pad"
            error={due !== '' && dueDay === null ? 'Um dia entre 1 e 31.' : null}
          />
          <View style={styles.gap} />
          <MoneyField label="Limite (opcional)" cents={limit} onChangeCents={setLimit} />
        </>
      ) : (
        <>
          <View style={styles.gap} />
          <MoneyField
            label={initial ? 'Saldo' : 'Saldo inicial (opcional)'}
            cents={opening}
            onChangeCents={setOpening}
          />
          {!initial ? (
            <Txt variant="micro" t="faint" style={styles.hint}>
              O que você já tem hoje nessa conta. Pode deixar em branco e lançar depois.
            </Txt>
          ) : null}
        </>
      )}

      <View style={styles.gap} />
      <Button
        label={initial ? 'Salvar' : kind === 'card' ? 'Criar cartão' : 'Criar conta'}
        disabled={!valid || saving}
        loading={saving}
        onPress={() => {
          if (!valid) return;
          setSaving(true);
          void onSave({
            id: initial?.id ?? Crypto.randomUUID(),
            name: name.trim(),
            kind,
            openingCents: kind === 'card' ? 0 : (opening ?? 0),
            closingDay: kind === 'card' ? closingDay : null,
            dueDay: kind === 'card' ? dueDay : null,
            limitCents: kind === 'card' ? limit : null,
          }).finally(() => setSaving(false));
        }}
      />

      {onCancel ? (
        <Press onPress={onCancel} style={styles.cancel} accessibilityLabel="Cancelar">
          <Txt variant="label" t="faint" center>
            Cancelar
          </Txt>
        </Press>
      ) : null}

      {initial && onDelete ? (
        blockDelete ? (
          <Txt variant="micro" t="faint" style={styles.remove}>
            Esta é a única conta que segura dinheiro — não dá para apagá-la sem deixar o razão sem
            onde lançar. Crie outra antes de remover esta.
          </Txt>
        ) : (
          <Press
            onPress={() => {
              if (!armed) {
                setArmed(true);
                return;
              }
              setArmed(false);
              setSaving(true);
              void onDelete().finally(() => setSaving(false));
            }}
            disabled={saving}
            style={styles.remove}
            accessibilityLabel={kind === 'card' ? 'Apagar cartão' : 'Apagar conta'}
          >
            <Txt variant="label" t={armed ? 'negative' : 'faint'} center>
              {armed
                ? 'Toque de novo para apagar'
                : kind === 'card'
                  ? 'Apagar cartão'
                  : 'Apagar conta'}
            </Txt>
            {entryCount > 0 ? (
              <Txt variant="micro" t="faint" center style={styles.removeNote}>
                Isso apaga {entryCount} {entryCount === 1 ? 'lançamento' : 'lançamentos'} junto — não
                dá para desfazer.
              </Txt>
            ) : null}
          </Press>
        )
      ) : null}
    </View>
  );
}

const KINDS: { key: Account['kind']; label: string }[] = [
  { key: 'checking', label: 'CONTA' },
  { key: 'savings', label: 'POUPANÇA' },
  { key: 'card', label: 'CARTÃO' },
];

function Card({
  account,
  cycle,
  used,
  use,
  items,
  today,
  editing,
  entryCount,
  onEdit,
  onSave,
  onDelete,
}: {
  account: Account;
  cycle: Statement | null;
  used: number;
  use: number | null;
  items: Entry[];
  today: string;
  editing: boolean;
  entryCount: number;
  onEdit: () => void;
  onSave: (next: Account) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  return (
    <View style={styles.card}>
      <Press onPress={onEdit} style={styles.row} accessibilityLabel={`Cartão ${account.name}`}>
        <View style={styles.rowText}>
          <Txt variant="body" numberOfLines={1}>
            {account.name}
          </Txt>
          <Txt variant="micro" t="faint">
            {cycle
              ? cycle.closed
                ? `fechou · vence ${when(cycle.daysToDue)}`
                : `fecha ${when(cycle.daysToClose)} · vence ${when(cycle.daysToDue)}`
              : 'sem ciclo configurado'}
          </Txt>
        </View>
        <Txt variant="micro" t="muted">
          {editing ? 'fechar' : 'editar'}
        </Txt>
      </Press>

      {cycle ? (
        <>
          <CycleRule cycle={cycle} today={today} />

          <View style={styles.cardFoot}>
            <View>
              <Txt variant="micro" t="faint">
                {cycle.closed ? 'fatura fechada' : 'nesta fatura até agora'}
              </Txt>
              <Amount cents={used} size="heading" tone={used > 0 ? 'ink' : 'faint'} />
            </View>
            <View style={styles.cardLimit}>
              <Txt variant="micro" t="faint">
                {account.limitCents == null
                  ? 'sem limite informado'
                  : `${Math.max(0, Math.round((use ?? 0) * 100))}% de ${brlShort(account.limitCents)}`}
              </Txt>
              {use !== null ? (
                <View style={styles.limitTrack}>
                  <View
                    style={[
                      styles.limitFill,
                      // A statement can go negative when refunds outweigh purchases, and a
                      // negative width is not a thing. Nothing used is nothing drawn.
                      { width: `${Math.min(100, Math.max(0, use * 100))}%` },
                      use > 1 ? styles.limitOver : null,
                    ]}
                  />
                </View>
              ) : null}
            </View>
          </View>

          {items.length === 0 ? (
            <Txt variant="micro" t="faint" style={styles.cardNote}>
              Nada lançado neste cartão ainda. O que você registrar nele entra na fatura que fecha em{' '}
              {format(parseDay(cycle.closes), "d 'de' MMM", { locale: ptBR })}.
            </Txt>
          ) : (
            /*
              What is on the statement, not just how much. The figure above is the same claim the
              home screen's curve makes — a shape without names — and this is the other half of it,
              at the scale of one card.

              A credit is set positive and in the money's own colour, because a refund really is the
              opposite of a charge here: it is the one place in this app where an inflow reduces
              something the owner owes rather than adding to what they hold.
            */
            <View style={styles.statement}>
              {items.slice(0, 8).map((e) => (
                <View key={e.id} style={styles.line}>
                  <View style={styles.lineText}>
                    <Txt variant="body" t="ink" numberOfLines={1}>
                      {e.title}
                    </Txt>
                    <Txt variant="micro" t="faint" numberOfLines={1}>
                      {format(parseDay(e.date), 'd MMM', { locale: ptBR })} · {e.category}
                      {e.direction === 'in' ? ' · estorno' : ''}
                    </Txt>
                  </View>
                  <Amount
                    cents={e.direction === 'out' ? -e.amountCents : e.amountCents}
                    size="body"
                    tone={e.direction === 'out' ? 'ink' : 'positive'}
                  />
                </View>
              ))}
              {items.length > 8 ? (
                <Txt variant="micro" t="faint" style={styles.cardNote}>
                  e mais {items.length - 8} nesta fatura
                </Txt>
              ) : null}
            </View>
          )}
        </>
      ) : null}

      {editing ? (
        <AccountForm
          initial={account}
          entryCount={entryCount}
          blockDelete={false}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
    </View>
  );
}

/**
 * The cycle as a rule of time.
 *
 * From the day after the last close through to the due date, with today's position solid behind it
 * and the rest dashed ahead — the same distinction the balance curve draws, and it means the same
 * thing here: what has been charged is fact, what the statement will hold is not yet.
 *
 * Two marks on it, because there are exactly two dates a card has: it closes, and it falls due.
 */
function CycleRule({ cycle, today }: { cycle: Statement; today: string }) {
  const start = parseDay(cycle.from).getTime();
  const end = parseDay(cycle.due).getTime();
  const span = Math.max(1, end - start);

  const at = (d: string) => Math.min(1, Math.max(0, (parseDay(d).getTime() - start) / span));
  const now = at(today);
  const closes = at(cycle.closes);

  return (
    <View style={styles.cycle}>
      <View style={styles.cycleTrack}>
        <View style={[styles.cycleDone, { width: `${now * 100}%` }]} />
        {/* The close, marked on the line it divides. */}
        <View style={[styles.cycleMark, { left: `${closes * 100}%` }]} />
      </View>
      <View style={styles.cycleLabels}>
        <Txt variant="micro" t="faint">
          {format(parseDay(cycle.from), 'd MMM', { locale: ptBR })}
        </Txt>
        <Txt variant="micro" t={cycle.closed ? 'faint' : 'muted'}>
          fecha {format(parseDay(cycle.closes), 'd MMM', { locale: ptBR })}
        </Txt>
        <Txt variant="micro" t={cycle.closed ? 'muted' : 'faint'}>
          vence {format(parseDay(cycle.due), 'd MMM', { locale: ptBR })}
        </Txt>
      </View>
    </View>
  );
}

/** 1–31, or null. The same range the schema and the projection engine both enforce. */
function day(raw: string): number | null {
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/** Days, in the owner's words. "em 8 dias" is a distance; "hoje" and "amanhã" are not. */
function when(days: number): string {
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  if (days < 0) return `há ${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'}`;
  return `em ${days} dias`;
}

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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingTop: space.md, paddingBottom: space.xxxl },
  head: { paddingTop: space.xl },
  notice: { paddingTop: space.lg },

  hero: { paddingTop: space.lg },
  heroLabel: { paddingTop: space.xs },

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

  divide: { paddingTop: space.xxl },
  /* The only ink rule on this screen. It is the claim, not a boundary. */
  divideRule: { height: 1, backgroundColor: color.ink, opacity: 0.85 },
  divideNote: { paddingTop: space.md },

  card: { paddingTop: space.lg },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingTop: space.md,
  },
  cardLimit: { alignItems: 'flex-end', minWidth: 120 },
  cardNote: { paddingTop: space.md },

  statement: { paddingTop: space.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.sm,
  },
  lineText: { flex: 1, paddingRight: space.lg },

  limitTrack: {
    width: 120,
    height: 2,
    marginTop: space.sm,
    borderRadius: 1,
    backgroundColor: color.hairline,
    overflow: 'hidden',
  },
  limitFill: { height: 2, borderRadius: 1, backgroundColor: color.inkMuted },
  limitOver: { backgroundColor: color.negative },

  cycle: { paddingTop: space.md },
  cycleTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: color.hairline,
  },
  cycleDone: { height: 2, borderRadius: 1, backgroundColor: color.ink },
  cycleMark: {
    position: 'absolute',
    top: -3,
    width: 1,
    height: 8,
    backgroundColor: color.inkMuted,
  },
  cycleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space.sm,
  },

  form: { paddingTop: space.lg },
  gap: { height: space.lg },
  hint: { paddingTop: space.sm },
  cancel: { paddingTop: space.lg, minHeight: 32, justifyContent: 'center' },
  remove: { paddingTop: space.xl },
  removeNote: { paddingTop: space.xs },

  newBlock: { paddingTop: space.xl },
  kinds: { flexDirection: 'row' },
  kindHit: { flex: 1 },
  kind: { justifyContent: 'flex-end', paddingBottom: space.sm },
  kindRule: { height: 2, marginTop: space.sm, backgroundColor: color.hairline },
  kindRuleOn: { backgroundColor: color.ink },
});
