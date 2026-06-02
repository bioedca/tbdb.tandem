// Tandem-architecture layout (PLAN §9①) — the pure geometry behind the signature
// view. Framework-agnostic so it is unit-tested at S2.7; `ArchitectureDiagram.svelte`
// renders the model as hand-rolled SVG (D3 only for the position scale, §7.1).
//
// COORDINATE MODEL (the load-bearing bit).
// Each member carries leader-relative `window` offsets (1-based, alwaysascending)
// and genome-projected `genome` coords per feature. The window offset already runs
// BIOLOGICAL 5′→3′ for BOTH strands (offset 1 = the leader's 5′ end; verified on
// real data, e.g. T0342 minus-strand m1 window tbox[54,233] → genome[1984287,1984108]).
// To lay every element of a locus on ONE to-scale track we project genome coords to
// a common biological axis:
//   plus  strand:  bio(g) = g - gMin      (increasing genome coord = 5′→3′)
//   minus strand:  bio(g) = gMax - g      (transcript 5′ = the LARGER genome coord)
// so ordinal-1 (most-5′) always lands leftmost and the axis is in bp from the 5′
// origin. Within a member, window offset w maps to bio = bioLeaderStart + (w − 1)
// (1 window unit = 1 bp). This handles the 44 collapse-recovered "shared-leader"
// loci (both cores in one leader window) and the ordinary separate-leader loci
// uniformly — the inter-element spacer is just the bp gap between adjacent T-box
// bodies on this axis.

import type { FeatureName, Member, Span, Strand } from './data/types'

/** The per-element features drawn as distinct glyphs (the body = `tbox`, separate). */
export const ELEMENT_FEATURES: Exclude<FeatureName, 'tbox'>[] = [
  's1',
  's1_loop',
  'codon',
  'antiterm',
  'term',
  'discrim',
]

/** A feature's extent on the shared biological axis (bp from the locus 5′ origin). */
export interface FeatureBox {
  name: FeatureName
  /** `start ≤ end`, in bp on the biological-5′→3′ axis. */
  start: number
  end: number
}

/** One element (member) laid out on the locus track, biological 5′→3′. */
export interface ElementLayout {
  member: Member
  /** Transcript-5′ ordinal (1 = most-5′). */
  ordinal: number
  /** The element's own specifier AA (null → unknown); drives the body tint. */
  aa: string | null
  /** Element body (= the `tbox` span) on the biological axis. */
  bodyStart: number
  bodyEnd: number
  /** Present, valid feature glyphs keyed by name (missing/sentinel spans dropped). */
  features: Partial<Record<FeatureName, FeatureBox>>
}

/** A dashed inter-element spacer carrying its bp gap (PLAN §9①). */
export interface SpacerLayout {
  /** Signed bp between the upstream body end and the next body start; NEGATIVE when
   *  the two T-box bodies overlap / nest on the axis (~6% of loci have overlapping
   *  leader annotations — distinct from the collapse-recovered shared-leader set). */
  gap: number
  /** Upstream element's body end (bio axis). */
  start: number
  /** Next element's body start (bio axis); `< start` when the bodies overlap. */
  end: number
  /** True iff the bodies overlap/nest (`gap < 0`) — rendered as an explicit overlap
   *  marker, never silently as a clean tandem gap. */
  overlap: boolean
}

/** The full to-scale layout of one locus's tandem architecture. */
export interface ArchitectureModel {
  strand: Strand
  /** Domain max of the biological axis (bp); the scale runs [0, span]. */
  span: number
  /** Elements in biological 5′→3′ (ordinal) order. */
  elements: ElementLayout[]
  /** Spacers between consecutive elements (length = elements.length − 1). */
  spacers: SpacerLayout[]
  /** Bio coordinate of the 3′-most element body end (anchor for the downstream ORF). */
  threePrimeEnd: number
}

/**
 * Coerce a leader-relative `window` span to an ascending `[lo, hi]`, or null when
 * the feature is absent. A null end, or a sub-1 offset (the build's 0/`[0,2]`
 * "missing" sentinel, e.g. T0003 m1's discriminator), means "not drawable".
 */
export function validSpan(span: Span | undefined): [number, number] | null {
  if (!span) return null
  const [a, b] = span
  if (a === null || b === null) return null
  if (a < 1 || b < 1) return null
  return a <= b ? [a, b] : [b, a]
}

/** Leader length in bp = |locus_end − locus_start| + 1 (gate #5: == fasta length). */
export function leaderLength(member: Member): number {
  const [a, b] = member.coords.leader
  return Math.abs(b - a) + 1
}

/**
 * Project a locus's members onto one to-scale, biological-5′→3′ track (PLAN §9①).
 * `members` need not be pre-sorted; the result is ordinal-ordered.
 */
export function buildArchitecture(members: Member[], strand: Strand): ArchitectureModel {
  const sorted = [...members].sort((a, b) => a.ordinal - b.ordinal)

  // Common biological axis from every leader endpoint (features stay within them).
  const leaderCoords: number[] = []
  for (const m of sorted) leaderCoords.push(m.coords.leader[0], m.coords.leader[1])
  const gMin = Math.min(...leaderCoords)
  const gMax = Math.max(...leaderCoords)
  const span = gMax - gMin
  const bioPos = strand === '+' ? (g: number) => g - gMin : (g: number) => gMax - g

  const elements: ElementLayout[] = sorted.map((member) => {
    // leader[0] = locus_start = the biological-5′ genome coord → leftmost on the axis.
    const bioLeaderStart = bioPos(member.coords.leader[0])
    const toBio = (offset: number) => bioLeaderStart + (offset - 1)

    const featBox = (name: FeatureName): FeatureBox | null => {
      const v = validSpan(member.coords.window[name])
      return v ? { name, start: toBio(v[0]), end: toBio(v[1]) } : null
    }

    const tbox = featBox('tbox')
    const bodyStart = tbox ? tbox.start : bioLeaderStart
    const bodyEnd = tbox ? tbox.end : bioLeaderStart + leaderLength(member) - 1

    const features: Partial<Record<FeatureName, FeatureBox>> = {}
    for (const name of ELEMENT_FEATURES) {
      const box = featBox(name)
      if (box) features[name] = box
    }

    return { member, ordinal: member.ordinal, aa: member.specifier.aa, bodyStart, bodyEnd, features }
  })

  const spacers: SpacerLayout[] = []
  for (let i = 0; i < elements.length - 1; i++) {
    const start = elements[i].bodyEnd
    const end = elements[i + 1].bodyStart
    const gap = end - start - 1
    spacers.push({ gap, start, end, overlap: gap < 0 })
  }

  const threePrimeEnd = Math.max(...elements.map((e) => e.bodyEnd))
  return { strand, span, elements, spacers, threePrimeEnd }
}

/** True iff two members occupy the identical leader window — the 44 collapse-
 *  recovered loci, whose pairwise leader %-identity saturates at 100 (PLAN §5.1;
 *  PROGRESS S0.5). The element-comparison panel flags this so 100% is not misread
 *  as core-vs-core divergence. */
export function sharesLeader(a: Member, b: Member): boolean {
  return a.coords.leader[0] === b.coords.leader[0] && a.coords.leader[1] === b.coords.leader[1]
}
