// Component: the hatchlings-based Tandem architecture figure (PLAN §9①, §10.3). The vendored
// LinearMap renders for real (its math uses the width prop, no getBBox — jsdom-safe); only the
// published SequenceViewer / ZoomControls are stubbed. Pins the accuracy oracles carried onto the
// RNA-glyph overlay: per-element [data-feature] set + data-aa, the two-tone specifier tint on the
// element arrows, the Transcriptional-hairpin vs Translational-anti-SD split, the explicit overlap
// marker, the shared bp→x projection (overlay glyph x == linearMapBpToX), and the on-click sequence
// detail. The body capsule is the LinearMap arrow now, so .tv-arch-body must be ABSENT.
import { render } from '@testing-library/svelte'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@molbiohive/hatchlings', async () => ({
  SequenceViewer: (await import('../stubs/SequenceViewerStub.svelte')).default,
  ZoomControls: (await import('../stubs/ZoomControlsStub.svelte')).default,
}))

import TandemArchitecture from '../../src/lib/components/architecture/TandemArchitecture.svelte'
import { buildArchitecture } from '../../src/lib/architecture'
import { toLinearMapProps, linearMapBpToX } from '../../src/lib/architectureMap'
import { aaColor, FUNC_CLASS_SHADE } from '../../src/lib/color'
import { MEMBERS_BY_LOCUS } from '../fixtures'

const featureSet = (el: Element) =>
  new Set([...el.querySelectorAll('[data-feature]')].map((n) => n.getAttribute('data-feature')))

describe('TandemArchitecture', () => {
  test('renders one overlay element per member in 5′→3′ order, with no body rect (LinearMap draws it)', () => {
    const { container } = render(TandemArchitecture, {
      props: { members: MEMBERS_BY_LOCUS.get('T0002')!, strand: '+', funcClass: 'biosynthesis', downstreamGene: 'ilvD' },
    })
    const els = [...container.querySelectorAll('.tv-arch-element')]
    expect(els).toHaveLength(2)
    expect(els.map((e) => e.getAttribute('data-ordinal'))).toEqual(['1', '2'])
    // every present feature window draws its glyph
    expect(featureSet(els[0])).toEqual(new Set(['s1', 's1_loop', 'codon', 'antiterm', 'term', 'discrim']))
    // the body capsule is the LinearMap feature arrow now — no .tv-arch-body in the overlay
    expect(container.querySelector('.tv-arch-body')).toBeNull()
  })

  test('two-tone: each LinearMap element arrow is filled by its OWN specifier; the ORF is func chrome', () => {
    const { container } = render(TandemArchitecture, {
      props: { members: MEMBERS_BY_LOCUS.get('T0002')!, strand: '+', funcClass: 'biosynthesis', downstreamGene: 'ilvD' },
    })
    const fills = [...container.querySelectorAll('.linear-feature path')].map((p) => p.getAttribute('fill'))
    // forward features in parts order: element 1 (ILE), element 2 (LEU), downstream ORF.
    expect(fills[0]).toBe(aaColor('ILE'))
    expect(fills[1]).toBe(aaColor('LEU'))
    expect(fills[0]).not.toBe(fills[1])
    expect(fills[2]).toBe(FUNC_CLASS_SHADE.biosynthesis)
    // the AA chips echo the two-tone specifiers
    expect([...container.querySelectorAll('.tv-arch-element')].map((e) => e.getAttribute('data-aa'))).toEqual(['ILE', 'LEU'])
  })

  test('a Translational locus draws the anti-SD sequestrator, not a terminator hairpin', () => {
    const { container } = render(TandemArchitecture, {
      props: { members: MEMBERS_BY_LOCUS.get('T0004')!, strand: '+', funcClass: 'unknown' },
    })
    expect(container.querySelector('.tv-arch-term-sd')).toBeTruthy()
    expect(container.querySelector('.tv-arch-term-hairpin')).toBeNull()
  })

  test('overlapping element bodies render an explicit overlap marker (never a silent gap)', () => {
    // The T0002 fixture members share a leader window → their bodies overlap (gap < 0).
    const { container } = render(TandemArchitecture, {
      props: { members: MEMBERS_BY_LOCUS.get('T0002')!, strand: '+', funcClass: 'biosynthesis' },
    })
    const overlap = container.querySelector('.tv-arch-overlap')
    expect(overlap).toBeTruthy()
    expect(Number(overlap!.getAttribute('data-overlap'))).toBeGreaterThan(0)
  })

  test('overlay glyphs share the LinearMap bp→x projection (codon tick aligns to the strip)', () => {
    const members = MEMBERS_BY_LOCUS.get('T0002')!
    const model = buildArchitecture(members, '+')
    const { size } = toLinearMapProps(model, 'biosynthesis', 'ilvD')
    const { container } = render(TandemArchitecture, {
      props: { members, strand: '+', funcClass: 'biosynthesis', downstreamGene: 'ilvD' },
    })
    const width = Number(container.querySelector('.tv-arch-overlay')!.getAttribute('width'))
    const codon = model.elements[0].features.codon!
    const expectedX = linearMapBpToX((codon.start + codon.end) / 2, size, width)
    const codonLine = container.querySelector('.tv-arch-element [data-feature="codon"] line')!
    expect(Number(codonLine.getAttribute('x1'))).toBeCloseTo(expectedX, 1)
  })

  test('without context: a per-element SequenceViewer + the schematic-scale figure', () => {
    const members = MEMBERS_BY_LOCUS.get('T0002')!
    const { container } = render(TandemArchitecture, {
      props: { members, strand: '+', funcClass: 'biosynthesis', downstreamGene: 'ilvD' },
    })
    const seq = container.querySelector('[data-seqviewer]')
    expect(seq).toBeTruthy()
    expect(Number(seq!.getAttribute('data-seqlen'))).toBe(members[0].fasta_sequence.length)
    expect(container.querySelector('figure.tv-arch')!.getAttribute('data-arch-scale')).toBe('schematic')
  })

  test('with context: the SequenceViewer shows the whole-locus track (all elements) + the figure is to scale', () => {
    const members = MEMBERS_BY_LOCUS.get('T0002')!
    const seq = 'A'.repeat(1000)
    const context = {
      tandem_id: 'T0002', accession: 'ACC', strand: '+' as const, resolved: true,
      interval: [1, 1000] as [number, number], seq,
      elements: members.map((m, i) => ({ member_id: m.member_id, offset: i * 200, length: m.fasta_sequence.length })),
      downstream_genes: [{ name: 'ilvD', protein_id: 'P1', locus_tag: null, offset: 600, length: 300, strand: '+' as const, resolution: 'coded_by' }],
      warnings: [],
    }
    const { container } = render(TandemArchitecture, {
      props: { members, strand: '+', funcClass: 'biosynthesis', downstreamGene: 'ilvD', context },
    })
    const sv = container.querySelector('[data-seqviewer]')!
    // the track is the whole interval (not a single leader), and carries a part per element body +
    // its features + the gene (≥ members + 1)
    expect(Number(sv.getAttribute('data-seqlen'))).toBe(seq.length)
    expect(Number(sv.getAttribute('data-partcount'))).toBeGreaterThan(members.length)
    expect(container.querySelector('figure.tv-arch')!.getAttribute('data-arch-scale')).toBe('to-scale')
    // The fill-width zoom model drives the viewer by bases-per-row: charsPerRow is a real count at or
    // above the 20-bp max-zoom floor, drawn in the natural 10-px cell that the CSS zoom scales up.
    expect(Number(sv.getAttribute('data-charsperrow'))).toBeGreaterThanOrEqual(20)
    expect(Number(sv.getAttribute('data-charwidth'))).toBe(10)
  })

  test('the bases-per-row slider zooms in to the 20-bp max-zoom floor', async () => {
    const members = MEMBERS_BY_LOCUS.get('T0002')!
    const seq = 'A'.repeat(1500)
    const context = {
      tandem_id: 'T0002', accession: 'ACC', strand: '+' as const, resolved: true,
      interval: [1, 1500] as [number, number], seq,
      elements: members.map((m, i) => ({ member_id: m.member_id, offset: i * 200, length: m.fasta_sequence.length })),
      downstream_genes: [],
      warnings: [],
    }
    const { container } = render(TandemArchitecture, {
      props: { members, strand: '+', funcClass: 'biosynthesis', downstreamGene: 'ilvD', context },
    })
    const sv = () => container.querySelector('[data-seqviewer]')!
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    expect(Number(sv().getAttribute('data-charsperrow'))).toBeGreaterThanOrEqual(20)

    // The slider value is the bp-per-row MIRRORED about [lo, hi] (so rightward reads as "zoom in"),
    // hence its max maps to the 20-bp max-zoom floor.
    slider.value = slider.max
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    expect(Number(sv().getAttribute('data-charsperrow'))).toBe(20)
  })
})
