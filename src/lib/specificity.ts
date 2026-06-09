// Specificity overview models (PLAN §9②) — pure, framework-agnostic logic behind
// the SpecificityChart: the locus-level specifier bar, the SYMMETRIC element-pair
// matrix, the cell→facet cross-filter mapping, and the three-element locus list.
//
// The matrix is built from each pair's per-element specifiers in transcript-5′
// ORDINAL order (from `members.json`) — NEVER the alphabetized locus
// `specifier_aa`, which both alpha-sorts AND collapses same-specifier pairs
// (TRP;TRP → TRP), so it cannot recover the diagonal (PLAN §9②, §3.1). Kept pure
// so the matrix folding / bar model can be unit-tested at S1.6 (PLAN §10.2).

import { aaColor, splitSpecifier } from './color'
import type { DistItem, Locus, Member } from './data/types'

/** The unknown / codon-less specifier sentinel (PLAN §3.1). */
export const SPEC_UNKNOWN = '?'

/** A member's element specifier — its amino acid, or `?` for a codon-less partial. */
export function memberSpec(m: Member): string {
  return m.specifier.aa ?? SPEC_UNKNOWN
}

// ── Specifier bar (locus-level; PLAN §9②) ───────────────────────────────────────

export interface BarModel {
  /** Specifier labels, most frequent first (the summary distribution order). */
  labels: string[]
  counts: number[]
  /** One data color per bar: a single AA's hue, `?`/unknown grey, a mixed locus
   *  its FIRST constituent's hue (so branched-chain mixes group visually; §8.2). */
  colors: string[]
}

/** Build the horizontal specifier-AA bar from `summary.distributions.specifier`
 *  (already frequency-descending, = the §9② bar order). */
export function barModel(dist: DistItem[]): BarModel {
  return {
    labels: dist.map((d) => d.value),
    counts: dist.map((d) => d.count),
    colors: dist.map((d) => aaColor(splitSpecifier(d.value)[0] ?? SPEC_UNKNOWN)),
  }
}

// ── Symmetric element-pair matrix (element-level; PLAN §9②) ──────────────────────

export interface SpecMatrix {
  /** Axis tick order: element specifiers by descending element frequency, `?` last. */
  axis: string[]
  /** Symmetric count grid `z[row][col]`; `null` for an empty cell (rendered blank). */
  z: (number | null)[][]
  /** Per-cell count text (`''` when empty) for in-cell labels. */
  text: string[][]
  /** Largest cell count (drives the color-scale cap). */
  max: number
  /** The ILE×LEU focal-cell count — a locked invariant (= 10; PLAN §9②). */
  ileLeu: number
}

/** The two element specifiers of a pair locus, in transcript-5′ ordinal order.
 *  `members` MUST be ordinal-sorted (the store's `membersByLocus` already is). */
export function pairSpecs(members: Member[]): [string, string] {
  return [memberSpec(members[0]), memberSpec(members[1])]
}

/**
 * Fold the pair loci (n_cores == 2) into a SYMMETRIC element-pair matrix. Cells
 * come from each pair's per-element specifiers (`members.json`, transcript-5′
 * order); both halves are filled so the grid reads symmetric and the diagonal
 * holds same-specifier pair counts. Three-element loci are excluded — surfaced by
 * `tripleEntries` instead (PLAN §9②).
 */
export function buildSpecMatrix(
  loci: Locus[],
  membersByLocus: Map<string, Member[]>,
): SpecMatrix {
  const freq = new Map<string, number>()
  const cell = new Map<string, number>() // key `min|max` (folded)

  for (const locus of loci) {
    if (locus.n_cores !== 2) continue
    const members = membersByLocus.get(locus.tandem_id)
    if (!members || members.length < 2) continue
    const [a, b] = pairSpecs(members)
    freq.set(a, (freq.get(a) ?? 0) + 1)
    freq.set(b, (freq.get(b) ?? 0) + 1)
    const key = a <= b ? `${a}|${b}` : `${b}|${a}`
    cell.set(key, (cell.get(key) ?? 0) + 1)
  }

  // Axis: element frequency descending, the `?` sentinel forced to the end,
  // alphabetical only as a stable tiebreak among equal-frequency specifiers.
  const axis = [...freq.keys()].sort((x, y) => {
    if (x === SPEC_UNKNOWN) return 1
    if (y === SPEC_UNKNOWN) return -1
    return (freq.get(y) ?? 0) - (freq.get(x) ?? 0) || (x < y ? -1 : 1)
  })

  const index = new Map(axis.map((a, i) => [a, i]))
  const n = axis.length
  const z: (number | null)[][] = Array.from({ length: n }, () => Array<number | null>(n).fill(null))
  const text: string[][] = Array.from({ length: n }, () => Array<string>(n).fill(''))
  let max = 0
  for (const [key, count] of cell) {
    const [a, b] = key.split('|')
    const i = index.get(a)
    const j = index.get(b)
    if (i === undefined || j === undefined) continue
    z[i][j] = count
    z[j][i] = count
    text[i][j] = String(count)
    text[j][i] = String(count)
    if (count > max) max = count
  }

  const ix = index.get('ILE')
  const lx = index.get('LEU')
  const ileLeu = ix !== undefined && lx !== undefined ? (z[ix][lx] ?? 0) : 0

  return { axis, z, text, max, ileLeu }
}

/**
 * Map a folded matrix cell `(a, b)` to the locus-level `specifier_aa` facet value
 * the cross-filter store uses (PLAN §7.3). The build stores a same-specifier or
 * `?`-paired locus under a SINGLE specifier (its locus value), and a mixed pair
 * under the alphabetized `A;B` — so the inverse is: collapse `?` and equal pairs
 * to one token, alpha-join the rest. The ILE×LEU cell → `"ILE;LEU"` → the 10
 * focal loci (PLAN §9 dashboard guarantee).
 */
export function cellFacetValue(a: string, b: string): string {
  if (a === SPEC_UNKNOWN && b === SPEC_UNKNOWN) return SPEC_UNKNOWN
  if (a === SPEC_UNKNOWN) return b
  if (b === SPEC_UNKNOWN) return a
  if (a === b) return a
  return [a, b].sort().join(';')
}

// ── Three-element locus list (PLAN §9②) ─────────────────────────────────────────

export interface TripleEntry {
  tandem_id: string
  organism: string | null
  phylum: string | null
  func_class: string
  confidence: string | null
  specifier_aa: string | null
  /** Per-element specifiers in transcript-5′ order. */
  specs: string[]
}

/** The 9 three-element loci, surfaced as a separate list rather than 2D cells. */
export function tripleEntries(
  loci: Locus[],
  membersByLocus: Map<string, Member[]>,
): TripleEntry[] {
  return loci
    .filter((l) => l.n_cores === 3)
    .map((l) => ({
      tandem_id: l.tandem_id,
      organism: l.organism,
      phylum: l.phylum,
      func_class: l.func_class,
      confidence: l.confidence,
      specifier_aa: l.specifier_aa,
      specs: (membersByLocus.get(l.tandem_id) ?? []).map(memberSpec),
    }))
}
