// tbdb.tandem data/specifier palette (PLAN §8.2).
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

import type { FuncClass } from './data/types'
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

// ── RNA stem overlay (a SEPARATE categorical axis) ──────────────────────────────
/**
 * Colors for the in-app RNA secondary-structure overlay (PLAN §9 detail flow):
 * each structural domain of the rendered antiterminator fold is tinted by which
 * stem it is. This is its OWN categorical axis — like `PHYLUM_COLORS`, it is NOT
 * part of the chrome⟂specifier disjointness proof. A cool, muted register that
 * harmonizes with the chrome palette and reads distinctly from the saturated 20-AA
 * specifier hues. These stem colors are ALSO the fill for the feature-highlighted
 * member sequences (MemberSequence.svelte / sequence.ts), so the sequence view and the
 * 2D structure read the SAME stem coloring base-for-base. Keyed by the `stems[].key`
 * the build emits (build_json.py `derive_stems`); ordered biological 5′→3′ through the leader.
 */
export type StemKey = 'i' | 'ii' | 'iiab' | 'iii' | 'at'

export const STEM_META: { key: StemKey; label: string; color: string }[] = [
  { key: 'i', label: 'Stem I', color: '#4f8fc0' }, //     blue
  { key: 'ii', label: 'Stem II', color: '#5ba6a0' }, //   teal
  { key: 'iiab', label: 'Stem IIA/B', color: '#93c9c4' }, // light teal (sibling of II)
  { key: 'iii', label: 'Stem III', color: '#b284c0' }, //  muted purple
  { key: 'at', label: 'Antiterminator', color: '#dd8a6a' }, // warm coral (the switch)
]

/** `stems[].key` → overlay color. */
export const STEM_COLORS: Record<StemKey, string> = STEM_META.reduce(
  (acc, s) => {
    acc[s.key] = s.color
    return acc
  },
  {} as Record<StemKey, string>,
)

/** Nucleotides outside any labelled stem (linkers / single strand) — quiet grey. */
export const STEM_LINKER_COLOR = '#cbd3d8'

/**
 * The TERMINATOR conformation hue (PLAN §9) — the gene-OFF hairpin, the alternative fold
 * to the antiterminator. Its own categorical axis (like {@link STEM_COLORS}, NOT part of
 * the chrome⟂data proof): a muted brick-red that reads as "the OFF switch" and stays
 * distinct from the warm-coral antiterminator and the saturated specifier reds.
 */
export const TERMINATOR_COLOR = '#b3635a'

/**
 * Per-nucleotide colors for a FULL-LENGTH TERMINATOR diagram (PLAN §9). The gene-OFF
 * conformation keeps Stem I/II/IIA-B/III and swaps the antiterminator helix for the
 * terminator hairpin: Stem I/II/IIA-B/III take their {@link STEM_COLORS} hues (the SAME hues
 * the antiterminator diagram uses, so the stems read identically across the conformation
 * toggle), the **terminator-hairpin** residues take {@link TERMINATOR_COLOR}, and everything
 * else the quiet {@link STEM_LINKER_COLOR}. The antiterminator helix (`at`) is unfolded here,
 * so it is NOT a domain (excluded). `terminatorPairs` are the hairpin's OWN base pairs (the
 * pairs new to the terminator fold — see `terminatorHairpinPairs` in `rna.ts`), NOT every
 * paired residue: passing the same hairpin pairs makes BOTH viewers colour identically, and
 * painting the hairpin LAST means that where the terminator sequesters bases the
 * antiterminator fold called a stem (the degenerate Partial leaders), the terminator wins.
 * 1-based `[lo, hi]` pairs.
 */
export function buildFullTerminatorColorMap(
  stems: { key: StemKey; start: number; end: number }[],
  terminatorPairs: [number, number][],
  length: number,
): Record<number, string> {
  const colors: Record<number, string> = {}
  for (let i = 1; i <= length; i++) colors[i] = STEM_LINKER_COLOR
  // Conserved Stem I/II/IIA-B/III first (the antiterminator helix `at` is unfolded here)…
  for (const s of stems) {
    if (s.key === 'at') continue
    const col = STEM_COLORS[s.key]
    if (!col) continue
    for (let p = Math.max(1, s.start); p <= Math.min(length, s.end); p++) colors[p] = col
  }
  // …then the terminator hairpin on top (it wins over a sequestered stem span).
  for (const [lo, hi] of terminatorPairs) {
    if (lo >= 1 && lo <= length) colors[lo] = TERMINATOR_COLOR
    if (hi >= 1 && hi <= length) colors[hi] = TERMINATOR_COLOR
  }
  return colors
}

// ── Conserved-motif overlay (a sub-region emphasis WITHIN a stem) ───────────────
/**
 * The two conserved T-box motifs emphasised inside their parent stem (PLAN §9):
 *  • `discrim` — the conserved **5′-UGGN-3′** T-box motif that base-pairs the tRNA
 *    acceptor end; it sits inside the **antiterminator** (901/901 members), so it is
 *    painted a deeper shade of `STEM_COLORS.at`.
 *  • `s1_loop` — the **specifier loop** (carrying the specifier codon), inside
 *    **Stem I**, painted a deeper shade of `STEM_COLORS.i`.
 * Drawn as a {@link featureShade} of the parent stem so the motif reads as the SAME
 * structural family, just emphasised — not a new categorical color.
 */
export type OverlayFeatureKey = 's1_loop' | 'discrim'

/** One conserved-motif span to emphasise: 1-based, inclusive, leader-relative. */
export interface OverlayFeature {
  key: OverlayFeatureKey
  start: number
  end: number
}

/** Each motif's parent stem (whose color it deepens) — the biological containment. */
export const FEATURE_PARENT: Record<OverlayFeatureKey, StemKey> = {
  s1_loop: 'i',
  discrim: 'at',
}

/** Legend metadata for the motif overlay (label + the shade swatch it draws). */
export const FEATURE_OVERLAY_META: { key: OverlayFeatureKey; label: string; color: string }[] = [
  { key: 's1_loop', label: 'Specifier loop', color: featureShade(STEM_COLORS.i) },
  { key: 'discrim', label: 'T-box (5′-UGGN-3′)', color: featureShade(STEM_COLORS.at) },
]

/**
 * Per-nucleotide stem-overlay colors for a member's structure: a 1-based map
 * `position → hex`, every position defaulting to {@link STEM_LINKER_COLOR} and
 * each stem's `[start, end]` (1-based, inclusive, clamped to `length`) painted its
 * {@link STEM_COLORS} hue. The SINGLE source of this mapping — reused by BOTH the
 * fornac overlay and the R2DT diagram so the two viewers color identically
 * (PLAN §9). Later stems win on the (non-occurring) overlap, matching 5′→3′ order.
 *
 * `features` (the conserved-motif spans) are painted LAST, each a {@link featureShade}
 * of its {@link FEATURE_PARENT} stem — BUT only over residues where that parent stem is
 * the one actually shown (after the last-wins overlap). So a motif window that the raw
 * annotation runs slightly past its parent helix (or onto a linker / a different stem)
 * is CLIPPED to its structural domain: the deeper shade is always a deeper version of
 * the visible parent stem, never a floating mislabel. Keeps the documented "specifier
 * loop inside Stem I / UGGN inside the antiterminator" containment honest.
 */
export function buildStemColorMap(
  stems: { key: StemKey; start: number; end: number }[],
  length: number,
  features: OverlayFeature[] = [],
): Record<number, string> {
  const colors: Record<number, string> = {}
  for (let i = 1; i <= length; i++) colors[i] = STEM_LINKER_COLOR
  for (const s of stems) {
    const col = STEM_COLORS[s.key]
    if (!col) continue
    for (let p = Math.max(1, s.start); p <= Math.min(length, s.end); p++) colors[p] = col
  }
  for (const f of features) {
    const parentColor = STEM_COLORS[FEATURE_PARENT[f.key]]
    const shade = featureShade(parentColor)
    for (let p = Math.max(1, f.start); p <= Math.min(length, f.end); p++) {
      if (colors[p] === parentColor) colors[p] = shade // only deepen where the parent stem shows
    }
  }
  return colors
}

/** 1-based positions where a conserved-motif overlay is actually shown — its span
 *  CLIPPED to the residues where its {@link FEATURE_PARENT} stem is the visible one
 *  (matching {@link buildStemColorMap}). These take a discrete ring in the R2DT diagram
 *  (the shaded fill reads as "deeper stem"; the ring marks the motif as distinct). */
export function featurePositions(
  stems: { key: StemKey; start: number; end: number }[],
  length: number,
  features: OverlayFeature[],
): Set<number> {
  const base = buildStemColorMap(stems, length) // stem-only colors (no feature recursion)
  const set = new Set<number>()
  for (const f of features) {
    const parentColor = STEM_COLORS[FEATURE_PARENT[f.key]]
    for (let p = Math.max(1, f.start); p <= Math.min(length, f.end); p++) {
      if (base[p] === parentColor) set.add(p)
    }
  }
  return set
}

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

/**
 * Regulated-`func_class` CHROME colors (§8.2) — a MUTED categorical palette: five
 * distinct hues so the function classes are readable at a glance (bars, ORF arrow,
 * Sankey nodes), but deliberately LOW-saturation (S ≤ ~0.45) so they stay clear of
 * the vivid 20-AA specifier data palette (S ≥ 0.64) and can never read as a data
 * swatch. They remain part of the chrome⟂data proof below — `assertChromeDataDisjoint`
 * gates them less-saturated than every specifier (a saturation, not a hue, margin),
 * so the func-class encoding is still chrome, just no longer grey. Single source of
 * truth: the architecture diagram's downstream-ORF arrow (S2.1) and the operon
 * breakdown's bars + Sankey func_class nodes (S2.5) both read from here, so the same
 * function class is the same color everywhere. Lightness splits the set into "dark"
 * (white ORF label: aaRS / biosynthesis / oxidoreductase) and "light" (ink label:
 * transporter / unknown) — see ArchitectureDiagram `orfDark`.
 */
export const FUNC_CLASS_SHADE: Record<FuncClass, string> = {
  aaRS: '#4767ad', // muted blue
  biosynthesis: '#34685f', // deep muted teal-green (the most common class)
  transporter: '#cdb07a', // muted sand/gold (light)
  oxidoreductase: '#8a5285', // muted plum
  unknown: '#c4ccd6', // quiet cool grey (light)
}

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

/**
 * HSL (hue degrees, s/l in [0,1]) → `#rrggbb`. The inverse of {@link hexToHsl};
 * used by {@link featureShade} to deepen a stem color while keeping its hue.
 */
export function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const hx = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hx(r)}${hx(g)}${hx(b)}`
}

/**
 * A deeper, more-saturated shade of a stem color — same hue, so it reads as the SAME
 * structural family (PLAN §9 conserved-motif overlay). Used to emphasise the UGGN
 * motif inside the antiterminator and the specifier loop inside Stem I, in both the
 * R2DT diagram and the fornac overlay, without introducing a new categorical color.
 */
export function featureShade(hex: string): string {
  const { h, s, l } = hexToHsl(hex)
  return hslToHex(h, Math.min(1, s * 1.28 + 0.06), Math.max(0, l * 0.62))
}

// ── WCAG luminance / contrast (pure) — keeps DATA labels legible on their surface ──
function channelLuminance(c8: number): number {
  const c = c8 / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance of a hex color (0 = black … 1 = white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG contrast ratio between two hex colors (1 … 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * The specifier color darkened just enough that the amino-acid CODE drawn in it clears
 * WCAG AA (≥ 4.5:1) on a WHITE chip while keeping its hue, so the code still reads as
 * its specifier (the architecture figure, PLAN §9①). Pure + deterministic: it starts
 * from the {@link featureShade} (deeper, more-saturated, same hue) and steps lightness
 * down in fixed increments until the contrast target is met (checked on the rounded
 * 8-bit hex, so the rendered color is guaranteed). Several pale specifiers (GLY 2.70,
 * VAL 2.82, ALA 4.09, MET 4.46 as a plain featureShade) fail 4.5:1, so this is the color
 * used ONLY for the AA text + the Stem-I loop outline — NEVER for the body fill (which
 * stays the raw specifier `aaColor`, the data-colour oracle the tests read).
 */
export function aaCodeColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex)
  const sat = Math.min(1, s * 1.28 + 0.06) // match featureShade's saturation bump
  let lit = Math.max(0, l * 0.62) // featureShade's lightness; darken further as needed
  for (let i = 0; i < 60; i++) {
    const cand = hslToHex(h, sat, lit)
    if (contrastRatio(cand, '#ffffff') >= 4.6 || lit <= 0) return cand
    lit = Math.max(0, lit - 0.015)
  }
  return hslToHex(h, sat, 0)
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

// ── /cloud encoding axes (separate categorical scales; NOT in the chrome⟂data proof) ──
//
// The 3D similarity cloud (`/cloud`) lets a user color points by several per-locus
// metadata axes beyond the primary specifier hue. Each is its OWN categorical scale —
// like {@link PHYLUM_COLORS} and {@link STEM_COLORS} — kept deliberately muted (a cool/
// warm chrome register) so it never competes with the saturated 20-AA specifier
// palette. These axes are intentionally NOT part of `assertChromeDataDisjoint()` below
// (only the brand accents + neutral/func chrome are): they are alternative DATA
// encodings, shown one at a time, never alongside the specifier hues. Each 2-class axis
// uses a blue↔amber split (the most colour-vision-deficiency-safe pairing); the `/cloud`
// view never relies on colour alone for emphasis (it also varies point size).

/**
 * `func_class` colors for the cloud's "Function" preset. Aliased to the existing
 * {@link FUNC_CLASS_SHADE} so a function class is the SAME color here as on the
 * architecture diagram and operon breakdown (the app-wide single-source invariant) —
 * the cloud does not introduce a second, divergent func_class palette.
 */
export const FUNC_CLASS_COLORS: Record<FuncClass, string> = FUNC_CLASS_SHADE

/** Regulation-mode colors (cloud "type" axis): a muted steel-blue ↔ amber split. */
export const TYPE_COLORS: Record<string, string> = {
  Transcriptional: '#4f87a6', // muted steel blue
  Translational: '#cf9350', // muted amber
}

/** Locus-confidence colors (cloud "QC / confidence" preset): confident teal ↔ flagged amber. */
export const CONFIDENCE_COLORS: Record<string, string> = {
  high: '#4a9d8e', // muted teal — confident
  low: '#d98c4a', // muted orange — kept-and-flagged
}

/** Neutral fallback for an unknown categorical value on a cloud encoding axis. */
export const CLOUD_NEUTRAL_COLOR = '#9aa6b2' // cool grey, distinct from the `?`-specifier grey

/** ΔΔG diverging-ramp domain (kcal/mol): clamped; more-negative = stronger switch. */
export const DDG_DOMAIN: readonly [number, number] = [-25, -5]

/** ΔΔG diverging-ramp stops: blue (strong/very-negative) → neutral → red (weak/positive). */
export const DDG_STOPS = {
  strong: '#2c6fb0', // blue — strongest switch (ΔΔG ≤ −25)
  neutral: '#e7ebf1', // cool light grey — mid (harmonizes with the cool instrument paper)
  weak: '#c0563b', // red — weakest / positive switch (ΔΔG ≥ −5)
} as const

/** Linear RGB interpolation between two hex colors at `t ∈ [0,1]` → `#rrggbb`. */
function lerpHex(a: string, b: string, t: number): string {
  const x = hexToRgb(a)
  const y = hexToRgb(b)
  const mix = (p: number, q: number) => Math.round(p + (q - p) * t)
  const hx = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hx(mix(x.r, y.r))}${hx(mix(x.g, y.g))}${hx(mix(x.b, y.b))}`
}

/**
 * Continuous diverging color for a member's ΔΔG (the antiterminator↔terminator switch
 * strength; PLAN §9①). The value is clamped to {@link DDG_DOMAIN} and mapped
 * blue→neutral→red, with the BLUE end at the most-negative (strongest-switch) value and
 * the RED end at the weakest/positive — the cloud's "Switch strength" preset reads
 * this. A null ΔΔG (codon-less partials etc.) returns the neutral unknown grey, matching
 * how the specifier axis treats `?`.
 */
export function ddgDivergingColor(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return UNKNOWN_SPECIFIER_COLOR
  const [lo, hi] = DDG_DOMAIN
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo))) // 0 at lo(−25)=blue, 1 at hi(−5)=red
  return t <= 0.5
    ? lerpHex(DDG_STOPS.strong, DDG_STOPS.neutral, t / 0.5)
    : lerpHex(DDG_STOPS.neutral, DDG_STOPS.weak, (t - 0.5) / 0.5)
}

// ── Chrome ⟂ data disjointness proof (§8.2 invariant; S1.2 exit criterion) ──────

/**
 * The chromatic BRAND accents (teals). Separated from data by HUE — this is the
 * §8.2 "brand accent chosen OUTSIDE the 20-AA hue range" requirement.
 */
const BRAND_ACCENTS: string[] = [brand.accent, brand.accentStrong, brand.accentSubtle, brand.onDark]

/**
 * The low-saturation chrome set: the ink/slate neutral base PLUS the muted
 * func_class categorical hues. Every member is separated from data by being less
 * saturated than ANY specifier — the §8.2 "neutral/muted base stays clear of the
 * chromatic data palette". (The func_class colors carry hue but, capped well below
 * the least-saturated specifier, still read as chrome rather than a data swatch.)
 */
const CHROME_NEUTRALS: string[] = [
  neutral.ink,
  neutral.text,
  neutral.muted,
  neutral.hairline,
  neutral.hairlineStrong,
  neutral.surface,
  neutral.surfaceRaised,
  neutral.surfaceSubtle,
  neutral.page,
  // The muted func_class palette (S2.5) is chrome too — prove it disjoint from data
  // alongside the brand/neutral chrome, so a future edit can't drift a func_class
  // color up into specifier saturation without tripping the dev-time assertion.
  ...Object.values(FUNC_CLASS_SHADE),
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
