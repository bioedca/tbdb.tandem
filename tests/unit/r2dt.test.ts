// Unit: R2DT layout helpers (PLAN §9) + the shared stem-color map that BOTH the
// R2DT diagram and the fornac overlay paint from (so the two viewers color
// identically). Pure functions, no DOM / no fetch.
import { describe, expect, test } from 'vitest'
import { buildStemColorMap, STEM_COLORS, STEM_LINKER_COLOR } from '../../src/lib/color'
import { diagramViewBox, nucleotideSpacing, type R2dtDiagram } from '../../src/lib/r2dt'

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
