/**
 * OTTO — "Ledger Nocturne" tokens.
 * See DESIGN.md. Color is information: chroma is reserved for money.
 */

export const color = {
  bg: '#08090B',
  surface: '#101216',
  surfaceHi: '#171A20',
  hairline: '#22262E',
  hairlineStrong: '#333945',

  ink: '#F2F4F7',
  inkMuted: '#9BA1AC',
  inkFaint: '#737B88',

  positive: '#3FBF74',
  negative: '#E5484D',
  warning: '#E2A03F',

  /** Filled-CTA text sits on `ink`, so it is the ground colour. */
  onInk: '#08090B',
} as const;

/** Low-alpha luminance that wraps onto the curved panel edge. Never carries content. */
export const rim = {
  inner: 'rgba(242,244,247,0.055)',
  outer: 'rgba(242,244,247,0)',
} as const;

/** 4dp base. `gutter` is the curve-safe horizontal margin, not a taste choice. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gutter: 24,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const font = {
  sans: 'Geist_400Regular',
  sansMedium: 'Geist_500Medium',
  sansSemibold: 'Geist_600SemiBold',
  mono: 'GeistMono_400Regular',
  monoMedium: 'GeistMono_500Medium',
  monoSemibold: 'GeistMono_600SemiBold',
} as const;

/** sp-equivalent sizes. RN scales these with the system font setting by default. */
export const type = {
  display: { size: 44, tracking: -1.76, leading: 48 },
  title: { size: 26, tracking: -0.78, leading: 32 },
  heading: { size: 19, tracking: -0.38, leading: 26 },
  body: { size: 15, tracking: -0.15, leading: 22 },
  label: { size: 13, tracking: 0, leading: 18 },
  micro: { size: 11, tracking: 0.44, leading: 15 },
} as const;

/** Minimum Material touch target. */
export const HIT = 48;

/** Motion: exponential ease-out, from an already-visible default. */
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  /** cubic-bezier(0.16, 1, 0.3, 1) */
  easeOut: [0.16, 1, 0.3, 1] as const,
} as const;
