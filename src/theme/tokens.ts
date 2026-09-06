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

/**
 * Category identity. The one chroma in this app that is not money.
 *
 * DESIGN.md reserves colour for information and bans a brand hue. This is not a relaxation of that
 * rule but the same rule applied to a second kind of information: in a composition chart the
 * question is *which category is this arc*, and length cannot answer it — which is precisely the gap
 * `RuleBars` names when it declines hue for magnitude. Hue here encodes identity and nothing else.
 * It never encodes size, direction, or health; the ceiling does that, in ink.
 *
 * **Every value was computed and validated, not chosen by eye.** Placed in OKLCH and run through a
 * colour-vision validator on the dark surface, all-pairs — because arcs in a donut sit next to
 * whichever other arc the month produces, so "adjacent" is every pair. Three earlier attempts
 * failed and are worth recording so nobody re-derives them:
 *
 * - Eight desaturated tones read as grey and scored ΔE 7.1 between steel and plum for *normal*
 *   vision. Fleeing the money hues had made the categories indistinguishable from each other.
 * - Eight hues evenly spread at one lightness still collapsed: adjacent hues 45° apart are too
 *   close under deuteranopia, worst pair ΔE 3.1.
 * - Magenta could not coexist with teal at any lightness — deuteranopia strips red, and both fall
 *   to the same blue-grey. Magenta was cut, not softened.
 *
 * What survived is five hues carrying two separations at once, hue *and* lightness, because
 * lightness is the axis colour-blind vision keeps. Worst all-pairs separation is ΔE 8.7 under
 * deuteranopia and 15.0 for normal vision, with every tone at or above 3:1 against `bg`.
 *
 * They stay clear of money by construction: none approaches the chroma of `positive` or
 * `negative`, and the wheel's green sector — where `positive` lives — carries no category at all.
 *
 * The set is closed, and small on purpose. An open picker would hand the owner `#3FBF74` on a
 * plate, and a category the exact green of income is a lie the chart tells every time it opens.
 * Identity's finer grain lives in the sixteen drawn icons; colour only has to separate a handful of
 * arcs, and five that genuinely separate beat eight that do not.
 */
export const categoryHue = {
  terracotta: '#D07A53',
  bronze: '#876114',
  teal: '#2BA19D',
  azure: '#3175BC',
  plum: '#8B4486',
} as const;

export type CategoryHue = keyof typeof categoryHue;

/** Fixed order. A hue follows the category, never its rank, so this never re-sorts. */
export const categoryHues = [
  'terracotta',
  'bronze',
  'teal',
  'azure',
  'plum',
] as const satisfies readonly CategoryHue[];

/**
 * Low-alpha luminance that wraps onto the curved panel edge. Never carries content.
 *
 * Colour and opacity are separate on purpose: react-native-svg drops the alpha channel of an
 * `rgba()` string passed to `stopColor` on Android, painting the stop fully opaque. A browser
 * parses it correctly, so the bug is invisible on web and washes out the whole screen on device.
 * Opacity belongs in `stopOpacity`.
 */
export const rim = {
  color: '#F2F4F7',
  innerOpacity: 0.055,
  outerOpacity: 0,
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
