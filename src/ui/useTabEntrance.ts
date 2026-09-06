import { useEffect, useMemo } from 'react';
import { useNav, tabShift } from '@/lib/nav';
import { useFocusSignal } from './FocusSignal';

/**
 * How a tab screen arrives.
 *
 * One place, so the four tabs cannot drift into four different transitions — nine `Reveal` calls
 * with the same five values is exactly how they diverge in silence, and four screens is worse.
 *
 * Three things happen together, and they are three views of one movement:
 *
 *  1. **The content travels from the side the owner came from.** Android's native stack will not
 *     stretch its own animation, so this travel *is* the transition. `ms` runs well past the native
 *     fade: the fade reads as the cut and the cascade reads as the movement, rather than the two
 *     competing over the same 200ms.
 *  2. **It settles in sequence.** A screen that arrives all at once is a slab; one that rules itself
 *     top to bottom is a page being written. The stagger is wider here than on a form, because there
 *     is no keyboard waiting and nothing to rush to.
 *  3. **The mark looks the way you went.** `look()` already exists for the push between the auth
 *     screens; a tab change is the same statement — the app showing what it is attending to — so it
 *     reuses the same channel rather than inventing a second one.
 *
 * A cold start gets no travel and no glance. There was no movement, and inventing one would make
 * opening the app read as navigating inside it.
 */
export function useTabEntrance() {
  const direction = useNav((s) => s.direction);
  const { look } = useFocusSignal();

  useEffect(() => {
    if (direction !== 0) look(direction);
    // Fires once per arrival. `direction` only changes when a tab change happens.
  }, [direction, look]);

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
