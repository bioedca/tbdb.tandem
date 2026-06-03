// Unit: the tandem-architecture geometry (PLAN §10.2, §9①). Pure, no DOM. Pins the
// load-bearing coordinate model — strand-aware genome→biological-5′→3′ projection
// (ordinal-1 always leftmost, on BOTH strands), the body/feature boxes, the signed
// inter-element spacer (overlap on the ~6% nested loci), and the out-of-range window
// DROP aligned with the build / sequence.ts at S2.7 (the S2.2 T0299 carry-forward).
import { describe, expect, test } from 'vitest'
import type { FeatureName, Member, RegulationType, Span } from '../../src/lib/data/types'
import {
  buildArchitecture,
  ELEMENT_FEATURES,
  leaderLength,
  sharesLeader,
  validSpan,
} from '../../src/lib/architecture'
import { featureSpans } from '../../src/lib/sequence'
import { buildMemberMap } from '../../src/lib/data/load'
import type { LociFile, MembersMap } from '../../src/lib/data/types'
import { makeMember } from '../fixtures'
import lociJson from '../../public/data/loci.json'
import membersJson from '../../public/data/members.json'

const MISSING: Span = [0, 0] // sub-1 → validSpan drops it (an absent feature)

/** A member with explicit leader + per-feature windows (everything else defaulted). */
function archMember(o: {
  id: string
  ordinal: number
  aa: string | null
  leader: [number, number]
  window: Partial<Record<FeatureName, Span>>
  type?: RegulationType
}): Member {
  const window: Record<FeatureName, Span> = {
    tbox: MISSING,
    s1: MISSING,
    s1_loop: MISSING,
    codon: MISSING,
    antiterm: MISSING,
    term: MISSING,
    discrim: MISSING,
    ...o.window,
  }
  return makeMember({
    member_id: o.id,
    tandem_id: o.id.split('.')[0],
    ordinal: o.ordinal,
    specifier: { aa: o.aa, codon: null },
    type: o.type ?? 'Transcriptional',
    coords: { leader: o.leader, window, genome: window },
    fasta_sequence: 'A'.repeat(Math.abs(o.leader[1] - o.leader[0]) + 1),
  })
}

describe('validSpan', () => {
  test('coerces to ascending [lo, hi]', () => {
    expect(validSpan([5, 10])).toEqual([5, 10])
    expect(validSpan([10, 5])).toEqual([5, 10])
  })

  test('drops absent / sub-1 / null-ended windows (the build sentinels)', () => {
    expect(validSpan(undefined)).toBeNull()
    expect(validSpan([null, 5])).toBeNull()
    expect(validSpan([5, null])).toBeNull()
    expect(validSpan([0, 5])).toBeNull() // the build's [0,2] "missing" sentinel
    expect(validSpan([5, 0])).toBeNull() // the build's [...,0] sentinel
  })
})

describe('leaderLength', () => {
  test('is |end - start| + 1, strand-agnostic', () => {
    expect(leaderLength(archMember({ id: 'T.m1', ordinal: 1, aa: 'TRP', leader: [100, 279], window: {} }))).toBe(180)
    expect(leaderLength(archMember({ id: 'T.m1', ordinal: 1, aa: 'TRP', leader: [579, 400], window: {} }))).toBe(180)
  })
})

describe('buildArchitecture — plus strand, separate leaders', () => {
  const m1 = archMember({ id: 'P.m1', ordinal: 1, aa: 'TRP', leader: [100, 279], window: { tbox: [10, 50], codon: [28, 30] } })
  const m2 = archMember({ id: 'P.m2', ordinal: 2, aa: 'VAL', leader: [400, 579], window: { tbox: [10, 50], codon: [28, 30] } })
  const model = buildArchitecture([m2, m1], '+') // unsorted input → ordinal-ordered output

  test('elements come back in transcript-5′ ordinal order', () => {
    expect(model.elements.map((e) => e.ordinal)).toEqual([1, 2])
    expect(model.elements.map((e) => e.aa)).toEqual(['TRP', 'VAL'])
  })

  test('ordinal-1 (most-5′) lands leftmost; bio axis = bp from the 5′ origin', () => {
    expect(model.elements[0].bodyStart).toBe(9) // window 10 → bio 9 (gMin=100)
    expect(model.elements[0].bodyEnd).toBe(49)
    expect(model.elements[1].bodyStart).toBe(309) // leader[0]=400 → bioStart 300; +9
    expect(model.elements[0].bodyStart).toBeLessThan(model.elements[1].bodyStart)
    expect(model.span).toBe(479) // gMax 579 − gMin 100
  })

  test('only present windows become feature boxes (tbox is the body, not a glyph)', () => {
    expect(Object.keys(model.elements[0].features)).toEqual(['codon'])
    expect(model.elements[0].features.codon).toEqual({ name: 'codon', start: 27, end: 29 })
  })

  test('a clean tandem gap is a positive, non-overlapping spacer', () => {
    expect(model.spacers).toHaveLength(1)
    expect(model.spacers[0].gap).toBe(259) // 309 − 49 − 1
    expect(model.spacers[0].overlap).toBe(false)
  })
})

describe('buildArchitecture — minus strand reversal', () => {
  // On the minus strand the transcript 5′ end is the LARGER genome coord, so
  // ordinal-1's leader[0] is the largest — the projection must still place it leftmost.
  const m1 = archMember({ id: 'M.m1', ordinal: 1, aa: 'TRP', leader: [579, 400], window: { tbox: [10, 50] } })
  const m2 = archMember({ id: 'M.m2', ordinal: 2, aa: 'VAL', leader: [279, 100], window: { tbox: [10, 50] } })
  const model = buildArchitecture([m1, m2], '-')

  test('ordinal-1 is still leftmost despite the larger genome coordinate', () => {
    expect(model.elements[0].ordinal).toBe(1)
    expect(model.elements[0].bodyStart).toBe(9) // bioPos(579)=0 → +9
    expect(model.elements[1].bodyStart).toBe(309) // bioPos(279)=300 → +9
    expect(model.elements[0].bodyStart).toBeLessThan(model.elements[1].bodyStart)
    expect(model.strand).toBe('-')
  })
})

describe('buildArchitecture — overlapping (shared-leader) elements', () => {
  // The 44 collapse-recovered loci: both cores share one leader window → the bodies
  // overlap on the axis → a NEGATIVE-gap spacer rendered as an explicit overlap.
  const m1 = archMember({ id: 'S.m1', ordinal: 1, aa: 'ILE', leader: [100, 279], window: { tbox: [10, 50] } })
  const m2 = archMember({ id: 'S.m2', ordinal: 2, aa: 'LEU', leader: [100, 279], window: { tbox: [30, 70] } })
  const model = buildArchitecture([m1, m2], '+')

  test('overlapping bodies yield a negative, overlap-flagged spacer', () => {
    expect(model.spacers[0].gap).toBe(-21) // 29 − 49 − 1
    expect(model.spacers[0].overlap).toBe(true)
  })

  test('sharesLeader detects the identical leader window (and only that)', () => {
    expect(sharesLeader(m1, m2)).toBe(true)
    const sep = archMember({ id: 'X.m1', ordinal: 1, aa: 'TRP', leader: [400, 579], window: {} })
    expect(sharesLeader(m1, sep)).toBe(false)
  })
})

describe('buildArchitecture — out-of-range window DROP (S2.2 / T0299 alignment)', () => {
  // T0299.m2 carries a corrupt `term = [153, 143]` over a 143 bp leader. The build's
  // `seq[lo-1:hi]` guard drops it; sequence.ts drops it; architecture.ts now drops it
  // too (was a d3-clamped phantom glyph at the body edge before S2.7).
  test('a window whose high end exceeds the leader is dropped, in-range ones kept', () => {
    const corrupt = archMember({
      id: 'T0299.m2',
      ordinal: 2,
      aa: 'TRP',
      leader: [1, 143],
      window: { tbox: [5, 40], codon: [10, 12], term: [153, 143] },
    })
    const model = buildArchitecture([corrupt], '+')
    const el = model.elements[0]
    expect(el.features.term).toBeUndefined() // dropped, not clamped
    expect(el.features.codon).toEqual({ name: 'codon', start: 9, end: 11 })
  })

  test('the same term window IN range renders', () => {
    const ok = archMember({
      id: 'T0299.m2',
      ordinal: 2,
      aa: 'TRP',
      leader: [1, 143],
      window: { tbox: [5, 40], term: [100, 120] },
    })
    expect(buildArchitecture([ok], '+').elements[0].features.term).toEqual({ name: 'term', start: 99, end: 119 })
  })
})

// ── Real-artifact drift guard: the featBox drop matches sequence.ts + the build ───
// Confirms the S2.7 alignment over the committed 949 members: architecture's
// per-element feature presence now AGREES with sequence.ts featureSpans on the 5
// shared highlight features, and the ONLY window the new drop removes (vs the old
// d3-clamp) is T0299.m2's corrupt `term` — no legitimate feature regresses.
describe('committed members.json — featBox ⟂ out-of-range drop', () => {
  const loci = (lociJson as unknown as LociFile).loci
  const byLocus = buildMemberMap(membersJson as unknown as MembersMap)
  const SHARED = ['s1', 'codon', 'antiterm', 'term', 'discrim'] as const

  test('architecture feature presence agrees with sequence.ts on all 949 members', () => {
    let disagreements = 0
    for (const locus of loci) {
      const model = buildArchitecture(byLocus.get(locus.tandem_id)!, locus.strand)
      for (const el of model.elements) {
        const spans = featureSpans(el.member)
        for (const f of SHARED) if (f in el.features !== f in spans) disagreements++
      }
    }
    expect(disagreements).toBe(0)
  })

  test('the new drop removes exactly one window vs the old clamp: T0299.m2 term', () => {
    const dropped: string[] = []
    for (const locus of loci) {
      const model = buildArchitecture(byLocus.get(locus.tandem_id)!, locus.strand)
      for (const el of model.elements) {
        for (const f of ELEMENT_FEATURES) {
          const keptOld = validSpan(el.member.coords.window[f]) !== null // old: any valid span
          if (keptOld && !(f in el.features)) dropped.push(`${el.member.member_id}.${f}`)
        }
      }
    }
    expect(dropped).toEqual(['T0299.m2.term'])
  })
})
