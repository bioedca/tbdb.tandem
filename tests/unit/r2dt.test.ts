// Unit: R2DT layout helpers (PLAN §9) + the shared stem-color map that BOTH the
// R2DT diagram and the fornac overlay paint from (so the two viewers color
// identically). Pure functions, no DOM / no fetch.
import { describe, expect, test } from 'vitest'
import { buildStemColorMap, STEM_COLORS, STEM_LINKER_COLOR } from '../../src/lib/color'
import {
  diagramViewBox,
  nucleotideSpacing,
  withStemIToIISpacer,
  type R2dtDiagram,
} from '../../src/lib/r2dt'
import type { MembersMap } from '../../src/lib/data/types'
import membersJson from '../../public/data/members.json'
import t0060m1Json from '../../public/data/r2dt/T0060.m1.json'

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
