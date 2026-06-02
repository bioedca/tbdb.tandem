// Specifier × phylum heatmap model (PLAN §9, §7.5, §8.2) — pure, framework-
// agnostic logic behind SpecPhylumHeatmap. A LOCUS-LEVEL count grid of
// `specifier_aa` (x) × `phylum` (y).
//
// The axes are derived from the FULL locus set so the layout stays stable, while
// the z counts come from the cross-filtered subset so the grid narrows live (PLAN
// §9 dashboard centerpiece; S2.6). Phylum is the dataset's near-monochrome context
// axis (454/470 Firmicutes; PLAN §3.1) — so the cells use the SEPARATE neutral
// phylum ramp (`color.ts`), never the 20-AA specifier palette (§8.2), and the 16
// non-Firmicutes outliers (13 named + 3 unassigned) are the signal to surface.
// The 3 unassigned-phylum loci get their own `unassigned` row so the grid
// represents all 470 loci. Kept pure for the S2.7 unit tests (PLAN §10.2).

import type { Locus } from './data/types'

/** Specifier sentinel for the 20 locus-level unknowns (PLAN §3.1). */
export const SPEC_UNKNOWN = '?'

/** Row label for the 3 unassigned-phylum loci (null `phylum`; PLAN §3.1). */
export const PHYLUM_UNASSIGNED = 'unassigned'

export interface SpecPhylumGrid {
  /** Specifier axis (x): distinct locus `specifier_aa`, frequency-desc, `?` last. */
  specifiers: string[]
  /** Phylum axis (y): distinct phyla, frequency-desc, `unassigned` last. */
  phyla: string[]
  /** Count grid `z[phylumRow][specifierCol]`; `null` for an empty cell (blank). */
  z: (number | null)[][]
  /** Per-cell count text (`''` when empty) for the in-cell labels. */
  text: string[][]
  /** Largest cell count (drives the ramp cap). */
  max: number
}

/** A locus's specifier axis key (`specifier_aa`, `?` for the unknown sentinel). */
export function specifierKey(l: Locus): string {
  return l.specifier_aa ?? SPEC_UNKNOWN
}

/** A locus's phylum axis key (`unassigned` for the null-phylum loci). */
export function phylumKey(l: Locus): string {
  return l.phylum ?? PHYLUM_UNASSIGNED
}

/** Distinct values frequency-descending, with `sentinel` forced last; alphabetical
 *  only as a stable tiebreak among equal-frequency values. */
function freqOrder(values: string[], sentinel: string): string[] {
  const freq = new Map<string, number>()
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1)
  return [...freq.keys()].sort((a, b) => {
    if (a === sentinel) return 1
    if (b === sentinel) return -1
    return (freq.get(b) ?? 0) - (freq.get(a) ?? 0) || (a < b ? -1 : 1)
  })
}

/**
 * Build the specifier×phylum count grid. `axisLoci` (the full set) fixes the axes
 * so the layout never reshapes under filtering; `countLoci` (the cross-filtered
 * selection) fills the z counts so the panel narrows live (PLAN §9; S2.6). A cell
 * is `null` (blank) when no `countLoci` locus falls in it.
 */
export function buildSpecPhylumHeatmap(
  axisLoci: Locus[],
  countLoci: Locus[],
): SpecPhylumGrid {
  const specifiers = freqOrder(axisLoci.map(specifierKey), SPEC_UNKNOWN)
  const phyla = freqOrder(axisLoci.map(phylumKey), PHYLUM_UNASSIGNED)
  const specIndex = new Map(specifiers.map((s, i) => [s, i]))
  const phyIndex = new Map(phyla.map((p, i) => [p, i]))

  const counts: number[][] = phyla.map(() => specifiers.map(() => 0))
  for (const l of countLoci) {
    const i = phyIndex.get(phylumKey(l))
    const j = specIndex.get(specifierKey(l))
    // A selected locus is a subset of the axis set, so both indices resolve; the
    // guard only matters if a caller passes counts outside the axis vocabulary.
    if (i === undefined || j === undefined) continue
    counts[i][j] += 1
  }

  let max = 0
  const z: (number | null)[][] = phyla.map(() => specifiers.map(() => null))
  const text: string[][] = counts.map((row, i) =>
    row.map((c, j) => {
      if (c <= 0) return ''
      z[i][j] = c
      if (c > max) max = c
      return String(c)
    }),
  )

  return { specifiers, phyla, z, text, max }
}
