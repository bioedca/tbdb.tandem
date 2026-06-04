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
 * range (a teal direction, §8.2), used only for interactive affordances: links,
 * focus rings, primary buttons, active facets. Invariant: chrome color never
 * overlaps data color — proven in `color.ts` via `assertChromeDataDisjoint()`.
 */
export const brand = {
  accent: '#0f766e', // teal-700  — links / active facet / primary (AA: 5.47:1 on white)
  accentStrong: '#115e59', // teal-800  — hover / pressed
  accentSubtle: '#f0fdfa', // teal-50   — soft background tint
} as const

/** Ink/slate neutral base — text, surfaces, hairlines, and the dark chrome bar. */
export const neutral = {
  ink: '#0f172a', // slate-900 — strongest text + dark chrome background
  text: '#334155', // slate-700 — body text
  muted: '#64748b', // slate-500 — secondary / caption text
  hairline: '#e2e8f0', // slate-200 — 1px borders
  surface: '#ffffff', //           — cards / panels
  surfaceSubtle: '#f8fafc', // slate-50  — page background
  chromeFg: '#e2e8f0', // slate-200 — text on the dark chrome bar
} as const

/**
 * Type ramp (§8.3): [font-size, line-height]. Components never hard-code sizes.
 * `body` is the BASE default (set in app.css @layer base), not a `text-body`
 * size utility — that class name is the body COLOR (see app.css comment).
 */
export const type = {
  display: ['2.25rem', '2.5rem'], // 36/40 — page hero
  h1: ['1.5rem', '2rem'], // 24/32
  h2: ['1.25rem', '1.75rem'], // 20/28
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
} as const
