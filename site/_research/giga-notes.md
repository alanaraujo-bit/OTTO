# giga.ai — study notes (2026-10-19)

Captured with playwright-cli (Edge), full scroll in viewport-sized steps.

- Desktop 1440x900: `shots/giga-d-00.png` … `shots/giga-d-19.png`
- Mobile 390x844: `shots/giga-m-00.png` … `shots/giga-m-19.png`, contact sheets `shots/sheet-m-0..3.png`

Page height ~15.7k px at 1440. Plain black ground (`#000`). No Lenis, no GSAP global: native scroll,
custom scroll-linked scripts, one `<canvas>` for the particle/flow work.

## Section order

1. **Fixed nav** — logo left, 4 menu items centred (Geist 14 / white), `Sign in` + one loud orange
   CTA (`SEE A DEMO`, Geist Mono 11 uppercase, tracked). Nav stays fixed, black-translucent, a
   hairline under it.
2. **Hero** — blurred vertical colour bands as the only colour field on the page (orange to violet).
   Mono eyebrow with a small orange square, H1 in a *pixel/line* display face at 72px with leading
   tighter than the size (64px). A 19px lede sits opposite in the right column, not under the H1.
   Below: a big **product object** — a two-pane "device" (black terminal pane with `hello_` and an
   input; a machined light-grey panel with a round TALK dial and VOICE/CHAT corners). The hero is
   *held*: the next section slides over it while it dims to near black (`hero-held`, `hero-fixed`).
3. **Logo strip** — greyscale customer logos, drifting marquee, separated by the page's vertical
   column hairlines.
4. **Industries carousel** — mono eyebrow, H2 in the display face, arrows right; a wide panel split
   into a grain-textured form and a horizontal accordion of photos.
5. **"Agents that keep getting better"** — the signature move: a **pinned, scroll-scrubbed chat**.
   Left column: H2 + a numbered step list (01–05, mono numbers) whose active row brightens and grows
   a progress hairline under it. Right: a tall dark panel whose header word changes (`waiting`,
   `customer typing`, `working`, `thinking`) and whose transcript plays forward with scroll —
   bubbles, a mono "tool trace" (`Checking card ⌄ / Identity verified / Pre-approved for $15,000`),
   a mood readout top right, and a green "Outcome logged" block at the end.
6. **How it works** — H2 + lede, then a full-bleed canvas: many hairlines from three labelled
   sources braid into one node ("Your agent"). Big centred one-word statements (`Build.`,
   `Observe.`, `Improve.`) with a **sticky segmented control** pinned to the bottom of the viewport
   (BUILD / OBSERVE / IMPROVE + `EXPLORE THE PLATFORM`). The canvas morphs per chapter: flow lines →
   colour-coded particle galaxy (a legend of 5 categories) → dot-matrix rows over time → a single
   glowing curve that bends upward after "Agent updated" → the braid again, now tinted.
7. **Customer story** — big photo bleeding off the right, dotted callout leaders labelling the
   photo (`DELIGHT AU6+AU12`), quote with **bold fragments in white inside grey text**, a stat.
8. **Final CTA** — centred H2 in the display face, two-line lede, one wide input with the orange
   button inside it and a cold glow sweeping under the field.
9. **Footer** — logo + compliance badges left, four link columns, legal row, hairline separators.

## Type

- Geist (sans) for UI/body, Geist Mono for eyebrows/labels/buttons (11px, uppercase, weight 500),
  a "Geist Pixel Line" display face for every H1/H2 — the signature.
- H1 72/64, lede 19/27.5, body 14–18, eyebrow 11/14. Headings white; secondary text is the same
  white at 55–86% alpha rather than a separate grey.
- Contrast between a huge display line and tiny mono labels is the rhythm.

## Motion

- Scroll-linked everything, almost no time-based reveals: the chat plays *with* the scroll, steps
  advance by scroll, the canvas morphs by scroll position.
- Hero held and dimmed while content scrolls over it.
- Typing caret in inputs (`hello_`, `Help.|`), a header word that swaps state.
- Marquee for logos; sticky segmented control that tracks the chapter.
- Hover: buttons get a soft inner light; cards are rare.

## Spacing / layout

- Content column ~1100px (x 170–1270 at 1440), with **visible vertical hairlines** on a 6-column
  grid running behind sections — structure drawn, not boxed.
- Very generous vertical spacing: sections are a full viewport or more; one idea per screen.
- Mobile keeps the same order; pinned sections stack (step title above the panel) and the sticky
  segmented control stays at the bottom.

## Product visuals

- The product is shown as a *working instrument*, never as a screenshot: an interactive device in
  the hero, a live transcript, a data canvas. Labels are mono, tiny, precise.

## CTA treatment

- One accent colour (orange), only on the primary CTA and eyebrow squares. Same CTA label
  everywhere. Final CTA is centred and alone on its screen.

## What to translate into OTTO (qualities, not content)

| giga | OTTO |
|---|---|
| Display face as signature | Geist Mono numerals at display scale — the numeral is the hero |
| Colour field hero | Rim light: low-alpha warm-neutral bleed from the edges, no hue |
| Column hairlines behind sections | Ledger hairlines — rules, never cards |
| Pinned scroll-scrubbed chat with steps | Otto assistant: voice → draft → confirmation → "Feito." |
| Canvas morph by chapter | The month: entries fall into one balance line; dots collapse into the category ring |
| Customer story + callouts | The shared debt page, live, with dotted callouts |
| Logo marquee | A ledger tape of a month's entries |
| One accent colour | No brand hue: ink-filled CTA; colour only for money (green in, red out) |
| Typing caret | Keypad pushing centavos in from the right |
