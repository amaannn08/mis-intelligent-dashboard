# CLAUDE-DESIGN-RULES.md — the warm editorial system our palette comes from

Source: the Claude/Anthropic design system (via the `popular-web-designs` skill), reduced to the rules that apply to
this product. Our WEH CRM palette is the same family — warm neutrals, terracotta/orange accent, parchment-light
surfaces, serif display type. **Follow these when designing any surface, especially the chat answer and its charts.**

## Colour discipline
- Warm neutrals only. **Never a cool blue-grey.** Our mapping of the reference palette:
  | reference | ours |
  |---|---|
  | Parchment `#f5f4ed` | page/surface `#FAFAF8` |
  | Ivory `#faf9f5` | cards `#FFFFFF` (on `#FAFAF8`) |
  | Warm Sand `#e8e6dc` | hover/neutral chip `#F5F4F0` / `#EEECE7` |
  | Border Cream `#f0eee6` / `#e8e6dc` | border `#E8E5DE` |
  | Near Black warm `#141413` | text `#1A1815` |
  | Olive Gray `#5e5d59` / Stone `#87867f` | secondary `#5A5650` / muted `#9A958E` |
  | Terracotta `#c96442` | accent `#FF7102` (tints `#FFEFE2`, `#FFD0AB`) |
  | Error crimson `#b53333` | negative `#B42318` (tint `#FEF3F2`) |
  | Focus blue `#3898ec` | the one place a cool colour is allowed: input focus rings |
  | alt series blue `#3A5F8C` | same |
- Accent colour is reserved for the highest-signal moments only (primary action, active nav, key accent). It must not
  be sprinkled as decoration.

## Typography
- Display/headings: our serif (**Playfair Display**) at **weight 500 only — never 700**.
- UI/body: ours **Syne**; numbers, labels, units, timestamps: **DM Mono** (monospace is only for numbers/labels/code,
  never for prose).
- **Body line-height 1.60** for prose (editorial generosity — our long answers must use this).
- Headings tight but not compressed: 1.10–1.30.
- Small labels (≤12 px) carry deliberate letter-spacing (our micro-labels already use `tracking-[0.22em]`); uppercase
  overline labels at ~10 px.
- Suggested sizes for answer content: body 14.5–15 px, meta/caption 12 px, micro labels 10 px, in-answer figure
  emphasis via weight 600 on the sans (not serif bold).

## Spacing & rhythm
- Base unit 8 px; scale 4 / 6 / 8 / 10 / 12 / 16 / 20 / 24 / 30.
- Card padding 20–24 px; section spacing generous (24–32 px between answer blocks, more between unrelated blocks).
- **Editorial pacing**: whitespace is the primary separator — prefer space + a hairline over heavy boxes.
- Content measure for prose: cap at ~68–72 characters (a "content island"), never full-bleed text in a wide panel.

## Depth & surfaces
- Depth comes from **warm ring shadows** (`box-shadow: 0 0 0 1px <warm border>`) and background tone shifts rather
  than drop shadows. When a drop shadow is used it is whisper-soft (`rgba(0,0,0,0.05) 0 4px 24px`).
- Radius scale: 8 px standard cards, 12 px inputs/buttons/nav, 16 px featured containers, 4–6 px for inline elements.
- Never sharp corners below 6 px on interactive elements.

## Charts & data presentation (derived)
- The plot is a **supporting element**: 150–170 px tall, never a hero.
- Left axis only (**never duplicate the axis on the right**), ≤4 ticks, compact currency formatting (`₹2.0 Cr`, `₹50 L`),
  no axis line, horizontal dashed gridlines in the border colour at low emphasis.
- **Every bar carries its value** (compact, mono, muted) — a reader should never need to hover to learn the number.
- Headroom: ~15 % domain padding so bars never touch the plot edges; radius 4 px on the growing end.
- When any value is negative, draw an emphasised zero baseline and render negatives in `#B42318` (and always carry a
  minus sign in the labels, so colour is never the only signal).
- One metric per chart, one axis per chart: never put magnitudes that differ by orders (Cr vs L) on a shared axis.
- No decorative series: no connector lines, no stray dots, no unused legends.
- Tooltip: white card, ring border, mono numbers, period + value (+ MoM when available).

## Do not
- Cool greys, saturated colours beyond the accent, serif bold, heavy shadows, pure-white page backgrounds, sharp
  corners, monospace for prose, decorative gradients.
