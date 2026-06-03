// Unit: the similarity-tree logic (PLAN §10.2, §6, §9④). Two layers:
//   1. pure Newick parse/serialize + locus-collapse on tiny synthetic trees
//      (deterministic by construction — sisters collapse, dispersed copies don't);
//   2. real-artifact drift guards over the committed public/data tree files — the
//      front-end mirror of data-pipeline's test_artifacts.py tree checks, pinning
//      the emitted tip counts (847 main / 102 fallback) and the collapsed counts.
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

import {
  buildElementTipMeta,
  buildLocusTipMeta,
  collapseToLoci,
  countLeaves,
  isNonFirmicutes,
  leafNames,
  parseNewick,
  parseSupport,
  serializeNewick,
  specifierFill,
  tipTandemMap,
} from '../../src/lib/tree'
import { UNKNOWN_SPECIFIER_COLOR, aaColor } from '../../src/lib/color'
import type { TreeTipsMap } from '../../src/lib/data/types'

import treeTipsJson from '../../public/data/tree_tips.json'

const TIPS = treeTipsJson as unknown as TreeTipsMap
const dataPath = (f: string): string => `${process.cwd()}/public/data/${f}`
const NWK_MAIN = readFileSync(dataPath('tree.nwk'), 'utf8')
const NWK_FALLBACK = readFileSync(dataPath('tree_fallback.nwk'), 'utf8')

describe('parseNewick / serializeNewick', () => {
  test('parses a small tree with names and branch lengths', () => {
    const t = parseNewick('((A:0.1,B:0.2)0.9:0.05,C:0.3)root;')
    expect(t.children).toHaveLength(2)
    expect(leafNames(t)).toEqual(['A', 'B', 'C'])
    expect(t.children[0].name).toBe('0.9') // internal support label preserved
    expect(t.children[0].length).toBe('0.05')
    expect(t.children[0].children[0].length).toBe('0.1')
  })

  test('round-trips verbatim (raw length tokens, scientific notation)', () => {
    const nwk = '((A:0.000000006,B:2.630569071000001)0.652:2.63,C:1e-9);'
    expect(serializeNewick(parseNewick(nwk))).toBe(nwk)
  })

  test('tolerates a tree with no trailing semicolon and a bare root', () => {
    expect(leafNames(parseNewick('(A:1,B:1)'))).toEqual(['A', 'B'])
  })

  test('throws on malformed input', () => {
    expect(() => parseNewick('((A,B);')).toThrow()
  })
})

describe('collapseToLoci', () => {
  // A1,A2 are sisters of locus A; B and C are singletons.
  const SISTER = parseNewick('((A1:0.1,A2:0.1)0.9:0.2,(B1:0.3,C1:0.3)0.8:0.2);')
  // A's two copies are DISPERSED (A1 with B1, A2 with C1).
  const DISPERSED = parseNewick('((A1:0.1,B1:0.1)0.9:0.2,(A2:0.3,C1:0.3)0.8:0.2);')
  const tandemOf = new Map([
    ['A1', 'A'],
    ['A2', 'A'],
    ['B1', 'B'],
    ['C1', 'C'],
  ])

  test('collapses a monophyletic locus clade to a single tandem-id leaf', () => {
    const c = collapseToLoci(SISTER, tandemOf)
    expect(leafNames(c).sort()).toEqual(['A', 'B', 'C']) // A1+A2 → one "A"
  })

  test('keeps dispersed copies as separate (relabeled) tips', () => {
    const c = collapseToLoci(DISPERSED, tandemOf)
    // A appears twice (dispersed), B and C once each.
    expect(leafNames(c).sort()).toEqual(['A', 'A', 'B', 'C'])
  })

  test('preserves the collapse-root branch length on the collapsed leaf', () => {
    const c = collapseToLoci(SISTER, tandemOf)
    const a = c.children.find((n) => n.name === 'A')
    expect(a?.length).toBe('0.2') // the clade-root branch, not a tip branch
  })

  test('relabels an unmapped leaf to its own name (never crashes)', () => {
    const c = collapseToLoci(parseNewick('(X1:1,Y1:1);'), new Map([['X1', 'X']]))
    expect(leafNames(c).sort()).toEqual(['X', 'Y1'])
  })
})

describe('tip metadata', () => {
  test('buildElementTipMeta is keyed by unique_name, one tree only', () => {
    const m = buildElementTipMeta(TIPS, 'main')
    const t = m.get('4LYU1SRI')
    expect(t).toMatchObject({ kind: 'element', tandem_id: 'T0001', ordinal: 1, specifier: 'LYS' })
    expect([...m.values()].every((x) => x.kind === 'element')).toBe(true)
  })

  test('buildLocusTipMeta aggregates a mixed locus into a joined specifier', () => {
    const tips: TreeTipsMap = {
      U1: { member_id: 'L.m1', tandem_id: 'L', ordinal: 1, specifier: 'ILE', phylum: 'Firmicutes', tree: 'main' },
      U2: { member_id: 'L.m2', tandem_id: 'L', ordinal: 2, specifier: 'LEU', phylum: 'Firmicutes', tree: 'main' },
      U3: { member_id: 'M.m1', tandem_id: 'M', ordinal: 1, specifier: '?', phylum: null, tree: 'main' },
    }
    const m = buildLocusTipMeta(tips, 'main')
    expect(m.get('L')).toMatchObject({ specifier: 'ILE;LEU', memberCount: 2, phylum: 'Firmicutes' })
    expect(m.get('M')).toMatchObject({ specifier: null, memberCount: 1, phylum: null })
  })
})

describe('color + support helpers', () => {
  test('specifierFill: single hue, mixed → first constituent, ?/null → grey', () => {
    expect(specifierFill('TRP')).toBe(aaColor('TRP'))
    expect(specifierFill('ILE;LEU')).toBe(aaColor('ILE'))
    expect(specifierFill('?')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(specifierFill(null)).toBe(UNKNOWN_SPECIFIER_COLOR)
  })

  test('isNonFirmicutes treats null/unassigned as an outlier', () => {
    expect(isNonFirmicutes('Firmicutes')).toBe(false)
    expect(isNonFirmicutes('Actinobacteria')).toBe(true)
    expect(isNonFirmicutes(null)).toBe(true)
  })

  test('parseSupport reads numeric labels, rejects tip names', () => {
    expect(parseSupport('0.652')).toBeCloseTo(0.652)
    expect(parseSupport('1')).toBe(1)
    expect(parseSupport('4LYU1SRI')).toBeNull()
    expect(parseSupport('')).toBeNull()
    expect(parseSupport(null)).toBeNull()
  })
})

// ── Real-artifact drift guards (conscious-update-on-change; PLAN §6, §5.4 gate#10) ──
describe('committed tree artifacts', () => {
  test('tree_tips.json: 949 tips, 847 main / 102 fallback / 0 absent', () => {
    const vals = Object.values(TIPS)
    expect(vals).toHaveLength(949)
    const by = (t: string): number => vals.filter((v) => v.tree === t).length
    expect(by('main')).toBe(847)
    expect(by('fallback')).toBe(102)
    expect(by('absent')).toBe(0)
  })

  test('main tree (tree.nwk): 847 element tips → 782 locus tips', () => {
    const root = parseNewick(NWK_MAIN)
    expect(countLeaves(root)).toBe(847) // == tree_tips main count (gate #10)
    const collapsed = collapseToLoci(root, tipTandemMap(TIPS, 'main'))
    expect(countLeaves(collapsed)).toBe(782)
    // every main tip is a known unique_name
    expect(leafNames(root).every((n) => TIPS[n]?.tree === 'main')).toBe(true)
  })

  test('fallback tree (tree_fallback.nwk): 102 element tips → 102 locus tips', () => {
    const root = parseNewick(NWK_FALLBACK)
    expect(countLeaves(root)).toBe(102)
    const collapsed = collapseToLoci(root, tipTandemMap(TIPS, 'fallback'))
    expect(countLeaves(collapsed)).toBe(102) // no collapsible clades in the fallback
    expect(leafNames(root).every((n) => TIPS[n]?.tree === 'fallback')).toBe(true)
  })

  test('buildElementTipMeta sizes match the per-tree tip counts', () => {
    expect(buildElementTipMeta(TIPS, 'main').size).toBe(847)
    expect(buildElementTipMeta(TIPS, 'fallback').size).toBe(102)
  })

  test('main tree spans 448 loci; collapse never invents or drops a locus', () => {
    const meta = buildLocusTipMeta(TIPS, 'main')
    expect(meta.size).toBe(448)
    const collapsedLoci = new Set(leafNames(collapseToLoci(parseNewick(NWK_MAIN), tipTandemMap(TIPS, 'main'))))
    expect([...collapsedLoci].every((L) => meta.has(L))).toBe(true)
    expect(collapsedLoci.size).toBe(448) // all 448 loci represented after collapse
  })
})
