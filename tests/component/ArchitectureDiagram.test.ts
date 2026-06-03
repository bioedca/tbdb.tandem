// Component: ArchitectureDiagram (PLAN §10.3, §9①). The signature view is pure SVG
// (D3 only for the position scale, which is pure math → works in jsdom; no Plotly),
// so it renders directly. Asserts the correct glyph set per element, the biological
// 5′→3′ ordinal order, two-tone tinting on a mixed locus, triples, and the
// Translational anti-SD sequestrator variant.
import { render } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import ArchitectureDiagram from '../../src/lib/components/ArchitectureDiagram.svelte'
import { aaColor } from '../../src/lib/color'
import { MEMBERS_BY_LOCUS } from '../fixtures'

/** The set of `data-feature` glyph names drawn inside one element group. */
function featureSet(el: Element): Set<string> {
  return new Set([...el.querySelectorAll('[data-feature]')].map((e) => e.getAttribute('data-feature')!))
}

describe('ArchitectureDiagram', () => {
  test('a pair renders one element group per member in 5′→3′ ordinal order', () => {
    const { container } = render(ArchitectureDiagram, {
      props: { members: MEMBERS_BY_LOCUS.get('T0002')!, strand: '+', funcClass: 'biosynthesis', funcSource: 'text', downstreamGene: 'ilvD' },
    })
    const els = [...container.querySelectorAll('.tv-arch-element')]
    expect(els).toHaveLength(2)
    expect(els.map((e) => e.getAttribute('data-ordinal'))).toEqual(['1', '2'])
  })

  test('each element draws the full glyph set present in its windows', () => {
    const { container } = render(ArchitectureDiagram, {
      props: { members: MEMBERS_BY_LOCUS.get('T0002')!, strand: '+', funcClass: 'biosynthesis' },
    })
    const el0 = container.querySelector('.tv-arch-element')!
    // every fixture window is valid + in range → all six per-element glyphs draw.
    expect(featureSet(el0)).toEqual(new Set(['s1', 's1_loop', 'codon', 'antiterm', 'term', 'discrim']))
    // the body (the tbox) is its own rect, tinted — not a [data-feature] glyph.
    expect(el0.querySelector('.tv-arch-body')).toBeTruthy()
  })

  test('a mixed locus reads two-tone: each element tinted by its OWN specifier', () => {
    const { container } = render(ArchitectureDiagram, {
      props: { members: MEMBERS_BY_LOCUS.get('T0002')!, strand: '+', funcClass: 'biosynthesis' },
    })
    const els = [...container.querySelectorAll('.tv-arch-element')]
    expect(els.map((e) => e.getAttribute('data-aa'))).toEqual(['ILE', 'LEU'])
    const fills = els.map((e) => e.querySelector('.tv-arch-body')!.getAttribute('fill'))
    expect(fills).toEqual([aaColor('ILE'), aaColor('LEU')])
    expect(fills[0]).not.toBe(fills[1]) // genuinely two distinct tints
  })

  test('a triple renders three elements in ordinal order', () => {
    const { container } = render(ArchitectureDiagram, {
      props: { members: MEMBERS_BY_LOCUS.get('T0005')!, strand: '+', funcClass: 'biosynthesis' },
    })
    const els = [...container.querySelectorAll('.tv-arch-element')]
    expect(els.map((e) => e.getAttribute('data-ordinal'))).toEqual(['1', '2', '3'])
    expect(els.map((e) => e.getAttribute('data-aa'))).toEqual(['TRP', 'ILE', 'LEU'])
  })

  test('a Translational locus draws the anti-SD sequestrator (not a hairpin), null spec → `?`', () => {
    const { container } = render(ArchitectureDiagram, {
      props: { members: MEMBERS_BY_LOCUS.get('T0004')!, strand: '+', funcClass: 'unknown' },
    })
    expect(container.querySelector('.tv-arch-term-sd')).toBeTruthy()
    expect(container.querySelector('.tv-arch-term-hairpin')).toBeNull()
    expect(container.querySelector('[data-aa="?"]')).toBeTruthy() // the null-specifier element
  })
})
