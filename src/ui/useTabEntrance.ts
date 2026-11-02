import { useMemo, useState } from 'react';
import { useNav, tabShift } from '@/lib/nav';

/**
 * How a tab screen arrives.
 *
 * One place, so the four tabs cannot drift into four different transitions — nine `Reveal` calls
 * with the same five values is exactly how they diverge in silence, and four screens is worse.
 *
 * Two things happen together, and they are two views of one movement:
 *
 *  1. **The content travels from the side the owner came from.** Android's native stack will not
 *     stretch its own animation, so this travel *is* the transition. `ms` runs well past the native
 *     fade: the fade reads as the cut and the cascade reads as the movement, rather than the two
 *     competing over the same 200ms.
 *  2. **It settles in sequence.** A screen that arrives all at once is a slab; one that rules itself
 *     top to bottom is a page being written. The stagger is wider here than on a form, because there
 *     is no keyboard waiting and nothing to rush to.
 *
 * Since the tabs are kept (`(tabs)/_layout.tsx`), this plays on a tab's first visit only; after
 * that a tab change is instant and the lens in the glass bar is the movement.
 *
 * A cold start gets no travel. There was no movement, and inventing one would make
 * opening the app read as navigating inside it.
 */
export function useTabEntrance() {
  /*
   * Read once, not subscribed to. Every tab is kept mounted now, and a subscription meant that each
   * tab change re-rendered every tab's whole tree — measured as a 150ms frame the moment a kept tab
   * was shown. The entrance only needs the direction of its first arrival.
   *
   * The mark no longer glances toward the tab arriving. It was the third view of this movement, and
   * the costliest: the wordmark is an SVG, and animating it redrew the canvas on every frame for the
   * better part of a second after each change — measured as fifty frames at 25fps. The lens in the
   * bar already says where the owner went.
   */
  const [direction] = useState(() => useNav.getState().direction);

  return useMemo(() => {
    const shift = tabShift(direction);
    return {
      /**
       * The body. Travels in from the side the owner came from and keeps settling for most of a
       * second, which is where the whole perceived duration of a tab change lives.
       */
      body: { delay: 0, step: 96, cap: 5, rise: 14, shift, ms: 620 },

      /**
       * The masthead, which does not travel at all.
       *
       * With no native animation there is nothing covering the gap before the first sibling
       * arrives, so a staggered header would leave the screen empty for the moment right after the
       * tap — a stall, and a worse one than the fade it replaced. The mark and the bar are the
       * frame: they are in the same place on all four tabs, so they should read as never having
       * left. Only what is inside the frame changes.
       */
      head: { delay: 0, step: 0, cap: 0, rise: 0, shift: 0, ms: 200 },
    };
  }, [direction]);
}
