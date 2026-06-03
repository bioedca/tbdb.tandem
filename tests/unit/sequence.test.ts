// Unit: the feature-highlighted leader segmentation (PLAN §10.2, §9 detail flow).
// Pure, no DOM. Pins the three orthogonal channels (fill / bottom-rule / dashed
// underline), the within-channel precedence (codon > s1, term > discrim), full
// contiguous coverage of the leader, and the out-of-range window DROP that matches
// the build's `seq[lo-1:hi]` guard (the T0299.m2 corrupt-window case).
import { describe, expect, test } from 'vitest'
import type { FeatureName, Member, Span } from '../../src/lib/data/types'
import {
  buildSequenceSegments,
  featureSpans,
  presentFeatures,
  type SeqSegment,
} from '../../src/lib/sequence'
import { makeMember } from '../fixtures'

const MISSING: Span = [0, 0]

function seqMember(seq: string, window: Partial<Record<FeatureName, Span>>): Member {
  const w: Record<FeatureName, Span> = {
    tbox: MISSING, s1: MISSING, s1_loop: MISSING, codon: MISSING,
    antiterm: MISSING, term: MISSING, discrim: MISSING, ...window,
  }
  return makeMember({
    member_id: 'S.m1',
    tandem_id: 'S',
    coords: { leader: [1, seq.length], window: w, genome: w },
    fasta_sequence: seq,
  })
}

/** The (fill, rule, underline) styling at a 1-based leader position. */
function styleAt(segs: SeqSegment[], pos: number) {
  const s = segs.find((x) => pos >= x.start && pos <= x.end)!
  return { fill: s.fill, rule: s.rule, underline: s.underline }
}

const SEQ = 'ACGTACGTACGTACGTACGTACGTACGTAC' // length 30
const member = seqMember(SEQ, {
  s1: [3, 12],
  codon: [5, 7],
  antiterm: [10, 20],
  term: [22, 26],
  discrim: [28, 29],
})

describe('featureSpans / presentFeatures', () => {
  test('returns every in-range window in canonical order', () => {
    expect(featureSpans(member)).toEqual({
      s1: [3, 12], codon: [5, 7], antiterm: [10, 20], term: [22, 26], discrim: [28, 29],
    })
    expect(presentFeatures(member)).toEqual(['s1', 'codon', 'antiterm', 'term', 'discrim'])
  })

  test('a window running off the leader 3′ end is DROPPED (T0299.m2 corrupt term)', () => {
    const corrupt = seqMember('A'.repeat(143), { codon: [10, 12], term: [153, 143] })
    const spans = featureSpans(corrupt)
    expect(spans.term).toBeUndefined()
    expect(spans.codon).toEqual([10, 12])
    expect(presentFeatures(corrupt)).toEqual(['codon'])
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

  test('fill precedence: codon overrides the surrounding Stem-I', () => {
    expect(styleAt(segs, 3).fill).toBe('s1') // s1 before the codon
    expect(styleAt(segs, 5).fill).toBe('codon') // codon ⊂ s1 → codon wins
    expect(styleAt(segs, 8).fill).toBe('s1') // s1 after the codon
    expect(styleAt(segs, 1).fill).toBeNull()
  })

  test('rule precedence: term over discriminator; underline is its own channel', () => {
    expect(styleAt(segs, 24).rule).toBe('term')
    expect(styleAt(segs, 28).rule).toBe('discrim')
    expect(styleAt(segs, 15).underline).toBe('antiterm')
  })

  test('overlapping channels coexist (s1 fill + antiterm underline at pos 10–12)', () => {
    expect(styleAt(segs, 11)).toEqual({ fill: 's1', rule: null, underline: 'antiterm' })
  })

  test('an empty leader yields no segments', () => {
    expect(buildSequenceSegments(seqMember('', {}))).toEqual([])
  })
})
