import { describe, expect, test } from 'vitest'

import type { CloudTree } from '../../src/lib/cloud/types'
import type { TreeTipsMap } from '../../src/lib/data/types'
import { leafNames, parseNewick, serializeNewick } from '../../src/lib/tree'
import {
  filterCloudTreeForVisualization,
  filterTreeTipsForVisualization,
  isVisualizationExcludedTandemId,
  pruneExcludedNewick,
} from '../../src/lib/visualizationExclusions'

describe('visualization exclusions', () => {
  test('identifies only the curated visualization outliers', () => {
    expect(isVisualizationExcludedTandemId('T0281')).toBe(true)
    expect(isVisualizationExcludedTandemId('T0445')).toBe(true)
    expect(isVisualizationExcludedTandemId('T0282')).toBe(false)
    expect(isVisualizationExcludedTandemId(null)).toBe(false)
  })

  test('filters tree-tip metadata without mutating the source map', () => {
    const tips: TreeTipsMap = {
      U1: { member_id: 'T0281.m1', tandem_id: 'T0281', ordinal: 1, specifier: 'GLN', phylum: 'Firmicutes', tree: 'main' },
      U2: { member_id: 'T1.m1', tandem_id: 'T1', ordinal: 1, specifier: 'TRP', phylum: 'Firmicutes', tree: 'main' },
      U3: { member_id: 'T0445.m1', tandem_id: 'T0445', ordinal: 1, specifier: 'GLY', phylum: 'Firmicutes', tree: 'main' },
    }

    expect(Object.keys(filterTreeTipsForVisualization(tips))).toEqual(['U2'])
    expect(Object.keys(tips)).toEqual(['U1', 'U2', 'U3'])
  })

  test('prunes excluded Newick leaves and collapses unary parents', () => {
    const root = parseNewick('((U1:1,U2:2)0.9:3,(U3:4,U4:5)0.8:6)root;')
    const tandemOf = new Map([
      ['U1', 'T0281'],
      ['U2', 'T1'],
      ['U3', 'T0445'],
      ['U4', 'T2'],
    ])

    const pruned = pruneExcludedNewick(root, tandemOf)
    expect(pruned).not.toBeNull()
    expect(leafNames(pruned!)).toEqual(['U2', 'U4'])
    expect(serializeNewick(pruned!)).not.toContain('U1')
    expect(serializeNewick(pruned!)).not.toContain('U3')
  })

  test('filters cloud points and remaps nearest-neighbour edges', () => {
    const tree: CloudTree = {
      var: [1, 0, 0, 0, 0, 0],
      points: [
        { id: 'A', tandem_id: 'T0281', member_id: 'T0281.m1', ord: 1, spec: 'GLN', phylum: 'Firmicutes', func: 'aaRS', type: 'Transcriptional', conf: 'high', mixed: false, ddg: null, ident: null, ncores: 2, x: 0, y: 0, z: 0 },
        { id: 'B', tandem_id: 'T1', member_id: 'T1.m1', ord: 1, spec: 'TRP', phylum: 'Firmicutes', func: 'aaRS', type: 'Transcriptional', conf: 'high', mixed: false, ddg: null, ident: null, ncores: 2, x: 1, y: 0, z: 0 },
        { id: 'C', tandem_id: 'T2', member_id: 'T2.m1', ord: 1, spec: 'LEU', phylum: 'Firmicutes', func: 'aaRS', type: 'Transcriptional', conf: 'high', mixed: false, ddg: null, ident: null, ncores: 2, x: 2, y: 0, z: 0 },
        { id: 'D', tandem_id: 'T0445', member_id: 'T0445.m1', ord: 1, spec: 'GLY', phylum: 'Firmicutes', func: 'aaRS', type: 'Transcriptional', conf: 'high', mixed: false, ddg: null, ident: null, ncores: 2, x: 3, y: 0, z: 0 },
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
      ],
    }

    const filtered = filterCloudTreeForVisualization(tree)
    expect(filtered.points.map((point) => point.tandem_id)).toEqual(['T1', 'T2'])
    expect(filtered.edges).toEqual([[0, 1]])
    expect(tree.points).toHaveLength(4)
  })
})
