// LOCK TEST (§9): the fill-width zoom math in locusSeqZoom predicts the laid-out content height so it
// can solve the min-zoom "whole locus fits" bound WITHOUT a render-measure loop. That predictor
// mirrors @molbiohive/hatchlings' private estimateRowHeight/totalSvgHeight, so it can silently drift
// if the library changes. This renders the REAL SequenceViewer (no stub) exactly as TandemArchitecture
// does and asserts the rendered <svg> height equals predictContentHeightPx — if hatchlings changes its
// row geometry, this fails loudly instead of the locus view quietly mis-fitting.
import { render } from '@testing-library/svelte'
import { describe, expect, test } from 'vitest'
import { SequenceViewer } from '@molbiohive/hatchlings'
import { predictContentHeightPx, CHAR_CELL_PX } from '../../src/lib/locusSeqZoom'

const body = (start: number, end: number) => ({
  id: `p${start}`,
  name: 'tbox',
  type: 'tbox',
  start,
  end,
  strand: 1 as const,
  color: '#888',
  label: 'tbox',
})

const data = {
  seq: 'ACGT'.repeat(40), // 160 nt
  parts: [body(0, 160), body(20, 70)], // overlapping bodies → 2 annotation lanes where they cross
  cutSites: [],
  translations: [{ start: 30, end: 33, strand: 1 as const, aminoAcids: 'M' }],
  alphabet: 'rna' as const,
  topology: 'linear' as const,
}

describe('SequenceViewer rendered height == locusSeqZoom predictor', () => {
  for (const n of [20, 40, 200]) {
    test(`numbers on, charsPerRow=${n}`, () => {
      const { container } = render(SequenceViewer, {
        props: {
          data,
          charsPerRow: n,
          charWidth: CHAR_CELL_PX,
          showComplement: false,
          showNumbers: true,
          showTranslations: true, // explicit: don't rely on the library default the predictor assumes
          height: 50000,
        },
      })
      const svg = container.querySelector('svg.hatch-sequence-svg')!
      const rendered = Number(svg.getAttribute('height'))
      expect(rendered).toBe(
        predictContentHeightPx(data, n, { showNumbers: true, showComplement: false, showTranslations: true }),
      )
    })
  }

  test('numbers off drops the ruler band (locks the PR2 / no-numbers state too)', () => {
    const n = 40
    const { container } = render(SequenceViewer, {
      props: {
        data,
        charsPerRow: n,
        charWidth: CHAR_CELL_PX,
        showComplement: false,
        showNumbers: false,
        showTranslations: true, // explicit: don't rely on the library default the predictor assumes
        height: 50000,
      },
    })
    const svg = container.querySelector('svg.hatch-sequence-svg')!
    expect(Number(svg.getAttribute('height'))).toBe(
      predictContentHeightPx(data, n, { showNumbers: false, showComplement: false, showTranslations: true }),
    )
  })
})
