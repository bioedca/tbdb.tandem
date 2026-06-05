// Component: R2dtDiagram (PLAN §9). Pure presentational SVG — given a committed
// R2DT diagram (coords + base pairs) and the member's stem spans, it draws one
// nucleotide per residue colored by structural domain from the shared color.ts
// palette. No fetch / no fornac here; that wiring is covered in RnaStructureR2dt.
import { render } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import R2dtDiagram from '../../src/lib/components/R2dtDiagram.svelte'
import { STEM_COLORS, STEM_LINKER_COLOR } from '../../src/lib/color'
import type { R2dtDiagram as R2dtDiagramData } from '../../src/lib/r2dt'

const diagram: R2dtDiagramData = {
  seq: 'ACGUACGU',
  x: [0, 12, 24, 36, 48, 60, 72, 84],
  y: [0, 0, 0, 0, 0, 0, 0, 0],
  pairs: [[1, 8]],
  template: 'T-box',
  source: 'Rfam',
}

describe('R2dtDiagram', () => {
  test('draws one nucleotide circle per residue and a labelled SVG', () => {
    const { container } = render(R2dtDiagram, { props: { diagram, stems: [] } })
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('aria-label')).toMatch(/R2DT/)
    expect(container.querySelectorAll('circle')).toHaveLength(diagram.seq.length)
  })

  test('colors each nucleotide by its structural domain (the same palette as fornac)', () => {
    const { container } = render(R2dtDiagram, {
      props: { diagram, stems: [{ key: 'i', start: 1, end: 3 }] },
    })
    const circles = [...container.querySelectorAll('circle')]
    // positions 1..3 are Stem I; the rest are linker grey (1-based stems → 0-based DOM)
    expect(circles[0].getAttribute('fill')).toBe(STEM_COLORS.i)
    expect(circles[2].getAttribute('fill')).toBe(STEM_COLORS.i)
    expect(circles[3].getAttribute('fill')).toBe(STEM_LINKER_COLOR)
  })

  test('draws a line for each base pair', () => {
    const { container } = render(R2dtDiagram, { props: { diagram, stems: [] } })
    // the single base pair [1,8] connects the first and last nucleotide centres
    const lines = [...container.querySelectorAll('line')]
    const bp = lines.find(
      (l) => l.getAttribute('x1') === '0' && l.getAttribute('x2') === '84',
    )
    expect(bp).toBeTruthy()
  })
})
