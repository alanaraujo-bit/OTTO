import { router } from 'expo-router';
import { create } from 'zustand';
import { isStatementSeries } from '@/domain/settlement';

/** The tabs, in the order they sit in the bar. The order *is* the geometry. */
export const TABS = ['home', 'ledger', 'stats', 'settings'] as const;
export type TabKey = (typeof TABS)[number];

const ROUTE = {
  home: '/home',
  ledger: '/razao',
  stats: '/analise',
  settings: '/ajustes',
} as const satisfies Record<TabKey, string>;

interface NavState {
  /** Where the owner was. Null on a cold start, where there is no movement to describe. */
  from: TabKey | null;
  current: TabKey;
  /** -1 going left along the bar, +1 going right, 0 for an arrival with no previous position. */
  direction: number;
  go: (to: TabKey, params?: Record<string, string>) => void;
}

/**
 * Which way a tab change moves.
 *
 * A change of tab is not a fade. The four destinations have positions — they sit in a row along the
 * bottom of the screen, in that order — so moving from `início` to `análise` is moving *right*, and
 * every screen in this app already knows how to say that: content travels in from the direction the
 * page came from and keeps settling after it lands.
 *
 * That is the Fase 1.8 finding applied where it was missed. Android's native stack will not stretch
 * its own animation — `animationDuration` is iOS-only — so the perceived duration of a transition
 * has to come from the content. A fade with no vector and a 12dp rise gives the eye nothing to
 * follow, which is exactly what "seco" means.
 *
 * The state lives outside React because it is read during the first render of the arriving screen,
 * before any effect has run. A hook would be a frame late, and a frame late here is the whole point.
 */
export const useNav = create<NavState>((set, get) => ({
  from: null,
  current: 'home',
  direction: 0,

  go: (to, params) => {
    const { current } = get();
    if (to === current) return;
    set({ from: current, current: to, direction: Math.sign(TABS.indexOf(to) - TABS.indexOf(current)) });
    // A tab can be arrived at already pointed somewhere — the home screen sends the ledger a
    // month to land on. Still a replace: a tab is a destination, not a page over another.
    router.replace(params ? { pathname: ROUTE[to], params } : ROUTE[to]);
  },
}));

/**
 * How far the arriving content travels, and from which side.
 *
 * Positive is "in from the right", which is what `Reveal`'s `shift` means, so moving right along the
 * bar has to produce a positive shift — the content follows the finger's direction rather than
 * opposing it. A cold start gets no travel at all: there was no movement, and inventing one would
 * make opening the app read as navigating inside it.
 */
export function tabShift(direction: number, amount = 34): number {
  return direction * amount;
}

/**
 * Where a forecast row opens.
 *
 * A rule's occurrence opens the rule, where "paguei" and "adiar" live. A card's statement has no
 * rule to open — its amount is the card's purchases, its day the card's contract — so the one thing
 * it can be asked to do, be paid, is the door: `lançar`, already filled with the statement, the same
 * screen the razão's swipe sends any forecast to.
 */
export function forecastRoute(seriesId: string, scheduled: string) {
  return isStatementSeries(seriesId)
    ? ({ pathname: '/lancar', params: { settlesSeries: seriesId, settlesDate: scheduled } } as const)
    : ({ pathname: '/recorrencia', params: { id: seriesId } } as const);
}
