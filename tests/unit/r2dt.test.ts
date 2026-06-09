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

function readDiagram(path: string): R2dtDiagram {
  return JSON.parse(readFileSync(path, 'utf8')) as R2dtDiagram
}

describe('withReadableStemLoops', () => {
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
    expect(minBoundedLoopStepRatio(out, [{ start: 1, end: 10 }])).toBeGreaterThan(0.72)
  })

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
    expect(minBoundedLoopStepRatio(atOut, stemSpans)).toBeGreaterThan(0.72)
    expect(minBoundedLoopStepRatio(termOut, stemSpans.filter((_, i) => member.stems[i].key !== 'at'))).toBeGreaterThan(0.72)
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
        if (Number.isFinite(minLoop)) expect(minLoop, memberId).toBeGreaterThan(0.72)
        checked += 1
      }
    }

    expect(checked).toBeGreaterThan(1500)
  }, 20_000)
})
