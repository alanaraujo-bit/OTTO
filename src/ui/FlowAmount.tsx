import { Amount } from './Amount';
import type { Direction } from '@/domain/model';

/**
 * An amount that moved one way: inflows carry "+" in `positive`, outflows carry no sign in
 * `negative` — the reading the razão gives the same rows, so a card purchase or a rent is the same
 * colour on every screen it appears on (CONTA-05, REC-03).
 *
 * The team rule: a plus is the mark that this money arrived, and its absence is the ordinary case —
 * most rows are spending, and a column of minus signs would be the loudest thing on a screen saying
 * nothing new. Colour never carries the direction alone; the "+" does, which is what a colour-blind
 * reader and a screen reader both get.
 *
 * `cents` is the magnitude. The sign comes from `direction`, never from the number.
 */
export function FlowAmount({
  cents,
  direction,
  size = 'body',
}: {
  cents: number;
  direction: Direction;
  size?: 'heading' | 'body';
}) {
  // `Amount` draws the "+" and is already one accessible node; wrapping it again would make a
  // screen reader announce the same figure twice.
  return (
    <Amount cents={cents} direction={direction} size={size} tone={direction === 'in' ? 'positive' : 'negative'} />
  );
}
