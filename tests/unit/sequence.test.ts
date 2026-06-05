// Unit: the feature-highlighted leader segmentation (PLAN §10.2, §9 detail flow).
// Pure, no DOM. Pins the rendered channels (the STEM fill — shared with the in-app
// RNA via `member.stems` + last-wins overlap — plus the codon bold marker and the
// `term > discrim` 3′ rule), full contiguous coverage of the leader, and the
// out-of-range window DROP that matches the build's `seq[lo-1:hi]` guard (the
// T0299.m2 corrupt-window case) for both the marker windows and `featureSpans`.
import { describe, expect, test } from 'vitest'
import type { FeatureName, Member, MemberStem, Span } from '../../src/lib/data/types'
import {
  buildSequenceSegments,
  featureByPosition,
  featureSpans,
  markerSpans,
  overlayFeatures,
  presentFeatures,
  presentMarkers,
  stemByPosition,
  type SeqSegment,
} from '../../src/lib/sequence'
import { makeMember } from '../fixtures'

const MISSING: Span = [0, 0]

function seqMember(
  seq: string,
  window: Partial<Record<FeatureName, Span>>,
  stems: MemberStem[] = [],
): Member {
  const w: Record<FeatureName, Span> = {
    tbox: MISSING, s1: MISSING, s1_loop: MISSING, codon: MISSING,
    antiterm: MISSING, term: MISSING, discrim: MISSING, ...window,
  }
  return makeMember({
    member_id: 'S.m1',
    tandem_id: 'S',
    coords: { leader: [1, seq.length], window: w, genome: w },
    fasta_sequence: seq,
    stems,
  })
}

/** The (stem, feature, codon, rule) styling at a 1-based leader position. */
function styleAt(segs: SeqSegment[], pos: number) {
  const s = segs.find((x) => pos >= x.start && pos <= x.end)!
  return { stem: s.stem, feature: s.feature, codon: s.codon, rule: s.rule }
}

const SEQ = 'ACGTACGTACGTACGTACGTACGTACGTAC' // length 30
const STEMS: MemberStem[] = [
  { key: 'i', start: 3, end: 12 },
  { key: 'at', start: 14, end: 20 },
]
// s1_loop ⊂ Stem-I and contains the codon; discrim (UGGN) ⊂ the antiterminator (as on
// real data — the overlay clips a motif to its parent stem).
const member = seqMember(
  SEQ,
  { s1: [3, 12], s1_loop: [4, 9], codon: [5, 7], antiterm: [14, 20], term: [22, 26], discrim: [16, 19] },
  STEMS,
)

describe('featureSpans / presentFeatures (architecture drift-guard oracle)', () => {
  test('returns every in-range window in canonical order', () => {
    expect(featureSpans(member)).toEqual({
      s1: [3, 12], codon: [5, 7], antiterm: [14, 20], term: [22, 26], discrim: [16, 19],
    })
    expect(presentFeatures(member)).toEqual(['s1', 'codon', 'antiterm', 'term', 'discrim'])
  })

  test('a window running off the leader 3′ end is DROPPED (T0299.m2 corrupt term)', () => {
    const corrupt = seqMember('A'.repeat(143), { codon: [10, 12], term: [153, 143] })
    expect(featureSpans(corrupt).term).toBeUndefined()
    expect(markerSpans(corrupt).term).toBeUndefined()
    expect(presentFeatures(corrupt)).toEqual(['codon'])
    expect(presentMarkers(corrupt)).toEqual(['codon'])
  })
})

describe('stemByPosition (mirrors the in-app RNA overlay)', () => {
  test('maps each base to its stem; linkers are null', () => {
    const sp = stemByPosition(member)
    expect(sp).toHaveLength(SEQ.length)
    expect(sp[0]).toBeNull() // pos 1 — before Stem-I
    expect(sp[2]).toBe('i') // pos 3 — Stem-I start
    expect(sp[11]).toBe('i') // pos 12 — Stem-I end
    expect(sp[12]).toBeNull() // pos 13 — linker
    expect(sp[13]).toBe('at') // pos 14 — antiterminator start
    expect(sp[20]).toBeNull() // pos 21 — linker after
  })

  test('a later stem WINS an overlap (fornac paints in array order, last write wins)', () => {
    const m = seqMember('A'.repeat(20), {}, [
      { key: 'i', start: 1, end: 12 },
      { key: 'ii', start: 8, end: 15 },
    ])
    const sp = stemByPosition(m)
    expect(sp[6]).toBe('i') // pos 7 — only Stem-I
    expect(sp[9]).toBe('ii') // pos 10 — overlap → later 'ii' wins
    expect(sp[14]).toBe('ii') // pos 15 — only 'ii'
  })

  test('out-of-range stem bounds are clamped to the leader', () => {
    const m = seqMember('ACGTAC', {}, [{ key: 'i', start: -3, end: 100 }])
    expect(stemByPosition(m)).toEqual(['i', 'i', 'i', 'i', 'i', 'i'])
  })
})

describe('overlayFeatures / featureByPosition (shared with the R2DT + fornac viewers)', () => {
  test('returns the in-range specifier-loop + UGGN spans', () => {
    expect(overlayFeatures(member)).toEqual([
      { key: 's1_loop', start: 4, end: 9 },
      { key: 'discrim', start: 16, end: 19 },
    ])
  })

  test('per-position map: disjoint motifs, linkers null', () => {
    const fp = featureByPosition(member)
    expect(fp).toHaveLength(SEQ.length)
    expect(fp[3]).toBe('s1_loop') // pos 4 — loop start
    expect(fp[8]).toBe('s1_loop') // pos 9 — loop end
    expect(fp[9]).toBeNull() // pos 10 — out of the loop
    expect(fp[15]).toBe('discrim') // pos 16 — UGGN (inside the antiterminator)
    expect(fp[18]).toBe('discrim') // pos 19 — UGGN end
    expect(fp[0]).toBeNull() // pos 1
  })

  test('a window running off the leader 3′ end is dropped (same guard as featureSpans)', () => {
    const corrupt = seqMember('A'.repeat(20), { s1_loop: [25, 30], discrim: [5, 8] })
    expect(overlayFeatures(corrupt)).toEqual([{ key: 'discrim', start: 5, end: 8 }])
  })

  test('featureByPosition CLIPS a loop that runs past Stem-I (real-data case, e.g. T0140.m1)', () => {
    // s1_loop = [1, 8] but Stem-I = [3, 12]: positions 1..2 are a pre-Stem-I linker and
    // must NOT be marked 's1_loop' (they are not inside the parent stem).
    const m = seqMember('A'.repeat(20), { s1_loop: [1, 8] }, [{ key: 'i', start: 3, end: 12 }])
    const fp = featureByPosition(m)
    expect(fp[0]).toBeNull() // pos 1 — pre-Stem-I linker, clipped out
    expect(fp[1]).toBeNull() // pos 2
    expect(fp[2]).toBe('s1_loop') // pos 3 — Stem-I starts → inside the loop's domain
    expect(fp[7]).toBe('s1_loop') // pos 8 — loop end, still in Stem-I
    expect(fp[8]).toBeNull() // pos 9 — past the loop
    // overlayFeatures still reports the raw (unclipped) span for legend presence
    expect(overlayFeatures(m)).toEqual([{ key: 's1_loop', start: 1, end: 8 }])
  })
})

describe('buildSequenceSegments', () => {
  const segs = buildSequenceSegments(member)

  test('segments tile the whole leader contiguously, text matches the slice', () => {
    let cursor = 1
    for (const s of segs) {
      expect(s.start).toBe(cursor)
      expect(s.end).toBeGreaterThanOrEqual(s.start)
      expect(s.text).toBe(SEQ.slice(s.start - 1, s.end))
      cursor = s.end + 1
    }
    expect(cursor - 1).toBe(SEQ.length)
  })

  test('stem fill follows member.stems; the codon bolds within the specifier loop', () => {
    expect(styleAt(segs, 1).stem).toBeNull() // before Stem-I
    expect(styleAt(segs, 3)).toEqual({ stem: 'i', feature: null, codon: false, rule: null }) // Stem-I, pre-loop
    expect(styleAt(segs, 4)).toEqual({ stem: 'i', feature: 's1_loop', codon: false, rule: null }) // loop, pre-codon
    expect(styleAt(segs, 5)).toEqual({ stem: 'i', feature: 's1_loop', codon: true, rule: null }) // codon ⊂ loop
    expect(styleAt(segs, 8)).toEqual({ stem: 'i', feature: 's1_loop', codon: false, rule: null }) // loop, post-codon
    expect(styleAt(segs, 10)).toEqual({ stem: 'i', feature: null, codon: false, rule: null }) // Stem-I, post-loop
    expect(styleAt(segs, 13).stem).toBeNull() // linker
    expect(styleAt(segs, 16).stem).toBe('at') // antiterminator
  })

  test('feature channel: UGGN motif is a fill (not a rule); terminator keeps its rule', () => {
    expect(styleAt(segs, 16)).toEqual({ stem: 'at', feature: 'discrim', codon: false, rule: null }) // UGGN ⊂ antiterminator
    expect(styleAt(segs, 24).rule).toBe('term') // terminator stays a bottom-rule
    expect(styleAt(segs, 24).feature).toBeNull()
  })

  test('an empty leader yields no segments', () => {
    expect(buildSequenceSegments(seqMember('', {}))).toEqual([])
  })
})
