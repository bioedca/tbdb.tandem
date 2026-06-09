import { describe, expect, test } from 'vitest'
import {
  buildArchitecturePoster,
  hashLocusId,
  seededUnit,
} from '../../src/lib/architecturePoster'
import type { FeatureName, Member, Span } from '../../src/lib/data/types'
import { makeMember, MEMBERS_BY_LOCUS } from '../fixtures'

const FEATURES: FeatureName[] = ['tbox', 's1', 's1_loop', 'codon', 'antiterm', 'term', 'discrim']
const missing: Span = [0, 0]

function windows(tbox: Span): Record<FeatureName, Span> {
  return Object.fromEntries(
    FEATURES.map((feature) => [feature, feature === 'tbox' ? tbox : missing]),
  ) as Record<FeatureName, Span>
}

function member(id: string, ordinal: number, leader: [number, number], tbox: Span): Member {
  const window = windows(tbox)
  return makeMember({
    member_id: id,
    tandem_id: id.split('.')[0],
    ordinal,
    specifier: { aa: ordinal === 1 ? 'ILE' : 'LEU', codon: ordinal === 1 ? 'AUU' : 'CUU' },
    coords: { leader, window, genome: window },
    fasta_sequence: 'A'.repeat(Math.abs(leader[1] - leader[0]) + 1),
  })
}

describe('architecturePoster', () => {
  test('hash and seeded values are stable and bounded', () => {
    expect(hashLocusId('T0026')).toBe(hashLocusId('T0026'))
    expect(hashLocusId('T0026')).not.toBe(hashLocusId('T0342'))
    expect(seededUnit(hashLocusId('T0026'), 3)).toBeGreaterThanOrEqual(0)
    expect(seededUnit(hashLocusId('T0026'), 3)).toBeLessThan(1)
  })

  test('preserves biological element order while using normalized x positions', () => {
    const poster = buildArchitecturePoster(MEMBERS_BY_LOCUS.get('T0005')!, '+', {
      funcClass: 'biosynthesis',
      funcSource: 'EC',
      downstreamGene: 'trpE',
    })
    expect(poster.elementNodes.map((node) => node.id)).toEqual(['T0005.m1', 'T0005.m2', 'T0005.m3'])
    expect(poster.elementNodes.map((node) => node.order)).toEqual([1, 2, 3])
    expect(poster.elementNodes[0].x).toBeLessThan(poster.elementNodes[1].x)
    expect(poster.elementNodes[1].x).toBeLessThan(poster.elementNodes[2].x)
    expect(poster.orfNode.x).toBeGreaterThan(poster.elementNodes[2].x)
  })

  test('carries signed overlap relationships from buildArchitecture', () => {
    const poster = buildArchitecturePoster(MEMBERS_BY_LOCUS.get('T0002')!, '+', {
      funcClass: 'biosynthesis',
      funcSource: 'text',
      downstreamGene: 'ilvD',
    })
    expect(poster.relationships).toHaveLength(1)
    expect(poster.relationships[0].kind).toBe('overlap')
    expect(poster.relationships[0].label).toContain('overlap')
    expect(poster.relationships[0].metadata?.signedGap).toBeLessThan(0)
  })

  test('carries positive spacer relationships without converting them to scale', () => {
    const m1 = member('PX.m1', 1, [1, 180], [10, 50])
    const m2 = member('PX.m2', 2, [260, 439], [10, 50])
    const poster = buildArchitecturePoster([m1, m2], '+', {
      funcClass: 'aaRS',
      funcSource: 'EC',
      downstreamGene: 'ileS',
    })
    expect(poster.relationships[0].kind).toBe('spacer')
    expect(poster.relationships[0].label).toContain('spacer')
    expect(poster.relationships[0].metadata?.signedGap).toBeGreaterThan(0)
  })

  test('is deterministic for the same locus id', () => {
    const props = { funcClass: 'biosynthesis', funcSource: 'text', downstreamGene: 'ilvD' } as const
    const a = buildArchitecturePoster(MEMBERS_BY_LOCUS.get('T0002')!, '+', props)
    const b = buildArchitecturePoster(MEMBERS_BY_LOCUS.get('T0002')!, '+', props)
    expect(a.elementNodes.map((node) => [node.x, node.y])).toEqual(
      b.elementNodes.map((node) => [node.x, node.y]),
    )
    expect(a.orfNode.y).toBe(b.orfNode.y)
  })
})
