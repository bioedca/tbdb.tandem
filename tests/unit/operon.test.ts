// Unit: the regulated-operon models (PLAN §10.2, §9③, §5.3). Pure folding on the
// fixtures — the func_class × func_source crosstab, the bipartite specifier→func_class
// Sankey node indexing (`target = specs.length + fcIndex`), `?`-last ordering, the
// chip counts, the specifier node-color rule — plus real-artifact drift guards over
// loci.json pinning the S2.5 totals + the expected biological couplings.
import { describe, expect, test } from 'vitest'
import {
  buildOperonBars,
  buildSankey,
  specifierKey,
  specifierNodeColor,
  typeCounts,
  type SankeyModel,
} from '../../src/lib/operon'
import { aaColor, FUNC_CLASS_SHADE, UNKNOWN_SPECIFIER_COLOR } from '../../src/lib/color'
import type { LociFile } from '../../src/lib/data/types'
import { LOCI } from '../fixtures'
import lociJson from '../../public/data/loci.json'

/** Flow value for a (specifier, func_class) pair in a Sankey model (0 if absent). */
function linkValue(m: SankeyModel, spec: string, fc: string): number {
  const si = m.nodes.findIndex((n) => n.kind === 'specifier' && n.label === spec)
  const ti = m.nodes.findIndex((n) => n.kind === 'func_class' && n.label === fc)
  return m.links.find((l) => l.source === si && l.target === ti)?.value ?? 0
}

describe('buildOperonBars (fixtures)', () => {
  const bars = buildOperonBars(LOCI, LOCI)

  test('bar axis is func_class frequency-desc (alpha tiebreak)', () => {
    expect(bars.funcClasses).toEqual(['biosynthesis', 'aaRS', 'oxidoreductase', 'transporter', 'unknown'])
  })

  test('the EC / text / none crosstab is exact', () => {
    expect(bars.counts.EC).toEqual([1, 1, 1, 0, 0]) // T0005, T0001, T0006
    expect(bars.counts.text).toEqual([1, 0, 0, 1, 0]) // T0002, T0003
    expect(bars.counts.none).toEqual([0, 0, 0, 0, 1]) // T0004
    expect(bars.totals).toEqual([2, 1, 1, 1, 1])
    expect(bars.maxTotal).toBe(2)
  })

  test('axis stays stable while counts narrow to the selection', () => {
    const narrowed = buildOperonBars(LOCI, [LOCI[1]]) // only T0002 (biosynthesis, text)
    expect(narrowed.funcClasses).toEqual(bars.funcClasses)
    expect(narrowed.counts.text).toEqual([1, 0, 0, 0, 0])
    expect(narrowed.totals).toEqual([1, 0, 0, 0, 0])
  })
})

describe('buildSankey (fixtures)', () => {
  const s = buildSankey(LOCI)

  test('bipartite nodes: specifiers first (?-last), then func_classes', () => {
    expect(s.nodes).toHaveLength(10)
    expect(s.nodes.slice(0, 5).map((n) => n.kind)).toEqual(Array(5).fill('specifier'))
    expect(s.nodes.slice(5).map((n) => n.kind)).toEqual(Array(5).fill('func_class'))
    expect(s.nodes.slice(0, 5).map((n) => n.label)).toEqual(['TRP', 'ALA;VAL', 'ILE;LEU', 'THR', '?'])
  })

  test('one link per observed (specifier, func_class) co-occurrence; Σ = loci', () => {
    expect(s.links).toHaveLength(6)
    expect(s.links.reduce((a, l) => a + l.value, 0)).toBe(LOCI.length)
    // node indexing: TRP(0) splits to aaRS + biosynthesis (T0001, T0005)
    expect(linkValue(s, 'TRP', 'aaRS')).toBe(1)
    expect(linkValue(s, 'TRP', 'biosynthesis')).toBe(1)
    expect(linkValue(s, 'ILE;LEU', 'biosynthesis')).toBe(1)
  })

  test('func_class nodes use the chrome shade; specifier nodes the data palette', () => {
    const bio = s.nodes.find((n) => n.label === 'biosynthesis')!
    expect(bio.color).toBe(FUNC_CLASS_SHADE.biosynthesis)
    const trp = s.nodes.find((n) => n.label === 'TRP')!
    expect(trp.color).toBe(aaColor('TRP'))
  })

  test('an empty selection yields no nodes or links', () => {
    const empty = buildSankey([])
    expect(empty.nodes).toEqual([])
    expect(empty.links).toEqual([])
  })
})

describe('specifierNodeColor / specifierKey / typeCounts', () => {
  test('specifier node color: single hue, mixed→first constituent, `?`→grey', () => {
    expect(specifierNodeColor('TRP')).toBe(aaColor('TRP'))
    expect(specifierNodeColor('ILE;LEU')).toBe(aaColor('ILE')) // first constituent
    expect(specifierNodeColor('?')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(specifierNodeColor(null)).toBe(UNKNOWN_SPECIFIER_COLOR)
  })

  test('specifierKey uses the `?` sentinel for a null specifier_aa', () => {
    expect(specifierKey(LOCI[3])).toBe('?') // T0004
    expect(specifierKey(LOCI[0])).toBe('TRP')
  })

  test('typeCounts is in the fixed Transcriptional→Translational order', () => {
    expect(typeCounts(LOCI)).toEqual([
      { type: 'Transcriptional', count: 5 },
      { type: 'Translational', count: 1 },
    ])
  })
})

// ── Real-artifact drift guards (mirror data-pipeline/tests/test_artifacts.py) ─────
describe('committed loci.json — S2.5 operon totals + couplings', () => {
  const loci = (lociJson as unknown as LociFile).loci
  const bars = buildOperonBars(loci, loci)
  const sankey = buildSankey(loci)

  test('func_class totals [224,101,68,63,14] (freq-desc)', () => {
    expect(bars.funcClasses).toEqual(['biosynthesis', 'unknown', 'transporter', 'aaRS', 'oxidoreductase'])
    expect(bars.totals).toEqual([224, 101, 68, 63, 14])
  })

  test('the two-tier provenance crosstab sums to 106 EC / 284 text / 80 none', () => {
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
    expect(sum(bars.counts.EC)).toBe(106)
    expect(sum(bars.counts.text)).toBe(284)
    expect(sum(bars.counts.none)).toBe(80)
  })

  test('Sankey: 32 nodes (27 specifiers + 5 func_class), Σ flows = 470', () => {
    expect(sankey.nodes.filter((n) => n.kind === 'specifier')).toHaveLength(27)
    expect(sankey.nodes.filter((n) => n.kind === 'func_class')).toHaveLength(5)
    expect(sankey.links.reduce((a, l) => a + l.value, 0)).toBe(470)
  })

  test('the expected couplings (TRP→biosynthesis 118, THR→aaRS 30, LEU/ILE;LEU→biosynthesis)', () => {
    expect(linkValue(sankey, 'TRP', 'biosynthesis')).toBe(118)
    expect(linkValue(sankey, 'THR', 'aaRS')).toBe(30)
    expect(linkValue(sankey, 'LEU', 'biosynthesis')).toBe(26)
    expect(linkValue(sankey, 'ILE;LEU', 'biosynthesis')).toBe(6)
  })

  test('regulation type is 467 Transcriptional / 3 Translational', () => {
    expect(typeCounts(loci)).toEqual([
      { type: 'Transcriptional', count: 467 },
      { type: 'Translational', count: 3 },
    ])
  })
})
