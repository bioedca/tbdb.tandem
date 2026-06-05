// tbdb.tandem design tokens (PLAN §8).
//
// These mirror the Tailwind v4 `@theme` block in `src/app.css` and exist for
// PROGRAMMATIC use — Plotly and D3 cannot read Tailwind utility classes, so any
// chart/diagram that needs a token color/size/duration reads it from here.
//
// ── KEEP IN SYNC ──────────────────────────────────────────────────────────────
// Every value below MUST equal its `@theme` counterpart in `app.css`. They are
// two faces of one source of truth (§8 intro). The 20-AA *data* palette is NOT
// here — it lives in `src/lib/color.ts` (§8.2) and is kept deliberately separate
// from this chrome/identity layer.

/**
 * Brand / UI accent — ONE deliberate hue chosen OUTSIDE the 20-AA specifier hue
 * range (a deep-blue direction ~197°, §8.2), used only for interactive affordances:
 * links, focus rings, primary buttons, active facets. A darkened relative of the
 * site's #6096B4 palette blue, pushed dark + clear of the specifier "Basic" blues
 * (≥24° hue gap) so it stays AA-legible as text and never reads as data. Invariant:
 * chrome color never overlaps data color — proven in `color.ts` via
 * `assertChromeDataDisjoint()`.
 */
export const brand = {
  accent: '#2d6e87', // deep palette blue — links / active facet / primary (AA: 5.7:1 white, 4.7:1 cream)
  accentStrong: '#21566b', // darker — hover / pressed
  accentSubtle: '#e9f1f5', // soft blue tint — backgrounds
  onDark: '#93bfcf', // light palette blue — the brand mark/accents ON the deep-blue chrome bar
} as const

/** Neutral base — text, surfaces, hairlines (blue/cream palette family). */
export const neutral = {
  ink: '#0f172a', // slate-900 — strongest text
  text: '#334155', // slate-700 — body text
  muted: '#556373', // blue-slate — secondary / caption text (AA on cream + white)
  hairline: '#c7d4dc', // soft blue-grey — 1px borders
  surface: '#ffffff', //           — cards / panels
  surfaceSubtle: '#eee9da', // warm cream — page background
  chromeFg: '#e7eff2', // light — text on the deep-blue chrome bar
} as const

/**
 * Type ramp (§8.3): [font-size, line-height]. Components never hard-code sizes.
 * `body` is the BASE default (set in app.css @layer base), not a `text-body`
 * size utility — that class name is the body COLOR (see app.css comment).
 *
 * The top of the ramp (display, h1) is FLUID via clamp() so headings/KPI numbers
 * scale with the viewport (mirrors app.css). This object is REFERENCE-ONLY — it is
 * never imported at runtime (Plotly/D3 read literal numeric sizes), so the clamp()
 * strings are safe here; they document the intent and keep the app.css mirror honest.
 */
export const type = {
  hero: ['clamp(1.4375rem, 0.8rem + 2.85vw, 3rem)', '1.1'], // ≈23→48 — page-banner title (fitText-fitted)
  display: ['clamp(1.6rem, 1.1rem + 2.2vw, 2.25rem)', '2.5rem'], // ≈26→36 / 40 — page hero
  h1: ['clamp(1.3rem, 1.15rem + 0.9vw, 1.5rem)', '2rem'], // ≈21→24 / 32
  h2: ['1.25rem', '1.75rem'], // 20/28
  cardTitle: ['clamp(1.25rem, 1rem + 1.25vw, 1.875rem)', '1.2'], // ≈20→30 — opt-in fluid card heading (About)
  lead: ['clamp(0.9375rem, 0.85rem + 0.55vw, 1.1875rem)', '1.6'], // ≈15→19 — fluid intro/lead prose
  body: ['1rem', '1.5rem'], // 16/24 — base default
  small: ['0.875rem', '1.25rem'], // 14/20
  caption: ['0.75rem', '1rem'], // 12/16
} as const

/** Font stacks (§8.3): self-hosted Inter (UI) + JetBrains Mono (sequences/coords). */
export const fontFamily = {
  sans: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const

/** Surface treatment (§8.4): one radius/border/shadow language for every panel. */
export const radius = {
  sm: '0.375rem', // 6px  — chips, badges
  md: '0.5rem', // 8px  — buttons, inputs
  lg: '0.75rem', // 12px — cards / panels
} as const

/**
 * Motion (§8.4): purposeful and brief; honors `prefers-reduced-motion` in CSS.
 * For PROGRAMMATIC transitions (Plotly/D3). On the CSS side the same durations
 * are applied with Tailwind's `duration-150` / `duration-200` utilities (matching
 * fast / base), and `ease` is the shared `--ease-standard` token (`ease-standard`).
 */
export const motion = {
  fast: '150ms',
  base: '200ms',
  slow: '250ms',
  ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/** Layout (§8.4): max-width content container + dashboard grid gutter. */
export const layout = {
  maxWidth: '90rem', // 1440px content container
  gutter: '1.5rem', // 24px grid gutter
  measure: '56ch', // fluid reading measure for body prose (→ `max-w-measure`)
} as const
