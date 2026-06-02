// TandemView data/specifier palette (PLAN §8.2).
//
// THE color axis for the dataset. One colorblind-aware 20-amino-acid set, grouped
// by side-chain biochemistry so related specifiers read as a family, reused
// EVERYWHERE specifier appears: chips, element tints, bars, matrix cells, tree
// tips. Kept deliberately separate from the chrome/identity layer in
// `design/tokens.ts` — the brand accent is chosen OUTSIDE these hues and the two
// sets are proven disjoint by `assertChromeDataDisjoint()` below.
//
// Conventions (§8.2): `?`/unknown specifier → neutral grey; a "mixed" locus
// specifier (`ILE;LEU`, `GLY;TRP`, …) → a 45° two-tone split of its constituents.

import { brand, neutral } from './design/tokens'

/** The 20 standard amino-acid 3-letter codes used as specifier keys. */
export type AminoAcid =
  | 'ALA' | 'ARG' | 'ASN' | 'ASP' | 'CYS' | 'GLN' | 'GLU' | 'GLY' | 'HIS' | 'ILE'
  | 'LEU' | 'LYS' | 'MET' | 'PHE' | 'PRO' | 'SER' | 'THR' | 'TRP' | 'TYR' | 'VAL'

/** Specifier side-chain groups (§8.2 "grouped by biochemistry"). One hue family each. */
export const SPECIFIER_GROUPS: { name: string; members: AminoAcid[] }[] = [
  { name: 'Aliphatic', members: ['GLY', 'ALA', 'VAL', 'LEU', 'ILE', 'PRO'] }, // green / lime
  { name: 'Aromatic', members: ['PHE', 'TRP', 'TYR'] }, //                       purple / pink
  { name: 'Sulfur', members: ['CYS', 'MET'] }, //                                yellow / gold
  { name: 'Polar uncharged', members: ['SER', 'THR', 'ASN', 'GLN'] }, //         orange
  { name: 'Basic', members: ['HIS', 'LYS', 'ARG'] }, //                          blue / indigo
  { name: 'Acidic', members: ['ASP', 'GLU'] }, //                                red
]

/**
 * The 20-AA specifier palette. Hue families are spaced so the brand teal (≈175°)
 * lands in an unused gap; within a family, lightness separates members. The
 * high-frequency specifiers (TRP, THR, MET, LEU, HIS, TYR, ILE) deliberately sit
 * in DIFFERENT hue families so they're distinguishable at a glance.
 */
export const SPECIFIER_COLORS: Record<AminoAcid, string> = {
  // Aliphatic — greens & limes (hue ≈ 83 / 142)
  GLY: '#a3e635',
  ALA: '#84cc16',
  VAL: '#4ade80',
  LEU: '#16a34a',
  ILE: '#4d7c0f',
  PRO: '#166534',
  // Aromatic — purple / fuchsia / pink (hue ≈ 271–330)
  PHE: '#c026d3',
  TRP: '#9333ea',
  TYR: '#db2777',
  // Sulfur — yellow / gold (hue ≈ 43–48)
  CYS: '#a16207',
  MET: '#eab308',
  // Polar uncharged — oranges (hue ≈ 18–27)
  SER: '#fb923c',
  THR: '#ea580c',
  ASN: '#9a3412',
  GLN: '#c2410c',
  // Basic — blues & indigo (hue ≈ 217–243)
  HIS: '#2563eb',
  LYS: '#4f46e5',
  ARG: '#1e40af',
  // Acidic — reds (hue ≈ 0)
  ASP: '#dc2626',
  GLU: '#991b1b',
}

/** `?` / unknown / null specifier — deliberately neutral (achromatic), NOT a hue. */
export const UNKNOWN_SPECIFIER_COLOR = '#9ca3af' // gray-400

/**
 * Phylum CONTEXT ramp (§8.2) — a small, separate, deliberately neutral ramp used
 * ONLY for the tree's phylum ring, so it never competes with the specifier hues.
 * The dataset is ~monochrome (454/470 Firmicutes), so this is intentionally quiet.
 */
export const PHYLUM_COLORS: Record<string, string> = {
  Firmicutes: '#cbd5e1', // slate-300 — the quiet majority
  Actinobacteria: '#94a3b8', // slate-400
  Tenericutes: '#78716c', // stone-500
  Chloroflexi: '#a8a29e', // stone-400
  'Deinococcus-Thermus': '#64748b', // slate-500
  Synergistetes: '#57534e', // stone-600
}
/** Fallback for unassigned/null phylum (the 3 unassigned loci). */
export const PHYLUM_DEFAULT_COLOR = '#d6d3d1' // stone-300

/**
 * Phylum COUNT ramp (§8.2) — the continuous companion to `PHYLUM_COLORS`, for the
 * specifier×phylum heatmap's count cells (S2.4). A deliberately quiet, low-
 * saturation slate ramp: it is CHROME (a magnitude scale), so it never collides
 * with the saturated 20-AA specifier palette (§8.2 chrome⟂data) and is distinct
 * from the brand teal. It tops out at slate-400 so the dark in-cell count text
 * stays AA-readable on the most-saturated cell. Expressed as a Plotly colorscale.
 */
export const PHYLUM_COUNT_RAMP: [number, string][] = [
  [0, '#f8fafc'], // slate-50  — lowest counts
  [0.25, '#e2e8f0'], // slate-200
  [0.6, '#cbd5e1'], // slate-300
  [1, '#94a3b8'], // slate-400 — capped maximum (ink text ≈ 7:1 contrast)
]

const AA_SET = new Set(Object.keys(SPECIFIER_COLORS))

/** Uppercase + trim a raw specifier token. */
function normalizeToken(token: string): string {
  return token.trim().toUpperCase()
}

/** Split a (possibly mixed) specifier string on `;` into normalized tokens. */
export function splitSpecifier(spec: string | null | undefined): string[] {
  if (!spec) return []
  return spec
    .split(';')
    .map(normalizeToken)
    .filter((t) => t.length > 0)
}

/** True when a locus specifier holds more than one distinct amino acid (`ILE;LEU`). */
export function isMixed(spec: string | null | undefined): boolean {
  return new Set(splitSpecifier(spec).filter((t) => t !== '?')).size > 1
}

/** Color for a SINGLE amino-acid token (or `?`/unknown/null → neutral grey). */
export function aaColor(token: string | null | undefined): string {
  if (!token) return UNKNOWN_SPECIFIER_COLOR
  const t = normalizeToken(token)
  return AA_SET.has(t) ? SPECIFIER_COLORS[t as AminoAcid] : UNKNOWN_SPECIFIER_COLOR
}

/** Ordered constituent colors of a specifier (1 for single/`?`, 2+ for mixed). */
export function specifierColors(spec: string | null | undefined): string[] {
  const tokens = splitSpecifier(spec)
  if (tokens.length === 0) return [UNKNOWN_SPECIFIER_COLOR]
  return tokens.map(aaColor)
}

/** Context color for a phylum (unassigned/null → the neutral default). */
export function phylumColor(phylum: string | null | undefined): string {
  if (!phylum) return PHYLUM_DEFAULT_COLOR
  return PHYLUM_COLORS[phylum] ?? PHYLUM_DEFAULT_COLOR
}

/**
 * CSS `background` for a specifier swatch: a solid color for single/`?`, or an
 * angled hard-stop two-tone for a mixed locus (§8.2 "mixed loci = 45° two-tone").
 * Generalizes to N constituents with even hard-stop bands.
 */
export function swatchBackground(spec: string | null | undefined, angleDeg = 45): string {
  const colors = specifierColors(spec)
  if (colors.length === 1) return colors[0]
  const step = 100 / colors.length
  const stops = colors
    .map((c, i) => `${c} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`)
    .join(', ')
  return `linear-gradient(${angleDeg}deg, ${stops})`
}

// ── Color math (pure; reused by the disjointness proof and unit tests) ──────────

export interface Rgb {
  r: number
  g: number
  b: number
}

/** Parse `#rrggbb` (or `#rgb`) → 0–255 channels. Throws on malformed input. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Bad hex color: ${hex}`)
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/**
 * sRGB → HSL with hue in degrees [0,360), saturation/lightness in [0,1].
 * Achromatic inputs (r==g==b) have undefined hue; this returns `h: 0, s: 0`.
 */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex)
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
  else if (max === gn) h = ((bn - rn) / d + 2) * 60
  else h = ((rn - gn) / d + 4) * 60
  return { h, s, l }
}

/** Smallest angular distance between two hues, in degrees [0,180]. */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs((a % 360) - (b % 360))
  return Math.min(d, 360 - d)
}

/** Euclidean distance between two colors in sRGB space [0, ~441]. */
export function rgbDistance(a: string, b: string): number {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b)
}

/** `#rrggbb` + alpha → an `rgba(r, g, b, a)` string (e.g. selection dimming). */
export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ── Chrome ⟂ data disjointness proof (§8.2 invariant; S1.2 exit criterion) ──────

/**
 * The chromatic BRAND accents (teals). Separated from data by HUE — this is the
 * §8.2 "brand accent chosen OUTSIDE the 20-AA hue range" requirement.
 */
const BRAND_ACCENTS: string[] = [brand.accent, brand.accentStrong, brand.accentSubtle]

/**
 * The ink/slate NEUTRAL chrome. Separated from data by being less saturated than
 * ANY specifier — the §8.2 "ink/slate neutral base" vs the chromatic data palette.
 */
const CHROME_NEUTRALS: string[] = [
  neutral.ink,
  neutral.text,
  neutral.muted,
  neutral.hairline,
  neutral.surface,
  neutral.surfaceSubtle,
]

/** The 20 CHROMATIC data colors (excludes the by-design-neutral `?` grey). */
const CHROMATIC_DATA: string[] = Object.values(SPECIFIER_COLORS)

/** Minimum acceptable hue gap (°) between a brand accent and any data hue. */
export const MIN_BRAND_DATA_HUE_GAP = 20

export interface DisjointnessReport {
  /** Min over brand accents → nearest chromatic data hue (°). */
  minHueGap: number
  /** Most-saturated neutral chrome color (HSL S). */
  maxNeutralSaturation: number
  /** Least-saturated specifier color (HSL S). */
  minDataSaturation: number
  /** Nearest chrome → data sRGB distance (informational, not gated). */
  minRgbDistance: number
}

/**
 * Prove the chrome/identity palette and the data/specifier palette never collide
 * (§8.2 "chrome color never overlaps data color"). Three clauses, each matching a
 * line of the spec; sRGB euclidean distance is NOT gated (it under-separates dark
 * colors) but is reported:
 *   1. no hex string is shared between chrome and ANY data color (incl. `?`);
 *   2. every chromatic brand accent is ≥ MIN_BRAND_DATA_HUE_GAP in hue from every
 *      specifier hue — proves the accents are "outside the 20-AA hue range";
 *   3. every neutral chrome color is STRICTLY LESS SATURATED than the least-
 *      saturated specifier — so a slate/ink can never read as a data swatch.
 * Throws on violation; returns the measured margins on success.
 *
 * (The phylum ramp is a third, deliberately-neutral axis — not part of this proof.)
 */
export function assertChromeDataDisjoint(): DisjointnessReport {
  const allData = [...CHROMATIC_DATA, UNKNOWN_SPECIFIER_COLOR].map((c) => c.toLowerCase())
  const allChrome = [...BRAND_ACCENTS, ...CHROME_NEUTRALS].map((c) => c.toLowerCase())

  // Clause 1 — no shared hex.
  const shared = allChrome.filter((c) => allData.includes(c))
  if (shared.length > 0) {
    throw new Error(`Chrome/data palette collision (shared hex): ${shared.join(', ')}`)
  }

  // Clause 2 — each brand accent's hue is clear of every specifier hue.
  let minHueGap = Infinity
  for (const accent of BRAND_ACCENTS) {
    const ah = hexToHsl(accent).h
    for (const da of CHROMATIC_DATA) {
      minHueGap = Math.min(minHueGap, hueDistance(ah, hexToHsl(da).h))
    }
  }
  if (minHueGap < MIN_BRAND_DATA_HUE_GAP) {
    throw new Error(
      `Brand accent hue too close to a specifier hue: ${minHueGap.toFixed(1)}° < ${MIN_BRAND_DATA_HUE_GAP}°`,
    )
  }

  // Clause 3 — neutrals are less saturated than any specifier.
  const maxNeutralSaturation = Math.max(...CHROME_NEUTRALS.map((c) => hexToHsl(c).s))
  const minDataSaturation = Math.min(...CHROMATIC_DATA.map((c) => hexToHsl(c).s))
  if (maxNeutralSaturation >= minDataSaturation) {
    throw new Error(
      `Neutral chrome not separable from data by saturation: max neutral ${maxNeutralSaturation.toFixed(
        3,
      )} ≥ min data ${minDataSaturation.toFixed(3)}`,
    )
  }

  // Informational only.
  let minRgbDistance = Infinity
  for (const c of [...BRAND_ACCENTS, ...CHROME_NEUTRALS]) {
    for (const da of CHROMATIC_DATA) minRgbDistance = Math.min(minRgbDistance, rgbDistance(c, da))
  }

  return { minHueGap, maxNeutralSaturation, minDataSaturation, minRgbDistance }
}

// Fail loudly in development if the palettes ever drift into collision. The build
// strips this in production; S1.6 also asserts it as a unit test.
if (import.meta.env.DEV) {
  assertChromeDataDisjoint()
}
