# OTTO — Visual world: "Ledger Nocturne"

## The idea
OTTO is not a dashboard. It is an **instrument** — a machined object that has already done the
arithmetic and is quietly reporting the result. The reference is a precision ledger read in a dark
room, not a fintech marketing site.

Three commitments carry the world. Every screen must show at least two of them.

### 1. The numeral is the hero
Every screen has exactly one dominant number, set in Geist Mono at display scale with tight tracking
and tabular figures. Currency symbols and cents are set smaller and in tertiary ink, so the magnitude
reads first and the precision reads second. On surfaces with no number (auth, empty states) the OTTO
wordmark takes that slot in the same treatment.

### 2. Hairline ledger geometry — never cards
Structure comes from 1px rules and generous whitespace, not from boxed cards. Cards are banned as a
page scaffold; nested cards are banned outright. Grouping is expressed by proximity and by a rule
above the group. This is the ledger, rendered.

### 3. Rim light on the curve
The Edge 60 Fusion has a quad-curved panel. OTTO treats the curve as a light source, not a hazard: a
very low-alpha radial bleed sits behind everything and wraps onto the curved edge, so the screen
appears lit from its rim. **No content, text, or touch target ever enters the curve gutter** — only
luminance does.

## Color: achromatic ground, chroma means money
Color is information, never decoration. If something is green it is money coming in. A green button
is a defect.

| Token | Value | Use |
|---|---|---|
| `bg` | `#08090B` | app ground |
| `surface` | `#101216` | raised passages |
| `surfaceHi` | `#171A20` | pressed / selected |
| `hairline` | `#22262E` | all rules and borders |
| `hairlineStrong` | `#333945` | focused rule |
| `ink` | `#F2F4F7` | primary text, filled CTA ground |
| `inkMuted` | `#9BA1AC` | secondary text |
| `inkFaint` | `#737B88` | labels, units, tertiary |
| `positive` | `#3FBF74` | inflow / paid / ahead |
| `negative` | `#E5484D` | outflow / overdue |
| `warning` | `#E2A03F` | due soon |

The primary CTA is `ink` filled with `bg` text. There is no brand hue. OTTO's identity is the
warm-neutral light itself.

### The one exception: category identity (added 2026-09-06)

Composition is the second kind of information colour is allowed to carry. In a ring of spending the
question is *which category is this arc*, and length cannot answer it — that is the gap `RuleBars`
names when it declines hue for magnitude. So five hues encode **category identity**, and nothing
else. They never encode size, direction, or health.

| Token | Value |
|---|---|
| `categoryHue.terracotta` | `#D07A53` |
| `categoryHue.bronze` | `#876114` |
| `categoryHue.teal` | `#2BA19D` |
| `categoryHue.azure` | `#3175BC` |
| `categoryHue.plum` | `#8B4486` |

The rules that keep this from becoming a brand palette:

- **The set is closed.** No colour picker, no custom hex. An open picker hands the owner `#3FBF74`,
  and a category the exact green of income is a lie the chart tells every time it opens.
- **No green.** The wheel's green sector belongs to `positive`. No category may sit there.
- **Money still owns `positive`, `negative` and `warning`.** Spending past a ceiling is drawn in
  `negative` because it *is* money going out, and that reading only stays legible because no
  category can wear red.
- **Five, not eight.** Placed in OKLCH and validated for colour-vision separation on this ground,
  all-pairs. Eight desaturated tones scored ΔE 7.1 for *normal* vision, and magenta could not
  coexist with teal at any lightness. What ships holds ΔE 8.7 under deuteranopia and 15.0 normal,
  every tone at or above 3:1 against `bg`. The finer grain of identity is carried by sixteen drawn
  glyphs, not by more colours.
- **Colour is never identity alone.** Any surface using these ships a legend with the name, and the
  glyph repeats it.

## Type
One family pair, self-hosted via `@expo-google-fonts`.
- **Geist Sans** — UI, labels, copy. Weights 400 / 500 / 600.
- **Geist Mono** — every number, everywhere, always tabular. Also the wordmark. Numbers only: words,
  labels and dates written as words ("outubro de 2026", "segunda") are set in Sans.

A flow carries its direction in a character as well as a colour: an inflow is written "+R$ 1.600",
an outflow plain "R$ 800" in `negative`. A minus is kept for a balance below zero.

Scale (sp, follows system font scaling):
`display 44 / title 26 / heading 19 / body 15 / label 13 / micro 11`
Tracking tightens as size grows; `display` sits at -0.04em, the floor.

## Motion
One authored moment per screen, exponential ease-out from an already-visible default. Material
shared-axis for route changes, container transform for expanding a row into detail. Honors the system
"remove animations" setting. 120Hz target: everything animated runs on the UI thread via Reanimated
worklets — no `setState` animation.

## Layout constants (Edge 60 Fusion)
- `gutter` 24dp horizontal — this is the curve-safe margin, not a taste choice.
- Touch targets 48dp minimum, 8dp apart.
- Edge-to-edge; status bar and navigation bar insets applied per screen, never a global padding hack.
- No horizontal-swipe gesture may be the only route to an action — the system Back gesture owns the
  lateral edges.

## Banned in this world
Cards as scaffold. Gradient text. Glass/blur as decoration. Colored left borders. Emoji as icons.
Category colour outside the five tokens above, or any of them used for something other than which
category a mark belongs to.
Progress rings and sparklines standing in for content. Neon-on-black accent (the 2025 AI-app tell).
Any green or red that is not describing money.

### The one red that is not money (added 2026-10-18)
`negative` may also mark a **destructive action label** ("excluir", "confirmar" on a delete) or a
**validation error** under a field. Nothing else: not a status, not a strength meter, not a heading,
not decoration. Both exceptions are warnings about losing something, which is the same news red
carries when it is money. `positive` has no exception.

### The one glass surface (added 2026-10-18)
The floating tab bar is glass, and it is the only glass in the app. It is functional, not decoration:
the bar floats over scrolling content, and the blur is what keeps that content legible as *behind*
the controls instead of colliding with them. The tint is heavy enough that no money or category
colour passes through at strength. No other surface may blur.
