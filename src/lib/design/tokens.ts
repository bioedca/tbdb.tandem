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
  accent: '#15677d', // deep anodized teal (hue 192.7°, S 0.71) — links / active facet / primary.
  //                    AA as text on white 6.4:1, page 5.9:1, inset 5.7:1; white-on-fill 6.4:1.
  //                    Hue gap to the nearest specifier (HIS ~221°) = 28.5° — well clear of the 20° floor.
  accentStrong: '#0e5364', // darker teal — hover / pressed / visited (7.4:1 on white)
  accentSubtle: '#e4f1f4', // soft teal tint — active-facet / info-well backgrounds (hue ~191°)
  onDark: '#5ec2d6', // light teal — the brand mark/accents ON the deep-teal chrome bar (6.6:1 on chrome)
} as const

/** Neutral base — cool "instrument paper" greys (PLAN §8.2). Every value is far below
 *  the 0.642 minimum specifier saturation, so the chrome⟂data proof holds by saturation. */
export const neutral = {
  ink: '#0d1726', // cool near-black — strongest text / headings / KPI numbers (17.98:1 on white)
  text: '#3a4656', // cool slate — body prose (9.6:1 on white)
  muted: '#5d6b7d', // cool blue-slate — secondary / caption / axis text (AA on every surface: ≥4.8:1)
  hairline: '#dce2ea', // cool blue-grey — 1px rules
  hairlineStrong: '#cdd5e0', // one step darker — structural panel / cell dividers
  surface: '#ffffff', //         — cards / panels (the brightest layer)
  surfaceRaised: '#fafbfd', // near-white raised tier — KPI metric row / inner wells
  surfaceSubtle: '#eef1f5', // cool inset — table zebra/header, hover, code wells (one step under the page)
  page: '#f3f5f8', // cool instrument paper — the page background (replaces the warm cream)
  chromeFg: '#dbe7ec', // light — text on the deep-teal chrome bar (10.9:1)
} as const

/**
 * Type ramp (§8.3): [font-size, line-height]. Components never hard-code sizes.
 * `body` is the BASE default (set in app.css @layer base), not a `text-body`
 * size utility — that class name is the body COLOR (see app.css comment).
 *
 * ONE monotonic hierarchy — size alone orders the tiers at every width:
 *   hero > display > h2 > lead > body > small > caption
 * The four upper steps are FLUID via clamp() so they breathe between phone and desktop
 * while keeping that order intact. There is ONE page-title tier (`hero`) and ONE
 * section/card-title tier (`h2`); the old parallel `h1` / `cardTitle` steps are retired.
 * This object is REFERENCE-ONLY — never imported at runtime (Plotly/D3 read literal numeric
 * sizes), so the clamp() strings are safe here and keep the app.css mirror honest.
 */
export const type = {
  hero: ['clamp(1.875rem, 1.3rem + 2.2vw, 2.625rem)', '1.05'], // ≈30→42 — page title (fitText-fitted)
  display: ['clamp(1.625rem, 1.35rem + 1.4vw, 2.125rem)', '1.05'], // ≈26→34 — big mono data numbers (KPI/stat)
  h2: ['clamp(1.1875rem, 1rem + 0.8vw, 1.4375rem)', '1.25'], // ≈19→23 — the single section/card-title tier
  lead: ['clamp(1.0625rem, 0.95rem + 0.5vw, 1.1875rem)', '1.6'], // ≈17→19 — intro/standfirst prose (measure-capped)
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
  lg: '0.625rem', // 10px — cards / panels (tightened from 12px — crisper, more engineered)
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

/** Layout (§8.4): max-width content container + dashboard grid gutter + reading measures. */
export const layout = {
  maxWidth: '144rem', // 2304px content container — QHD-friendly (fills a 2560 screen to ~90%), caps ultrawide/4K
  gutter: '1.5rem', // 24px grid gutter
  measure: '58ch', // tight reading measure — leads, subtitles, captions (→ `max-w-measure`)
  readable: '60ch', // roomier reading measure — sustained body prose (→ `max-w-readable`)
} as const
