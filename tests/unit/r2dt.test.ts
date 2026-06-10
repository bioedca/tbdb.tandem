// Unit: R2DT layout helpers (PLAN §9) + the shared stem-color map that BOTH the
// R2DT diagram and the fornac overlay paint from (so the two viewers color
// identically). Pure functions, no DOM / no fetch.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildStemColorMap, STEM_COLORS, STEM_LINKER_COLOR } from '../../src/lib/color'
import {
  diagramViewBox,
  nucleotideSpacing,
  R2DT_LOOP_STRAND_SEP_RATIO,
  R2DT_MIN_LOOP_CLEARANCE_RATIO,
  withReadableR2dtLayout,
  withReadableStemLoops,
  withStemIToIISpacer,
  type R2dtDiagram,
} from '../../src/lib/r2dt'
import { terminatorHairpinPairs } from '../../src/lib/rna'
import type { MembersMap } from '../../src/lib/data/types'
import membersJson from '../../public/data/members.json'
import t0060m1Json from '../../public/data/r2dt/T0060.m1.json'
import t0185m2Json from '../../public/data/r2dt/T0185.m2.json'
import t0185m2TermJson from '../../public/data/r2dt/term/T0185.m2.json'

describe('buildStemColorMap', () => {
  test('paints each stem its hue, every other position the linker grey (1-based)', () => {
    const m = buildStemColorMap(
      [
        { key: 'i', start: 2, end: 4 },
        { key: 'at', start: 7, end: 8 },
      ],
      8,
    )
    expect(m[1]).toBe(STEM_LINKER_COLOR)
    expect(m[2]).toBe(STEM_COLORS.i)
    expect(m[4]).toBe(STEM_COLORS.i)
    expect(m[5]).toBe(STEM_LINKER_COLOR)
    expect(m[7]).toBe(STEM_COLORS.at)
    expect(m[8]).toBe(STEM_COLORS.at)
    // exactly positions 1..length are present
    expect(Object.keys(m)).toHaveLength(8)
  })

  test('clamps stem spans to [1, length] (defensive against an out-of-range span)', () => {
    const m = buildStemColorMap([{ key: 'i', start: -3, end: 100 }], 4)
    expect([m[1], m[2], m[3], m[4]]).toEqual([
      STEM_COLORS.i,
      STEM_COLORS.i,
      STEM_COLORS.i,
      STEM_COLORS.i,
    ])
    expect(m[5]).toBeUndefined()
  })

  test('no stems → all linker grey', () => {
    const m = buildStemColorMap([], 3)
    expect([m[1], m[2], m[3]]).toEqual([STEM_LINKER_COLOR, STEM_LINKER_COLOR, STEM_LINKER_COLOR])
  })
})

const diagram = (x: number[], y: number[]): R2dtDiagram => ({
  seq: 'A'.repeat(x.length),
  x,
  y,
  pairs: [],
  template: 'T-box',
  source: 'Rfam',
})

const TEST_MIN_LOOP_CLEARANCE_RATIO = 0.72

describe('diagramViewBox', () => {
  test('wraps the coordinate extents with uniform padding', () => {
    expect(diagramViewBox(diagram([10, 30], [20, 40]), 14)).toEqual([-4, 6, 48, 48])
  })
  test('empty diagram → a safe unit box', () => {
    expect(diagramViewBox(diagram([], []))).toEqual([0, 0, 1, 1])
  })
})

describe('nucleotideSpacing', () => {
  test('returns the median nearest-neighbour backbone step', () => {
    expect(nucleotideSpacing(diagram([0, 12, 24], [0, 0, 0]))).toBe(12)
  })
  test('falls back to a default for a single nucleotide', () => {
    expect(nucleotideSpacing(diagram([5], [5]))).toBe(12)
  })
})

describe('withStemIToIISpacer', () => {
  test('adds a display-only spacer after Stem I when Stem II is packed too close', () => {
    const d: R2dtDiagram = {
      seq: 'ACGUACGU',
      x: [0, 10, 20, 30, 40, 50, 60, 70],
      y: [0, 0, 0, 0, 0, 0, 0, 0],
      pairs: [[1, 3], [6, 8]],
      template: 'T-box',
      source: 'Rfam',
    }
    const out = withStemIToIISpacer(d, [
      { key: 'i', start: 1, end: 3 },
      { key: 'ii', start: 6, end: 8 },
    ])

    expect(out).not.toBe(d)
    expect(out.seq).toBe(d.seq)
    expect(out.pairs).toEqual(d.pairs)
    expect(out.x.slice(0, 3)).toEqual([0, 10, 20])
    // Two natural linker residues between Stem I and Stem II target a 6-step
    // virtual spacer. With 10-unit median spacing and a 10-unit current connector,
    // residues 4..8 shift +50 units.
    expect(out.x.slice(3)).toEqual([80, 90, 100, 110, 120])
    expect(out.y).toEqual(d.y)
  })

  test('does not change diagrams that lack Stem I or Stem II', () => {
    const d = diagram([0, 10, 20], [0, 0, 0])
    expect(withStemIToIISpacer(d, [{ key: 'i', start: 1, end: 2 }])).toBe(d)
    expect(withStemIToIISpacer(d, [{ key: 'ii', start: 2, end: 3 }])).toBe(d)
  })

  test('does not shift an already-spacious Stem I to Stem II connector', () => {
    const d: R2dtDiagram = {
      seq: 'ACGUACGU',
      x: [0, 10, 20, 90, 100, 110, 120, 130],
      y: [0, 0, 0, 0, 0, 0, 0, 0],
      pairs: [],
      template: null,
      source: null,
    }
    expect(withStemIToIISpacer(d, [
      { key: 'i', start: 1, end: 3 },
      { key: 'ii', start: 6, end: 8 },
    ])).toBe(d)
  })

  test('extends the Stem I to Stem II connector on the real T0060 example', () => {
    const member = (membersJson as MembersMap)['T0060.m1']
    const d = t0060m1Json as R2dtDiagram
    const stemI = member.stems.find((s) => s.key === 'i')
    expect(stemI).toBeTruthy()
    const before = Math.hypot(
      d.x[stemI!.end] - d.x[stemI!.end - 1],
      d.y[stemI!.end] - d.y[stemI!.end - 1],
    )
    const out = withStemIToIISpacer(d, member.stems)
    const after = Math.hypot(
      out.x[stemI!.end] - out.x[stemI!.end - 1],
      out.y[stemI!.end] - out.y[stemI!.end - 1],
    )

    expect(out.seq).toBe(d.seq)
    expect(out.pairs).toEqual(d.pairs)
    expect(after).toBeGreaterThan(before + 2 * nucleotideSpacing(d))
  })
})

function pairedResidues(d: R2dtDiagram): Set<number> {
  const out = new Set<number>()
  for (const [a, b] of d.pairs) {
    out.add(a)
    out.add(b)
  }
  return out
}

function maxDeviationFromChord(d: R2dtDiagram, start: number, end: number): number {
  const x0 = d.x[start - 2]
  const y0 = d.y[start - 2]
  const x1 = d.x[end]
  const y1 = d.y[end]
  const dx = x1 - x0
  const dy = y1 - y0
  const chord = Math.hypot(dx, dy) || 1
  let best = 0
  for (let r = start; r <= end; r++) {
    best = Math.max(best, Math.abs((d.x[r - 1] - x0) * dy - (d.y[r - 1] - y0) * dx) / chord)
  }
  return best / nucleotideSpacing(d)
}

function minBoundedLoopStepRatio(d: R2dtDiagram, stems: { start: number; end: number }[]): number {
  const paired = pairedResidues(d)
  const spacing = nucleotideSpacing(d)
  let best = Number.POSITIVE_INFINITY
  for (const span of stems) {
    const lo = Math.max(1, Math.min(span.start, span.end, d.seq.length))
    const hi = Math.max(lo, Math.min(Math.max(span.start, span.end), d.seq.length))
    let i = lo
    while (i <= hi) {
      if (paired.has(i)) {
        i += 1
        continue
      }
      let j = i
      while (j <= hi && !paired.has(j)) j += 1
      const s = i
      const e = j - 1
      if (e - s + 1 >= 2 && s - 1 >= lo && e + 1 <= hi && paired.has(s - 1) && paired.has(e + 1)) {
        for (let r = s + 1; r <= e; r++) {
          best = Math.min(best, Math.hypot(d.x[r - 1] - d.x[r - 2], d.y[r - 1] - d.y[r - 2]) / spacing)
        }
      }
      i = j
    }
  }
  return best
}

function minSingleResidueLoopArcRatio(d: R2dtDiagram, stems: { start: number; end: number }[]): number {
  const paired = pairedResidues(d)
  let best = Number.POSITIVE_INFINITY
  for (const span of stems) {
    const lo = Math.max(1, Math.min(span.start, span.end, d.seq.length))
    const hi = Math.max(lo, Math.min(Math.max(span.start, span.end), d.seq.length))
    let i = lo
    while (i <= hi) {
      if (paired.has(i)) {
        i += 1
        continue
      }
      let j = i
      while (j <= hi && !paired.has(j)) j += 1
      const s = i
      const e = j - 1
      if (s === e && s - 1 >= lo && e + 1 <= hi && paired.has(s - 1) && paired.has(e + 1)) {
        best = Math.min(best, maxDeviationFromChord(d, s, e))
      }
      i = j
    }
  }
  return best
}

function readDiagram(path: string): R2dtDiagram {
  return JSON.parse(readFileSync(path, 'utf8')) as R2dtDiagram
}

/** Min centre-to-centre distance (in median steps) between two residue ranges. */
function minSeparation(d: R2dtDiagram, a: [number, number], b: [number, number]): number {
  const spacing = nucleotideSpacing(d)
  let best = Number.POSITIVE_INFINITY
  for (let i = a[0]; i <= a[1]; i++) {
    for (let j = b[0]; j <= b[1]; j++) {
      best = Math.min(best, Math.hypot(d.x[i - 1] - d.x[j - 1], d.y[i - 1] - d.y[j - 1]))
    }
  }
  return best / spacing
}

/** Min centre-to-centre distance (raw diagram units) between two residue ranges — the absolute
 *  5′↔3′ strand gap, compared before/after the pass without re-normalising by a median spacing
 *  that the pass itself nudges. */
function minCentreDist(d: R2dtDiagram, a: [number, number], b: [number, number]): number {
  let best = Number.POSITIVE_INFINITY
  for (let i = a[0]; i <= a[1]; i++) {
    for (let j = b[0]; j <= b[1]; j++) {
      best = Math.min(best, Math.hypot(d.x[i - 1] - d.x[j - 1], d.y[i - 1] - d.y[j - 1]))
    }
  }
  return best
}

/** residue → base-pair partner (both directions). */
function partnerOf(d: R2dtDiagram): Map<number, number> {
  const m = new Map<number, number>()
  for (const [a, b] of d.pairs) {
    m.set(a, b)
    m.set(b, a)
  }
  return m
}

/** Enclosed MULTI-residue internal loops (a 5′ run of ≥2 unpaired residues with a matching 3′
 *  run of ≥2 unpaired residues on the same helix) within `stems` — exactly the loops the
 *  coordinated opener promises never to cram tighter than the committed layout. */
function multiResidueInternalLoops(
  d: R2dtDiagram,
  stems: { start: number; end: number }[],
): { s: number; e: number; ts: number; te: number }[] {
  const paired = pairedResidues(d)
  const partner = partnerOf(d)
  const loops: { s: number; e: number; ts: number; te: number }[] = []
  for (const span of stems) {
    const lo = Math.max(1, Math.min(span.start, span.end, d.seq.length))
    const hi = Math.max(lo, Math.min(Math.max(span.start, span.end), d.seq.length))
    let i = lo
    while (i <= hi) {
      if (paired.has(i)) {
        i += 1
        continue
      }
      let j = i
      while (j <= hi && !paired.has(j)) j += 1
      const s = i
      const e = j - 1
      if (s - 1 >= lo && e + 1 <= hi && paired.has(s - 1) && paired.has(e + 1)) {
        const pLeft = partner.get(s - 1)
        const pRight = partner.get(e + 1)
        if (pLeft !== undefined && pRight !== undefined && pRight < pLeft) {
          const ts = pRight + 1
          const te = pLeft - 1
          let ok = ts > e + 1 && te >= ts
          if (ok) for (let r = ts; r <= te; r++) if (paired.has(r)) ok = false
          if (ok && e - s + 1 >= 2 && te - ts + 1 >= 2) loops.push({ s, e, ts, te })
        }
      }
      i = j
    }
  }
  return loops
}

/** Largest pairwise centre overlap (in median steps) among unpaired residues of `stems`, where
 *  two glyphs (radius 0.44 spacing) overlap when their centres are closer than 0.88 spacing.
 *  0 ⇒ no two non-adjacent, non-paired residues visibly merge. */
function maxGlyphOverlap(d: R2dtDiagram, stems: { start: number; end: number }[]): number {
  const spacing = nucleotideSpacing(d)
  const pairKey = new Set(d.pairs.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`))
  let worst = 0
  for (const span of stems) {
    const lo = Math.max(1, Math.min(span.start, span.end, d.seq.length))
    const hi = Math.max(lo, Math.min(Math.max(span.start, span.end), d.seq.length))
    for (let i = lo; i <= hi; i++) {
      for (let j = i + 2; j <= hi; j++) {
        if (pairKey.has(`${i}-${j}`)) continue
        const dist = Math.hypot(d.x[i - 1] - d.x[j - 1], d.y[i - 1] - d.y[j - 1]) / spacing
        worst = Math.max(worst, 0.88 - dist)
      }
    }
  }
  return worst
}

describe('withReadableStemLoops', () => {
  test('keeps the production loop clearance floor at least as strict as the test guard', () => {
    expect(R2DT_MIN_LOOP_CLEARANCE_RATIO).toBeGreaterThanOrEqual(TEST_MIN_LOOP_CLEARANCE_RATIO)
  })

  test('opens a collapsed internal stem loop without moving paired residues or changing indices', () => {
    const d: R2dtDiagram = {
      seq: 'A'.repeat(10),
      x: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90],
      y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      pairs: [[1, 10], [2, 9], [3, 8]],
      template: 'T-box',
      source: 'Rfam',
    }

    const out = withReadableStemLoops(d, [{ start: 1, end: 10 }])

    expect(out).not.toBe(d)
    expect(out.seq).toBe(d.seq)
    expect(out.pairs).toEqual(d.pairs)
    for (const r of [1, 2, 3, 8, 9, 10]) {
      expect(out.x[r - 1]).toBe(d.x[r - 1])
      expect(out.y[r - 1]).toBe(d.y[r - 1])
    }
    expect(maxDeviationFromChord(out, 4, 7)).toBeGreaterThan(maxDeviationFromChord(d, 4, 7) + 0.7)
    expect(minBoundedLoopStepRatio(out, [{ start: 1, end: 10 }])).toBeGreaterThan(TEST_MIN_LOOP_CLEARANCE_RATIO)
  })

  test('opens a collapsed one-residue internal stem loop', () => {
    const d: R2dtDiagram = {
      seq: 'A'.repeat(9),
      x: [0, 10, 20, 30, 40, 50, 60, 70, 80],
      y: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      pairs: [[1, 9], [2, 8], [3, 7], [4, 6]],
      template: 'T-box',
      source: 'Rfam',
    }

    const out = withReadableStemLoops(d, [{ start: 1, end: 9 }])

    expect(out).not.toBe(d)
    expect(out.seq).toBe(d.seq)
    expect(out.pairs).toEqual(d.pairs)
    for (const r of [1, 2, 3, 4, 6, 7, 8, 9]) {
      expect(out.x[r - 1]).toBe(d.x[r - 1])
      expect(out.y[r - 1]).toBe(d.y[r - 1])
    }
    expect(maxDeviationFromChord(out, 5, 5)).toBeGreaterThan(maxDeviationFromChord(d, 5, 5) + 0.6)
  })

  test('opens an internal loop by bowing its two strands to opposite sides', () => {
    // A symmetric helix whose internal loop (5′ run 3-4, 3′ run 9-10) is drawn with both
    // strands crammed onto the middle axis, ~0.6 steps apart — they "run together". The
    // coordinated pass must push the two strands apart so they read as two distinct strands.
    const d: R2dtDiagram = {
      seq: 'A'.repeat(12),
      //        1      2     3      4      5      6       7      8      9     10     11      12
      x: [0, 0, 3, 7, 10, 13, 13, 10, 7, 3, 0, 0],
      y: [-10, 0, 1, 1, 0, -1, 1, 4, 3, 3, 4, 14],
      pairs: [[1, 12], [2, 11], [5, 8]],
      template: 'T-box',
      source: 'Rfam',
    }
    const before = minSeparation(d, [3, 4], [9, 10])
    const out = withReadableStemLoops(d, [{ start: 1, end: 12 }])

    expect(out).not.toBe(d)
    expect(out.seq).toBe(d.seq)
    expect(out.pairs).toEqual(d.pairs)
    // Paired residues (the fixed closing pairs + helix) never move.
    for (const r of [1, 2, 5, 8, 11, 12]) {
      expect(out.x[r - 1]).toBe(d.x[r - 1])
      expect(out.y[r - 1]).toBe(d.y[r - 1])
    }
    // The two strands end up cleanly separated (the coordinated-open contract).
    const after = minSeparation(out, [3, 4], [9, 10])
    expect(after).toBeGreaterThan(before)
    expect(after).toBeGreaterThanOrEqual(R2DT_LOOP_STRAND_SEP_RATIO)
    // …on opposite sides of the closing-pair axis (y≈0..4): one strand above, one below.
    const meanY = (lo: number, hi: number) =>
      (out.y.slice(lo - 1, hi).reduce((s, v) => s + v, 0)) / (hi - lo + 1)
    expect((meanY(3, 4) - 2) * (meanY(9, 10) - 2)).toBeLessThan(0)
  })

  test('keeps a well-separated internal loop open instead of cramming it (max separation, not balanced min)', () => {
    // The 5′ run (3-4) and 3′ run (8-9) are already drawn ~3 steps apart, but a flanking
    // residue (12) sits just outside the 5′ strand so the most-separated opening clears the
    // structure by only ~1 step. The retired objective maximised min(clearance, separation),
    // which would pull the strands back toward that ~1-step clearance ceiling; the pass must
    // instead keep them at their wide separation (it never opens an internal loop tighter than
    // the committed layout).
    const d: R2dtDiagram = {
      seq: 'A'.repeat(12),
      //         1       2      3      4     5      6      7      8      9     10      11      12
      x: [0, 0, 0, 0, 0, 0.5, 9.5, 10, 10, 10, 10, -2.2],
      y: [-10, -3, 0, 3, 6, 9, 9, 6, 3, 0, -3, 1.5],
      pairs: [[1, 11], [2, 10], [5, 7]],
      template: 'T-box',
      source: 'Rfam',
    }
    const out = withReadableStemLoops(d, [{ start: 1, end: 11 }])
    expect(minSeparation(d, [3, 4], [8, 9])).toBeGreaterThan(R2DT_LOOP_STRAND_SEP_RATIO)
    expect(minCentreDist(out, [3, 4], [8, 9])).toBeGreaterThanOrEqual(minCentreDist(d, [3, 4], [8, 9]) - 1e-6)
  })

  test('never crams a multi-residue internal loop tighter than the committed layout (do no harm)', () => {
    // The regression guard the original coordinated-open lacked: an internal loop whose 5′ and
    // 3′ strands each carry ≥2 residues must never leave the readability pass closer together
    // than R2DT already drew it. (A balanced clearance/separation objective once crammed
    // well-separated loops — raw ~3 steps — back to ~1 step, where the two strands blur into one
    // arch. Asserting this across every committed diagram would have caught that immediately.)
    const members = membersJson as MembersMap
    const data = join(process.cwd(), 'public', 'data')
    let checkedLoops = 0

    for (const [dir, variant] of [
      ['r2dt/', 'antiterm'],
      ['r2dt/term/', 'terminator'],
    ] as const) {
      for (const name of readdirSync(join(data, dir))) {
        if (!name.endsWith('.json') || name === 'manifest.json') continue
        const memberId = name.replace(/\.json$/, '')
        const member = members[memberId]
        if (!member) continue
        const d = readDiagram(join(data, dir, name))
        const termPairs = variant === 'terminator' ? terminatorHairpinPairs(member) : []
        const spans =
          variant === 'terminator'
            ? [
                ...member.stems.filter((s) => s.key !== 'at').map(({ start, end }) => ({ start, end })),
                ...(termPairs.length
                  ? [{ start: Math.min(...termPairs.flat()), end: Math.max(...termPairs.flat()) }]
                  : []),
              ]
            : member.stems.map(({ start, end }) => ({ start, end }))
        const out = withReadableR2dtLayout(d, member.stems, variant, termPairs)
        for (const lp of multiResidueInternalLoops(d, spans)) {
          const before = minCentreDist(d, [lp.s, lp.e], [lp.ts, lp.te])
          const after = minCentreDist(out, [lp.s, lp.e], [lp.ts, lp.te])
          expect(
            after,
            `${memberId} 5'[${lp.s}-${lp.e}] 3'[${lp.ts}-${lp.te}] crammed ${before.toFixed(2)}→${after.toFixed(2)}`,
          ).toBeGreaterThanOrEqual(before - 1e-6)
          checkedLoops += 1
        }
      }
    }

    expect(checkedLoops).toBeGreaterThan(2000)
  }, 20_000)

  test('opens the real T0185 Stem-I guardrail loop in both conformations', () => {
    const member = (membersJson as MembersMap)['T0185.m2']
    const stemSpans = member.stems.map(({ start, end }) => ({ start, end }))
    const at = t0185m2Json as R2dtDiagram
    const term = t0185m2TermJson as R2dtDiagram

    const atOut = withReadableR2dtLayout(at, member.stems, 'antiterm')
    const termOut = withReadableR2dtLayout(term, member.stems, 'terminator', terminatorHairpinPairs(member))

    // This 2-nt Stem-I run is the tiny stagger visible in the raw layout; the display pass
    // opens it into a readable arc in both diagrams.
    expect(maxDeviationFromChord(atOut, 68, 69)).toBeGreaterThan(maxDeviationFromChord(at, 68, 69) + 0.25)
    expect(maxDeviationFromChord(termOut, 68, 69)).toBeGreaterThan(maxDeviationFromChord(term, 68, 69) + 0.25)
    expect(minBoundedLoopStepRatio(atOut, stemSpans)).toBeGreaterThan(TEST_MIN_LOOP_CLEARANCE_RATIO)
    expect(minBoundedLoopStepRatio(termOut, stemSpans.filter((_, i) => member.stems[i].key !== 'at'))).toBeGreaterThan(
      TEST_MIN_LOOP_CLEARANCE_RATIO,
    )
  })

  test('keeps every committed R2DT stem loop legible after the display pass', () => {
    const members = membersJson as MembersMap
    const data = join(process.cwd(), 'public', 'data')
    let checked = 0

    for (const [dir, variant] of [
      ['r2dt/', 'antiterm'],
      ['r2dt/term/', 'terminator'],
    ] as const) {
      for (const name of readdirSync(join(data, dir))) {
        if (!name.endsWith('.json') || name === 'manifest.json') continue
        const memberId = name.replace(/\.json$/, '')
        const member = members[memberId]
        expect(member, `${memberId} has a diagram but no member`).toBeTruthy()
        const d = readDiagram(join(data, dir, name))
        const termPairs = variant === 'terminator' ? terminatorHairpinPairs(member) : []
        const out = withReadableR2dtLayout(d, member.stems, variant, termPairs)
        const spans =
          variant === 'terminator'
            ? [
                ...member.stems.filter((s) => s.key !== 'at').map(({ start, end }) => ({ start, end })),
                ...(termPairs.length
                  ? [{
                      start: Math.min(...termPairs.flat()),
                      end: Math.max(...termPairs.flat()),
                    }]
                  : []),
              ]
            : member.stems.map(({ start, end }) => ({ start, end }))

        expect(out.seq, memberId).toBe(d.seq)
        expect(out.pairs, memberId).toEqual(d.pairs)
        expect(out.x.length, memberId).toBe(d.seq.length)
        expect(out.y.length, memberId).toBe(d.seq.length)
        expect([...out.x, ...out.y].every(Number.isFinite), memberId).toBe(true)
        const minLoop = minBoundedLoopStepRatio(out, spans)
        if (Number.isFinite(minLoop)) expect(minLoop, memberId).toBeGreaterThan(TEST_MIN_LOOP_CLEARANCE_RATIO)
        const minSingleLoop = minSingleResidueLoopArcRatio(out, spans)
        if (Number.isFinite(minSingleLoop)) expect(minSingleLoop, memberId).toBeGreaterThan(0.28)
        // Do no harm: the loop opener (incl. coordinated internal-loop separation) never buries
        // two glyphs in each other. Every opened residue is held ≥ the loop-clearance floor from
        // its neighbours, so it can graze a neighbour to at most ~0.68 steps (overlap depth 0.2)
        // and never deeper than the spaced input already packed it — any close packing the spacer
        // or the committed paired geometry introduced upstream is left exactly as-is.
        const spacedOverlap = maxGlyphOverlap(withStemIToIISpacer(d, member.stems), spans)
        expect(maxGlyphOverlap(out, spans), memberId).toBeLessThanOrEqual(Math.max(spacedOverlap, 0.2) + 1e-6)
        checked += 1
      }
    }

    expect(checked).toBeGreaterThan(1500)
  }, 20_000)
})
