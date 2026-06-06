// tbdb.tandem similarity-cloud color/size encodings + presets (PLAN /cloud §4.3) —
// pure, framework-agnostic, unit-tested. Reads the project's single color authority
// (`color.ts`); never hard-codes a hex (PLAN §8.2 / working agreement §10).
//
// The cloud exposes several DATA encodings beyond the primary specifier hue, but
// curates them into a few vetted PRESETS (the default control) rather than a free
// color×size matrix. An "Advanced" disclosure in the view lets a power user pick
// color + size independently; both paths resolve through `pointColor` / `sizeFactor`
// here.

import {
  aaColor,
  CLOUD_NEUTRAL_COLOR,
  CONFIDENCE_COLORS,
  ddgDivergingColor,
  FUNC_CLASS_COLORS,
  phylumColor,
  splitSpecifier,
  TYPE_COLORS,
  UNKNOWN_SPECIFIER_COLOR,
} from '../color'
import { isNonFirmicutes } from '../tree'
import type { CloudPoint, ColorMode, Preset, PresetKey, SizeMode } from './types'

/** The encoding-relevant subset of a render point (raw element or aggregated locus). */
type Encodable = Pick<CloudPoint, 'spec' | 'phylum' | 'func' | 'type' | 'conf' | 'ddg' | 'ident'>

/**
 * Point color for a given encoding axis (§4.3).
 *   • `specifier` — the first constituent specifier hue (mixed → first; `?`/null →
 *     neutral grey). Mirrors `specifierFill` in `tree.ts` (the S1.5 bar convention).
 *   • `ddg` — the continuous diverging switch-strength ramp (null → unknown grey).
 *   • `func | conf | type | phylum` — categorical lookups; unknown → neutral.
 */
export function pointColor(point: Encodable, mode: ColorMode): string {
  switch (mode) {
    case 'specifier': {
      const parts = splitSpecifier(point.spec)
      return parts.length > 0 ? aaColor(parts[0]) : UNKNOWN_SPECIFIER_COLOR
    }
    case 'ddg':
      return ddgDivergingColor(point.ddg)
    case 'func':
      return (point.func && FUNC_CLASS_COLORS[point.func]) || CLOUD_NEUTRAL_COLOR
    case 'conf':
      return (point.conf && CONFIDENCE_COLORS[point.conf]) || CLOUD_NEUTRAL_COLOR
    case 'type':
      return (point.type && TYPE_COLORS[point.type]) || CLOUD_NEUTRAL_COLOR
    case 'phylum':
      return phylumColor(point.phylum)
    default:
      return CLOUD_NEUTRAL_COLOR
  }
}

// ── Size encodings (documented multiplier ranges) ────────────────────────────────
//
// `sizeFactor` returns a unitless multiplier the renderer scales the base sprite by.
// Every mode lands in roughly [SIZE_MIN, SIZE_MAX]; non-Firmicutes get a bump (a
// larger one under the "highlight non-Firmicutes" toggle), mirroring the emphasis in
// `PhyloTree.nodeStyler` (and never relying on color alone — PLAN §6.6 a11y).

/** Smallest size multiplier a data-driven mode emits. */
export const SIZE_MIN = 0.7
/** Largest size multiplier a data-driven mode emits. */
export const SIZE_MAX = 2.0
/** |ΔΔG| (kcal/mol) at which `absDdg` saturates to SIZE_MAX. */
export const ABS_DDG_SATURATION = 25
/** Non-Firmicutes size bump (and the stronger bump when the highlight toggle is on). */
export const NON_FIRMICUTES_BUMP = 1.25
export const NON_FIRMICUTES_HIGHLIGHT_BUMP = 1.8

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
const lerp = (t: number): number => SIZE_MIN + (SIZE_MAX - SIZE_MIN) * clamp01(t)

/** Options for {@link sizeFactor}: the non-Firmicutes highlight toggle (§6.3). */
export interface SizeOptions {
  highlightNonFirmicutes?: boolean
}

/**
 * Size multiplier for a point under a size axis (§4.3), with the non-Firmicutes bump.
 *   • `uniform` — 1.0 (then bumped if a non-Firmicutes point).
 *   • `absDdg` — |ΔΔG| → [SIZE_MIN, SIZE_MAX] over [0, ABS_DDG_SATURATION]; null → SIZE_MIN.
 *   • `divergence` — (1 − identity) → [SIZE_MIN, SIZE_MAX]; null identity → midpoint 1.0.
 */
export function sizeFactor(point: Encodable, mode: SizeMode, opts: SizeOptions = {}): number {
  let base: number
  switch (mode) {
    case 'absDdg':
      base = point.ddg == null ? SIZE_MIN : lerp(Math.abs(point.ddg) / ABS_DDG_SATURATION)
      break
    case 'divergence':
      // identity is a 0–100 percentage; divergence = 1 − identity/100.
      base = point.ident == null ? 1.0 : lerp(1 - point.ident / 100)
      break
    case 'uniform':
    default:
      base = 1.0
      break
  }
  if (isNonFirmicutes(point.phylum)) {
    base *= opts.highlightNonFirmicutes ? NON_FIRMICUTES_HIGHLIGHT_BUMP : NON_FIRMICUTES_BUMP
  }
  return base
}

// ── Presets — the curated, default-exposed encodings (§4.3) ──────────────────────

/** The five vetted presets (the primary control); "Advanced" sets color/size freely. */
export const PRESETS: Record<PresetKey, Preset> = {
  specifier: {
    key: 'specifier',
    label: 'Specifier',
    color: 'specifier',
    size: 'uniform',
    blurb: 'Color by the amino acid the riboswitch senses (the primary axis).',
  },
  switch: {
    key: 'switch',
    label: 'Switch strength',
    color: 'ddg',
    size: 'absDdg',
    blurb: 'Color + size by ΔΔG: how strongly the element favours one conformation.',
  },
  function: {
    key: 'function',
    label: 'Function',
    color: 'func',
    size: 'absDdg',
    blurb: 'Color by the regulated downstream function class; size by |ΔΔG|.',
  },
  qc: {
    key: 'qc',
    label: 'QC / confidence',
    color: 'conf',
    size: 'divergence',
    blurb: 'Color by locus confidence; size by intra-locus divergence (1 − identity).',
  },
  taxonomy: {
    key: 'taxonomy',
    label: 'Taxonomy',
    color: 'phylum',
    size: 'uniform',
    emphasizeNonFirmicutes: true,
    blurb: 'Color by phylum; the non-Firmicutes minority is emphasized.',
  },
}

/** Presets in display order (Specifier first / default). */
export const PRESET_ORDER: PresetKey[] = ['specifier', 'switch', 'function', 'qc', 'taxonomy']

/** Resolve a point's `{ color, size }` under an explicit color+size selection. */
export function resolveEncoding(
  point: Encodable,
  color: ColorMode,
  size: SizeMode,
  opts: SizeOptions = {},
): { color: string; size: number } {
  return { color: pointColor(point, color), size: sizeFactor(point, size, opts) }
}
