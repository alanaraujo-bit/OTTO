import Svg, { Circle, Path } from 'react-native-svg';
import { color } from '@/theme/tokens';

/** One stroke weight, one cap style, one grid. Drawn here so the set never drifts. */
const STROKE = 1.6;

type IconProps = { size?: number; tint?: string };

function base(size: number) {
  return { width: size, height: size, viewBox: '0 0 24 24' };
}

/** Every glyph in the set is one open stroke on the same grid — no fills, no second weight. */
function Stroke({ d, tint, width = STROKE }: { d: string; tint: string; width?: number }) {
  return (
    <Path
      d={d}
      stroke={tint}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

export function ArrowLeft({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M19 12H5m0 0 6-6m-6 6 6 6" tint={tint} />
    </Svg>
  );
}

export function Check({ size = 16, tint = color.positive }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="m4 12.5 5 5L20 6.5" tint={tint} width={STROKE + 0.3} />
    </Svg>
  );
}

export function MailSent({ size = 26, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke
        d="M3 7.5h18v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM3 7.5 12 14l9-6.5"
        tint={tint}
      />
    </Svg>
  );
}

export function ChevronLeft({ size = 18, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="m14.5 5.5-6.5 6.5 6.5 6.5" tint={tint} />
    </Svg>
  );
}

export function ChevronRight({ size = 18, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="m9.5 5.5 6.5 6.5-6.5 6.5" tint={tint} />
    </Svg>
  );
}

/** The key that takes a digit back. Drawn, because a "⌫" is a font's opinion, not this set's. */
export function Backspace({ size = 22, tint = color.inkMuted }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M9 5.5h10a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5.5-6.5z" tint={tint} />
      <Stroke d="m11.5 9.5 5 5m0-5-5 5" tint={tint} />
    </Svg>
  );
}

/* The navigation set. Five glyphs on one grid, so the bar reads as one object rather than as five
   borrowed marks. */

export function NavHome({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M4 10.2 12 4l8 6.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" tint={tint} />
    </Svg>
  );
}

/** The ledger itself: ruled rows, the last one short because the page is still being written. */
export function NavLedger({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M4 6.5h16M4 12h16M4 17.5h9.5" tint={tint} />
    </Svg>
  );
}

export function NavPlus({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M12 5.5v13M5.5 12h13" tint={tint} width={STROKE + 0.2} />
    </Svg>
  );
}

export function NavStats({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M5 19.5V13M12 19.5V5M19 19.5v-9" tint={tint} width={STROKE + 0.2} />
    </Svg>
  );
}

/** Sliders rather than a gear: the same open stroke as the rest of the set, where a gear is a fill. */
export function NavSettings({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Stroke d="M4 8.5h6.5M14.5 8.5H20M4 15.5h3.5M11.5 15.5H20" tint={tint} />
      <Circle cx={12.5} cy={8.5} r={2.2} stroke={tint} strokeWidth={STROKE} fill="none" />
      <Circle cx={9.5} cy={15.5} r={2.2} stroke={tint} strokeWidth={STROKE} fill="none" />
    </Svg>
  );
}
