// Unit: element↔locus aggregation + click semantics (PLAN /cloud §4.4, §6.4, §7.1).
// Locus centroid = mean of element coords; memberCount correct; mixed-specifier
// aggregation follows buildLocusTipMeta conventions; an unmapped element never throws.
import { describe, expect, test } from 'vitest'

import { aggregatePoints, pointAction, toLocusPoints } from '../../../src/lib/cloud/aggregate'
import type { CloudPoint } from '../../../src/lib/cloud/types'

function pt(over: Partial<CloudPoint> = {}): CloudPoint {
  return {
    id: 'X',
    tandem_id: 'T0',
    member_id: 'T0.m1',
    ord: 1,
    spec: 'TRP',
    phylum: 'Firmicutes',
    func: 'aaRS',
    type: 'Transcriptional',
    conf: 'high',
    mixed: false,
    ddg: -10,
    ident: 80,
    ncores: 2,
    x: 0,
    y: 0,
    z: 0,
    ...over,
  }
}

describe('toLocusPoints', () => {
  test('locus point sits at the centroid of its element coords, with the count', () => {
    const elems = [
      pt({ id: 'A', tandem_id: 'T1', member_id: 'T1.m1', x: 0, y: 0, z: 0, ddg: -10 }),
      pt({ id: 'B', tandem_id: 'T1', member_id: 'T1.m2', x: 6, y: 3, z: -3, ddg: -20 }),
    ]
    const [locus] = toLocusPoints(elems)
    expect(locus.tandem_id).toBe('T1')
    expect(locus.id).toBe('T1') // id becomes the locus key (click → navigate)
    expect(locus.x).toBeCloseTo(3)
    expect(locus.y).toBeCloseTo(1.5)
    expect(locus.z).toBeCloseTo(-1.5)
    expect(locus.memberCount).toBe(2)
    expect(locus.ddg).toBeCloseTo(-15) // mean of the elements' ΔΔG
  })

  test('specifier aggregation: shared → single, disagree → sorted A;B + mixed, all unknown → null', () => {
    const shared = toLocusPoints([
      pt({ id: 'a', tandem_id: 'S', spec: 'TRP' }),
      pt({ id: 'b', tandem_id: 'S', spec: 'TRP' }),
    ])[0]
    expect(shared.spec).toBe('TRP')
    expect(shared.mixed).toBe(false)

    const disagree = toLocusPoints([
      pt({ id: 'a', tandem_id: 'M', spec: 'LEU' }),
      pt({ id: 'b', tandem_id: 'M', spec: 'ILE' }),
    ])[0]
    expect(disagree.spec).toBe('ILE;LEU') // sorted
    expect(disagree.mixed).toBe(true)

    const unknown = toLocusPoints([
      pt({ id: 'a', tandem_id: 'U', spec: null }),
      pt({ id: 'b', tandem_id: 'U', spec: '?' }),
    ])[0]
    expect(unknown.spec).toBeNull()
    expect(unknown.mixed).toBe(false)
  })

  test('a point with no tandem_id falls back to its own id (never throws)', () => {
    const out = toLocusPoints([pt({ id: 'lonely', tandem_id: '' })])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('lonely')
    expect(out[0].memberCount).toBe(1)
  })
})

describe('aggregatePoints', () => {
  const elems = [
    pt({ id: 'A', tandem_id: 'T1', x: 0 }),
    pt({ id: 'B', tandem_id: 'T1', x: 4 }),
    pt({ id: 'C', tandem_id: 'T2', x: 9 }),
  ]
  test('element granularity returns raw points with memberCount 1', () => {
    const out = aggregatePoints(elems, 'element')
    expect(out).toHaveLength(3)
    expect(out.every((p) => p.memberCount === 1)).toBe(true)
  })
  test('locus granularity returns one centroid point per tandem_id', () => {
    const out = aggregatePoints(elems, 'locus')
    expect(out).toHaveLength(2)
    const t1 = out.find((p) => p.tandem_id === 'T1')!
    expect(t1.x).toBeCloseTo(2)
    expect(t1.memberCount).toBe(2)
  })
})

describe('pointAction', () => {
  test('non-selectable → navigate to the locus detail page', () => {
    expect(pointAction({ tandem_id: 'T5', spec: 'TRP' }, false)).toEqual({
      kind: 'navigate',
      tandem_id: 'T5',
    })
  })
  test('selectable → toggle the specifier facet only for a single concrete specifier', () => {
    expect(pointAction({ tandem_id: 'T5', spec: 'TRP' }, true)).toEqual({
      kind: 'facet',
      specifier: 'TRP',
    })
    expect(pointAction({ tandem_id: 'T5', spec: null }, true)).toEqual({ kind: 'none' })
    expect(pointAction({ tandem_id: 'T5', spec: '?' }, true)).toEqual({ kind: 'none' })
    expect(pointAction({ tandem_id: 'T5', spec: 'ILE;LEU' }, true)).toEqual({ kind: 'none' })
  })
})
