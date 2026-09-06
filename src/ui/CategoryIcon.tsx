import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '@/theme/tokens';
import type { CategoryIconName } from '@/domain/category';

/**
 * The category glyph set.
 *
 * Drawn here rather than pulled from a library, for the reason `Icon.tsx` already establishes: one
 * stroke weight, one cap style, one grid, so the set cannot drift. DESIGN.md bans emoji standing in
 * for an icon system, and a category picker is exactly where that temptation lives — sixteen emoji
 * would have cost an afternoon less and broken the world.
 *
 * Every glyph is a single open stroke on the same 24-grid as the navigation set, at the same 1.6
 * weight. At the 18–20dp these are used at, that weight is what makes them read as the same family
 * as the tab bar rather than as clip art dropped into it.
 */

const STROKE = 1.6;

function Stroke({ d, tint, width = STROKE }: { d: string; tint: string; width?: number }) {
  return (
    <Path d={d} stroke={tint} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  );
}

/**
 * The paths, by name.
 *
 * A record rather than a switch so that `categoryIcons` in the domain and the drawings here cannot
 * fall out of step: TypeScript requires every name in the union to have a glyph, and a name added
 * to the domain without a drawing fails the build instead of rendering an empty square.
 */
const paths: Record<CategoryIconName, (tint: string) => React.ReactNode> = {
  /** The neutral default: a luggage tag. Means "no glyph fits", never assigned at random. */
  tag: (t) => <Stroke d="M11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5L11 22 2 13l9.5-9.5Z M16.5 7.8h.01" tint={t} />,
  home: (t) => <Stroke d="M3.5 10.5 12 3.5l8.5 7M5.5 9v11h13V9M9.8 20v-6h4.4v6" tint={t} />,
  /** A table lamp: "Casa" as the lit room, distinct from "Moradia" as the building. */
  lamp: (t) => <Stroke d="M7 11.5 9.8 4h4.4L17 11.5H7Z M12 11.5v7.5 M8.5 21h7" tint={t} />,
  fork: (t) => <Stroke d="M7 3v6.5a2 2 0 0 0 4 0V3 M9 9.5V21 M17 3c-1.6 1.4-2.2 3-2.2 5.2 0 1.7.7 2.6 2.2 2.8V21" tint={t} />,
  cart: (t) => (
    <>
      <Stroke d="M2.5 3.5h2.3l2.4 11h10.4l2-7.5H6" tint={t} />
      <Circle cx={9} cy={19.2} r={1.5} stroke={t} strokeWidth={STROKE} fill="none" />
      <Circle cx={16.8} cy={19.2} r={1.5} stroke={t} strokeWidth={STROKE} fill="none" />
    </>
  ),
  car: (t) => (
    <>
      <Stroke d="M3 15.5v-3l2-5.2A2 2 0 0 1 6.9 6h10.2a2 2 0 0 1 1.9 1.3l2 5.2v3 M3.5 12.5h17" tint={t} />
      <Circle cx={7.2} cy={15.6} r={1.6} stroke={t} strokeWidth={STROKE} fill="none" />
      <Circle cx={16.8} cy={15.6} r={1.6} stroke={t} strokeWidth={STROKE} fill="none" />
    </>
  ),
  heart: (t) => <Stroke d="M12 20.5C6.5 16.8 3 13.9 3 10.2A4.2 4.2 0 0 1 7.2 6c1.9 0 3.4 1 4.8 2.7C13.4 7 14.9 6 16.8 6A4.2 4.2 0 0 1 21 10.2c0 3.7-3.5 6.6-9 10.3Z" tint={t} />,
  /** Four-point spark: leisure as the thing that lights up, not a smiley. */
  spark: (t) => <Stroke d="M12 2.5c0 5 1.6 6.6 6.5 6.6-4.9 0-6.5 1.7-6.5 6.6 0-4.9-1.6-6.6-6.5-6.6 4.9 0 6.5-1.6 6.5-6.6Z M18 15.5c0 2.4.8 3.2 3.2 3.2-2.4 0-3.2.8-3.2 3.3 0-2.5-.8-3.3-3.2-3.3 2.4 0 3.2-.8 3.2-3.2Z" tint={t} />,
  repeat: (t) => <Stroke d="M4 10.2a8 8 0 0 1 13.3-3.5L20 9 M20 4.5V9h-4.5 M20 13.8a8 8 0 0 1-13.3 3.5L4 15 M4 19.5V15h4.5" tint={t} />,
  card: (t) => <Stroke d="M2.5 6.5h19v11h-19v-11Z M2.5 10.3h19 M6 14.2h3.5" tint={t} />,
  wallet: (t) => (
    <>
      <Stroke d="M3 7.4A2.4 2.4 0 0 1 5.4 5h11.2a1.6 1.6 0 0 1 1.6 1.6v2.2 M3 7.4v10.2A2.4 2.4 0 0 0 5.4 20h13.2a1.6 1.6 0 0 0 1.6-1.6v-7.6a1.6 1.6 0 0 0-1.6-1.6H5.4A2.4 2.4 0 0 1 3 7.4Z" tint={t} />
      <Circle cx={17} cy={14.6} r={1.25} fill={t} />
    </>
  ),
  bolt: (t) => <Stroke d="M13.2 2.5 4.5 13.4h6.3L10.3 21.5 19.5 10.4h-6.3l-.0-7.9Z" tint={t} />,
  book: (t) => <Stroke d="M12 6.6C10.3 5.1 8 4.4 4.5 4.4v12.9c3.5 0 5.8.7 7.5 2.3 1.7-1.6 4-2.3 7.5-2.3V4.4c-3.5 0-5.8.7-7.5 2.2Z M12 6.6v12.9" tint={t} />,
  gift: (t) => <Stroke d="M2.8 8.8h18.4v3.6H2.8V8.8Z M4.5 12.4v8.3h15v-8.3 M12 8.8v11.9 M12 8.8C10.4 8.8 6.5 8.6 6.5 6.1A2.6 2.6 0 0 1 12 5.5a2.6 2.6 0 0 1 5.5.6c0 2.5-3.9 2.7-5.5 2.7Z" tint={t} />,
  plane: (t) => <Stroke d="M10.4 3.3a1.6 1.6 0 0 1 3.2 0v5.4l7.9 4.4v2.4l-7.9-2.3v4.4l2.6 2v1.6L12 20.2l-4.2.9v-1.6l2.6-2v-4.4L2.5 15.5v-2.4l7.9-4.4V3.3Z" tint={t} />,
  /** A dog's head. "Pet" is a real spending category and deserved better than a generic paw. */
  pet: (t) => (
    <>
      <Stroke d="M6.5 5.5 4.8 11.6c-.5 1.8.2 3.7 1.8 4.8l1.3.9v3.2h8.2v-3.2l1.3-.9c1.6-1.1 2.3-3 1.8-4.8L17.5 5.5l-3.1 2.4H9.6L6.5 5.5Z M11 12.5h2" tint={t} />
      <Circle cx={9.4} cy={11.2} r={0.9} fill={t} />
      <Circle cx={14.6} cy={11.2} r={0.9} fill={t} />
    </>
  ),
};

export function CategoryIcon({
  name,
  size = 20,
  tint = color.ink,
}: {
  name: CategoryIconName;
  size?: number;
  tint?: string;
}) {
  // A name this build does not know about renders the neutral tag rather than crashing. That
  // happens when a ledger written by a newer build is opened by an older one, and a category the
  // app cannot draw is not a reason to take the screen down with it.
  const draw = paths[name] ?? paths.tag;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {draw(tint)}
    </Svg>
  );
}
