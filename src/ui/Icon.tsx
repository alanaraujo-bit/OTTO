import Svg, { Path } from 'react-native-svg';
import { color } from '@/theme/tokens';

/** One stroke weight, one cap style, one grid. Drawn here so the set never drifts. */
const STROKE = 1.6;

type IconProps = { size?: number; tint?: string };

function base(size: number) {
  return { width: size, height: size, viewBox: '0 0 24 24' };
}

export function ArrowLeft({ size = 22, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path
        d="M19 12H5m0 0 6-6m-6 6 6 6"
        stroke={tint}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function Check({ size = 16, tint = color.positive }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path
        d="m4 12.5 5 5L20 6.5"
        stroke={tint}
        strokeWidth={STROKE + 0.3}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

export function MailSent({ size = 26, tint = color.ink }: IconProps) {
  return (
    <Svg {...base(size)}>
      <Path
        d="M3 7.5h18v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5zM3 7.5 12 14l9-6.5"
        stroke={tint}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
