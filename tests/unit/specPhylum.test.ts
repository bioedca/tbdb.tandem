// Unit: the specifier × phylum heatmap model (PLAN §10.2, §9, §8.2). Pure folding on
// the synthetic fixtures (axes stable from the full set, z from the cross-filtered
// subset → narrows live), plus real-artifact drift guards over loci.json pinning the
// §3.1 phylum census (Firmicutes 454 / 16 non-Firmicutes / 3 unassigned).
import { describe, expect, test } from 'vitest'
import {
  buildSpecPhylumHeatmap,
  PHYLUM_UNASSIGNED,
  phylumKey,
  SPEC_UNKNOWN,
  specifierKey,
  type SpecPhylumGrid,
} from '../../src/lib/specPhylum'
import type { LociFile } from '../../src/lib/data/types'
import { LOCI, makeLocus } from '../fixtures'
import lociJson from '../../public/data/loci.json'

function zsum(g: SpecPhylumGrid): number {
  let s = 0
  for (const row of g.z) for (const c of row) if (c != null) s += c
  return s
}
function rowSum(g: SpecPhylumGrid, phylum: string): number {
  const i = g.phyla.indexOf(phylum)
  return g.z[i].reduce<number>((acc, c) => acc + (c ?? 0), 0)
}

describe('specifierKey / phylumKey', () => {
  test('null phylum → unassigned; `?` specifier passes through', () => {
    expect(phylumKey(makeLocus({ tandem_id: 'X', phylum: null }))).toBe(PHYLUM_UNASSIGNED)
    expect(phylumKey(makeLocus({ tandem_id: 'X', phylum: 'Firmicutes' }))).toBe('Firmicutes')
    expect(specifierKey(makeLocus({ tandem_id: 'X', specifier_aa: '?' }))).toBe(SPEC_UNKNOWN)
    expect(specifierKey(makeLocus({ tandem_id: 'X', specifier_aa: 'TRP' }))).toBe('TRP')
  })
})

describe('buildSpecPhylumHeatmap (fixtures)', () => {
  const grid = buildSpecPhylumHeatmap(LOCI, LOCI)

  test('axes are frequency-desc with the sentinels forced last', () => {
    expect(grid.specifiers).toEqual(['TRP', 'ALA;VAL', 'ILE;LEU', 'THR', '?'])
    expect(grid.phyla).toEqual(['Firmicutes', 'Actinobacteria', 'Chloroflexi', 'unassigned'])
  })

  test('z holds locus-level counts; empty cells are null/blank', () => {
    expect(grid.z[0][0]).toBe(2) // Firmicutes × TRP (T0001, T0005)
    expect(grid.text[0][0]).toBe('2')
    const thr = grid.specifiers.indexOf('THR')
    expect(grid.z[0][thr]).toBeNull() // no Firmicutes × THR
    expect(grid.text[0][thr]).toBe('')
    expect(grid.max).toBe(2)
  })

  test('every locus is represented exactly once across the grid', () => {
    expect(zsum(grid)).toBe(LOCI.length) // 6
  })

  test('the unassigned row carries the null-phylum locus', () => {
    expect(rowSum(grid, PHYLUM_UNASSIGNED)).toBe(1) // T0004
  })

  test('axes stay stable while z narrows to the cross-filtered subset', () => {
    const narrowed = buildSpecPhylumHeatmap(LOCI, [LOCI[1]]) // only T0002 (ILE;LEU, Firmicutes)
    expect(narrowed.specifiers).toEqual(grid.specifiers) // axis unchanged
    expect(narrowed.phyla).toEqual(grid.phyla)
    expect(zsum(narrowed)).toBe(1)
    const f = narrowed.phyla.indexOf('Firmicutes')
    const il = narrowed.specifiers.indexOf('ILE;LEU')
    expect(narrowed.z[f][il]).toBe(1)
  })
})

// ── Real-artifact drift guards (mirror data-pipeline/tests/test_artifacts.py) ─────
describe('committed loci.json — §3.1 phylum census', () => {
  const loci = (lociJson as unknown as LociFile).loci
  const grid = buildSpecPhylumHeatmap(loci, loci)

  test('every one of the 470 loci falls in exactly one cell', () => {
    expect(loci).toHaveLength(470)
    expect(zsum(grid)).toBe(470)
  })

  test('the phylum axis is the 6 named phyla + an unassigned row, sentinel last', () => {
    expect(grid.phyla).toHaveLength(7)
    expect(grid.phyla[grid.phyla.length - 1]).toBe(PHYLUM_UNASSIGNED)
    expect(grid.specifiers[grid.specifiers.length - 1]).toBe(SPEC_UNKNOWN)
  })

  test('Firmicutes 454 · non-Firmicutes 16 · unassigned 3 (PLAN §3.1)', () => {
    expect(rowSum(grid, 'Firmicutes')).toBe(454)
    expect(zsum(grid) - rowSum(grid, 'Firmicutes')).toBe(16)
    expect(rowSum(grid, PHYLUM_UNASSIGNED)).toBe(3)
  })
})
