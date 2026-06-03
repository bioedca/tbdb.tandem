// Regulated-operon model (PLAN §9③, §5.3) — pure, framework-agnostic logic behind
// OperonBreakdown. Two views over the same locus set:
//
//   ① a func_class × func_source matrix → stacked bars (one bar per `func_class`,
//      split by the two-tier classifier's provenance: EC-backed / text-inferred /
//      no-annotation; §5.3), and
//   ② a specifier → func_class Sankey exposing the observed couplings (TRP→
//      biosynthesis via trpE/anthranilate; THR→aaRS via threonyl-tRNA ligase;
//      ILE/LEU/ILE;LEU→biosynthesis branched-chain; §9③).
//
// Both are RESPONDERS in the dashboard (PLAN §9 centerpiece; S2.6): the bar/chip
// COUNTS and the Sankey flows come from the cross-filtered selection so they narrow
// live, while the bar's func_class AXIS comes from the full set so its layout stays
// stable. Every association here is an OBSERVED EXTANT co-occurrence — no
// evolutionary direction is modeled or implied (PLAN §6/§13 no-polarity).
//
// Kept pure (no Svelte, no Plotly) for the S2.7 unit tests (PLAN §10.2).

import {
  aaColor,
  FUNC_CLASS_SHADE,
  splitSpecifier,
  UNKNOWN_SPECIFIER_COLOR,
  withAlpha,
} from './color'
import type { FuncClass, FuncSource, Locus, RegulationType } from './data/types'

/** Specifier sentinel for the 20 locus-level unknowns (PLAN §3.1). */
export const SPEC_UNKNOWN = '?'

/** func_source tiers in display order — solid (EC) → hatched (text) → dotted
 *  (none); matches §5.3's two-tier classifier provenance. */
export const FUNC_SOURCE_TIERS: FuncSource[] = ['EC', 'text', 'none']

/** Regulation modes in a fixed display order (PLAN §2.2; shown as chips, §9③). */
export const REGULATION_TYPES: RegulationType[] = ['Transcriptional', 'Translational']

// ── ① func_class × func_source → stacked bars ───────────────────────────────────

export interface OperonBars {
  /** Bar axis: distinct `func_class`, frequency-descending (stable layout). */
  funcClasses: FuncClass[]
  /** Per-tier counts, indexed parallel to `funcClasses` (from the count set). */
  counts: Record<FuncSource, number[]>
  /** Total loci per `func_class` (the stacked bar height). */
  totals: number[]
  /** Largest bar total (for an axis hint). */
  maxTotal: number
}

/** Distinct values frequency-descending, alphabetical only as a stable tiebreak. */
function freqDesc<T extends string>(values: T[]): T[] {
  const freq = new Map<T, number>()
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1)
  return [...freq.keys()].sort(
    (a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0) || (a < b ? -1 : 1),
  )
}

/**
 * Build the func_class stacked-bar model. `axisLoci` (the full set) fixes the bar
 * order so the layout never reshapes under filtering; `countLoci` (the cross-
 * filtered selection) fills the per-tier counts so the bars narrow live (PLAN §9;
 * S2.6).
 */
export function buildOperonBars(axisLoci: Locus[], countLoci: Locus[]): OperonBars {
  const funcClasses = freqDesc(axisLoci.map((l) => l.func_class))
  const index = new Map(funcClasses.map((fc, i) => [fc, i]))

  const counts: Record<FuncSource, number[]> = {
    EC: funcClasses.map(() => 0),
    text: funcClasses.map(() => 0),
    none: funcClasses.map(() => 0),
  }
  for (const l of countLoci) {
    const i = index.get(l.func_class)
    if (i === undefined) continue
    counts[l.func_source][i] += 1
  }

  const totals = funcClasses.map((_, i) => counts.EC[i] + counts.text[i] + counts.none[i])
  return { funcClasses, counts, totals, maxTotal: Math.max(0, ...totals) }
}

// ── ② specifier → func_class Sankey ─────────────────────────────────────────────

export interface SankeyNode {
  label: string
  color: string
  kind: 'specifier' | 'func_class'
}

export interface SankeyLink {
  source: number
  target: number
  value: number
  color: string
}

export interface SankeyModel {
  nodes: SankeyNode[]
  links: SankeyLink[]
}

/** A locus's specifier key (`?` sentinel for the locus-level unknowns). */
export function specifierKey(l: Locus): string {
  return l.specifier_aa ?? SPEC_UNKNOWN
}

/**
 * Node/link color for a specifier — the DATA palette (§8.2), so a specifier reads
 * the same hue here as on every other panel. Mixed loci (`ILE;LEU`) take their
 * FIRST constituent's hue (the §9② bar convention); `?`/unknown → neutral grey.
 */
export function specifierNodeColor(spec: string | null): string {
  const tokens = splitSpecifier(spec)
  if (tokens.length === 0) return UNKNOWN_SPECIFIER_COLOR
  return aaColor(tokens[0])
}

/**
 * Build the specifier→func_class Sankey from a locus set (the cross-filtered
 * selection, so it narrows live; PLAN §9). Specifier nodes (left) are ordered by
 * flow frequency with `?` last; func_class nodes (right) by frequency. A link is
 * one (specifier, func_class) co-occurrence count > 0. Nodes with no surviving
 * link are dropped so a filtered Sankey shows no dangling stubs. The flow encodes
 * an OBSERVED association only — never a temporal/evolutionary direction (§6).
 */
export function buildSankey(loci: Locus[]): SankeyModel {
  // Tally (specifier, func_class) co-occurrences as a NESTED map (specifier →
  // func_class → count), plus per-axis frequencies. A nested map keeps each value
  // intact — there is no delimited string key to build and re-parse — so the link
  // build can never mis-attribute a flow regardless of the value vocabulary.
  const pairCount = new Map<string, Map<FuncClass, number>>()
  const specFreq = new Map<string, number>()
  const fcFreq = new Map<FuncClass, number>()
  for (const l of loci) {
    const s = specifierKey(l)
    const fc = l.func_class
    let inner = pairCount.get(s)
    if (!inner) {
      inner = new Map<FuncClass, number>()
      pairCount.set(s, inner)
    }
    inner.set(fc, (inner.get(fc) ?? 0) + 1)
    specFreq.set(s, (specFreq.get(s) ?? 0) + 1)
    fcFreq.set(fc, (fcFreq.get(fc) ?? 0) + 1)
  }

  const specs = [...specFreq.keys()].sort((a, b) => {
    if (a === SPEC_UNKNOWN) return 1
    if (b === SPEC_UNKNOWN) return -1
    return (specFreq.get(b) ?? 0) - (specFreq.get(a) ?? 0) || (a < b ? -1 : 1)
  })
  const fcs = [...fcFreq.keys()].sort(
    (a, b) => (fcFreq.get(b) ?? 0) - (fcFreq.get(a) ?? 0) || (a < b ? -1 : 1),
  )

  // Specifier nodes first, then func_class nodes (a bipartite, left→right layout).
  const nodes: SankeyNode[] = [
    ...specs.map((s) => ({ label: s, color: specifierNodeColor(s), kind: 'specifier' as const })),
    ...fcs.map((fc) => ({ label: fc, color: FUNC_CLASS_SHADE[fc], kind: 'func_class' as const })),
  ]
  const specIndex = new Map(specs.map((s, i) => [s, i]))
  const fcIndex = new Map(fcs.map((fc, i) => [fc, specs.length + i]))

  const links: SankeyLink[] = []
  for (const [s, inner] of pairCount) {
    const source = specIndex.get(s)
    if (source === undefined) continue
    const color = withAlpha(specifierNodeColor(s), 0.35)
    for (const [fc, value] of inner) {
      const target = fcIndex.get(fc)
      if (target === undefined) continue
      links.push({ source, target, value, color })
    }
  }
  // Stable, readable order: largest flows first.
  links.sort((a, b) => b.value - a.value)
  return { nodes, links }
}

// ── ③ regulation type chips (PLAN §9③ — chip, not a toggle) ──────────────────────

export interface TypeCount {
  type: RegulationType
  count: number
}

/** Count loci by regulation `type`, in the fixed `REGULATION_TYPES` order. */
export function typeCounts(loci: Locus[]): TypeCount[] {
  const freq = new Map<RegulationType, number>()
  for (const l of loci) freq.set(l.type, (freq.get(l.type) ?? 0) + 1)
  return REGULATION_TYPES.map((type) => ({ type, count: freq.get(type) ?? 0 }))
}
