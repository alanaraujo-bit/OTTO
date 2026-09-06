import { StyleSheet, View } from 'react-native';
import { differenceInCalendarDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Txt } from '@/theme/text';
import { color, space } from '@/theme/tokens';
import { Amount } from './Amount';
import { parseDay } from '@/domain/projection';
import type { DebtPayment } from '@/domain/settlement';

/**
 * The payment history of a debt.
 *
 * **The authored idea: a debt is a rhythm, not a counter.** Every other app in this category shows
 * a progress bar and calls that history — 4/10, and the four are anonymous. But the person holding
 * the other end of this link is not asking "how many"; the bar above already answers that. They are
 * asking *how* — does this get paid, and does it get paid when it was promised. That question has an
 * answer in OTTO and nowhere else, because OTTO is the only ledger here that stores the day an
 * installment was **due** apart from the day it was **paid**. `settlesDate` and `date` exist for the
 * engine's sake — so a bill paid early is not billed twice — and this screen is where that
 * separation stops being bookkeeping and becomes the most human thing on the page.
 *
 * So the rhythm is the content. Each row carries its lag, and the column of lags read top to bottom
 * is a portrait of somebody's reliability that no progress bar can draw.
 *
 * Two disciplines hold it honest:
 *
 *  - **Chroma only for late.** DESIGN.md reserves colour for information, and this list is mostly a
 *    list of things that went fine. Painting "no dia" green would spend the eye's attention on the
 *    absence of news and leave nothing louder for the one row that is news. Early and on-time are
 *    set in faint ink; only a late payment takes `warning`.
 *  - **No invented precision.** The time appears when the row has one and is simply absent when it
 *    does not. A payment recorded before OTTO stored a clock shows its day alone rather than a
 *    plausible-looking midnight.
 */
export function PaymentHistory({
  payments,
  untracked,
  total,
}: {
  /** Newest first. */
  payments: DebtPayment[];
  /** Installments counted as paid that no entry describes. */
  untracked: number;
  total: number;
}) {
  if (payments.length === 0 && untracked === 0) {
    return (
      <View style={styles.root}>
        <Head aside={null} />
        <Txt variant="body" t="faint" style={styles.empty}>
          Nenhuma parcela paga ainda. Cada pagamento aparece aqui com o dia em que foi feito.
        </Txt>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Head aside={punctuality(payments)} />

      {payments.map((p) => (
        <Row key={`${p.n}-${p.paid}`} payment={p} />
      ))}

      {untracked > 0 ? (
        /*
         * The gap between what the counter claims and what the ledger can describe.
         *
         * Said plainly instead of hidden, and said without blame: a debt that started before OTTO
         * did is the ordinary case, not a mistake the owner should feel caught at. Silently
         * dropping these would make the list contradict the 4/10 directly above it, and inventing
         * dates for them would be worse than either.
         */
        <View style={styles.untracked}>
          <Txt variant="micro" t="faint">
            {untracked === 1
              ? '+ 1 parcela paga antes deste acompanhamento, sem data registrada'
              : `+ ${untracked} parcelas pagas antes deste acompanhamento, sem data registrada`}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The section head.
 *
 * The right-hand slot deliberately does **not** repeat the count. `PARCELAS n/total` sits two rows
 * above this on both screens, and printing the same fraction again would spend the most valuable
 * position on the block restating something the reader has already been told — while the one thing
 * this list actually knows went unsummarised. So the slot carries the verdict of the column below
 * it instead.
 */
function Head({ aside }: { aside: { copy: string; late: boolean } | null }) {
  return (
    <>
      <View style={styles.rule} />
      <View style={styles.head}>
        <Txt variant="micro" f="sansMedium" t="muted">
          PAGAMENTOS
        </Txt>
        {aside ? (
          <Txt variant="micro" f="sansMedium" t={aside.late ? 'warning' : 'muted'}>
            {aside.copy.toUpperCase()}
          </Txt>
        ) : null}
      </View>
    </>
  );
}

/**
 * The column of lags, said once.
 *
 * Only lateness is counted. "Sempre no prazo" is a claim about every recorded payment and is worth
 * making; an average lag in days would be arithmetic nobody asked for, and counting the early ones
 * would turn paying ahead into a score to keep.
 */
function punctuality(payments: DebtPayment[]): { copy: string; late: boolean } | null {
  if (payments.length === 0) return null;
  const late = payments.filter(
    (p) => differenceInCalendarDays(parseDay(p.paid), parseDay(p.scheduled)) > 0,
  ).length;
  if (late === 0) return { copy: 'sempre no prazo', late: false };
  return { copy: late === 1 ? '1 atrasada' : `${late} atrasadas`, late: true };
}

function Row({ payment }: { payment: DebtPayment }) {
  const paidOn = parseDay(payment.paid);
  const lag = differenceInCalendarDays(paidOn, parseDay(payment.scheduled));

  // `recordedAt` is an instant and `paid` is a day the owner may have backdated. When they disagree
  // the day is the truth about the money, so the day wins and the clock is dropped — a time-stamp
  // next to a date it does not belong to would read as a contradiction.
  const clock =
    payment.recordedAt && format(new Date(payment.recordedAt), 'yyyy-MM-dd') === payment.paid
      ? format(new Date(payment.recordedAt), 'HH:mm')
      : null;

  return (
    <View style={styles.row}>
      <Txt variant="label" f="monoMedium" t="faint" tabular style={styles.n}>
        {String(payment.n).padStart(2, '0')}
      </Txt>

      <View style={styles.middle}>
        <Txt variant="body" t="ink">
          {format(paidOn, "d 'de' MMMM", { locale: ptBR })}
          {clock ? (
            <Txt variant="body" f="mono" t="faint" tabular>
              {'  '}
              {clock}
            </Txt>
          ) : null}
        </Txt>
        <Txt variant="micro" t={lag > 0 ? 'warning' : 'faint'}>
          {lagCopy(lag)}
        </Txt>
      </View>

      <Amount cents={payment.amountCents} size="body" tone="muted" />
    </View>
  );
}

/**
 * The lag, in words rather than a signed number.
 *
 * "−3" would need a legend and would read as money. The reader of a shared debt is somebody's
 * friend, not an analyst, and "3 dias antes" needs nothing explained to it.
 */
function lagCopy(lag: number): string {
  if (lag === 0) return 'no dia';
  if (lag === 1) return '1 dia depois';
  if (lag === -1) return '1 dia antes';
  return lag > 0 ? `${lag} dias depois` : `${-lag} dias antes`;
}

const styles = StyleSheet.create({
  root: { paddingTop: space.xxl },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  empty: { paddingTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  // Fixed width so the installment numbers form a true column and the dates start on one line,
  // which is the whole reason the lag underneath is readable as a column of its own.
  n: { width: 22 },
  middle: { flexShrink: 1, flexGrow: 1 },
  untracked: { paddingTop: space.md },
});
