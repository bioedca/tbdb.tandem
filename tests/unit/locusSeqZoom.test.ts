// Geometry for the full-locus sequence track's fill-width vertical-zoom model (locusSeqZoom).
// Pins the pure math: the deterministic row width, the library-faithful content-height predictor,
// and the fit/bounds/default derivation that turns a frame size into a [max-zoom, fit-whole]
// bases-per-row range. The predictor is additionally LOCKED against the real SequenceViewer's
// rendered svg height in tests/component/SequenceFitGeometry.test.ts.
import { describe, expect, test } from 'vitest'
import {
  rowWidthPx,
  countLanes,
  predictContentHeightPx,
  renderedHeightPx,
  fitBasesPerRow,
  basesPerRowBounds,
  defaultBasesPerRow,
  seqZoomAt,
  numbersVisibleAt,
  CHAR_CELL_PX,
  SEQ_PAD,
  MIN_BASES_PER_ROW,
  DEFAULT_BASES_PER_ROW,
  RULER_LABEL_PX,
  NUMBERS_MIN_LABEL_PX,
  type SeqGeometryInput,
} from '../../src/lib/locusSeqZoom'

const span = (start: number, end: number) => ({ start, end })

describe('rowWidthPx', () => {
  test('is the library svgWidth: 2·SEQ_PAD + n·charWidth', () => {
    expect(rowWidthPx(20)).toBe(2 * SEQ_PAD + 20 * CHAR_CELL_PX)
    expect(rowWidthPx(20)).toBe(224)
    expect(rowWidthPx(60)).toBe(624)
  })
})

describe('countLanes (faithful to hatchlings util/coordinates)', () => {
  test('overlapping intervals stack into separate lanes', () => {
    expect(countLanes([span(0, 10), span(5, 15), span(12, 20)])).toBe(2)
  })
  test('abutting/non-overlapping intervals pack into one lane', () => {
    expect(countLanes([span(0, 5), span(5, 10), span(10, 15)])).toBe(1)
  })
  test('empty → 0', () => {
    expect(countLanes([])).toBe(0)
  })
})

describe('predictContentHeightPx', () => {
  test('matches a hand-computed two-row layout (8 + Σ rowH + 4·rows)', () => {
    const data: SeqGeometryInput = {
      seq: 'A'.repeat(50),
      parts: [span(0, 50)], // one body spanning both rows → 1 annotation lane each
      translations: [span(10, 13)], // only in row 0
    }
    // row0 [0,25): 16+14 + (18+4) + 24 = 76 ; row1 [25,50): 16+14 + (18+4) = 52
    // total = 8 + (76+52) + 4·2 = 144
    expect(predictContentHeightPx(data, 25, { showNumbers: true, showComplement: false, showTranslations: true })).toBe(
      144,
    )
  })

  test('hiding numbers drops the 16 px ruler from every row', () => {
    const data: SeqGeometryInput = { seq: 'A'.repeat(40), parts: [], translations: [] }
    const withNums = predictContentHeightPx(data, 20, { showNumbers: true })
    const noNums = predictContentHeightPx(data, 20, { showNumbers: false })
    expect(withNums - noNums).toBe(16 * 2) // 2 rows
  })

  test('empty sequence collapses to the top inset + trailing pad', () => {
    expect(predictContentHeightPx({ seq: '', parts: [], translations: [] }, 20)).toBe(8 + 4)
  })
})

describe('fitBasesPerRow / basesPerRowBounds', () => {
  // A realistic-ish locus: a long interval with a couple of element bodies + their codons.
  const locus: SeqGeometryInput = {
    seq: 'A'.repeat(2000),
    parts: [span(100, 350), span(900, 1150), span(120, 123), span(920, 923)],
    translations: [span(120, 123), span(920, 923)],
  }
  const frameW = 900
  const frameH = 520

  test('the fit value actually fits the window, and one notch fewer does not', () => {
    const hi = fitBasesPerRow(locus, frameW, frameH)
    expect(hi).toBeGreaterThan(MIN_BASES_PER_ROW)
    expect(renderedHeightPx(locus, hi, frameW)).toBeLessThanOrEqual(frameH)
    // hi is the FIRST n (scanning up) that fits → hi-1 overflows the (safety-trimmed) budget.
    expect(renderedHeightPx(locus, hi - 1, frameW)).toBeGreaterThan(frameH - 4)
  })

  test('a shorter window needs more bases per row (smaller text) to fit', () => {
    expect(fitBasesPerRow(locus, frameW, 320)).toBeGreaterThan(fitBasesPerRow(locus, frameW, 720))
  })

  test('bounds.lo is the 60-bp max-zoom floor; hi is the fit value', () => {
    const b = basesPerRowBounds(locus, frameW, frameH)
    expect(b.lo).toBe(MIN_BASES_PER_ROW)
    expect(b.hi).toBe(fitBasesPerRow(locus, frameW, frameH))
    expect(b.hi).toBeGreaterThanOrEqual(b.lo)
  })

  test('a tiny sequence shorter than the max-zoom floor collapses the range (hi == lo)', () => {
    // A sequence shorter than the 60 bp/row max-zoom floor is clamped to its own length (lo = seqLen),
    // so there is nothing to zoom out to; a normal leader (≥ ~100 nt) stays zoomable. 24 nt collapses.
    const tiny: SeqGeometryInput = { seq: 'A'.repeat(24), parts: [span(0, 24)], translations: [] }
    const b = basesPerRowBounds(tiny, frameW, frameH)
    expect(b.hi).toBe(b.lo) // whole sequence visible at max zoom; nothing to zoom out to
  })

  test('degenerate frame (unmeasured) falls back to the max-zoom floor', () => {
    const b = basesPerRowBounds(locus, 0, 0)
    expect(b).toEqual({ lo: MIN_BASES_PER_ROW, hi: MIN_BASES_PER_ROW })
  })
})

describe('defaultBasesPerRow', () => {
  test('opens at the mid-level density when the locus is long', () => {
    expect(defaultBasesPerRow({ lo: 20, hi: 200 })).toBe(DEFAULT_BASES_PER_ROW)
  })
  test('clamps down to the fit value when the whole locus fits below the default', () => {
    expect(defaultBasesPerRow({ lo: 20, hi: 40 })).toBe(40)
  })
  test('clamps to lo when the range has collapsed', () => {
    expect(defaultBasesPerRow({ lo: 20, hi: 20 })).toBe(20)
  })
})

describe('seqZoomAt / numbersVisibleAt (low-zoom ruler thinning)', () => {
  test('seqZoomAt is the fill factor frameW / rowWidthPx(n)', () => {
    expect(seqZoomAt(20, rowWidthPx(20))).toBeCloseTo(1, 6)
    expect(seqZoomAt(60, 2 * rowWidthPx(60))).toBeCloseTo(2, 6)
  })

  test('numbers stay at high zoom (large bases) and drop at low zoom (tiny bases)', () => {
    const frameW = 900
    expect(numbersVisibleAt(20, frameW)).toBe(true) // 20 bp/row → big text
    expect(numbersVisibleAt(200, frameW)).toBe(false) // 200 bp/row → ruler labels illegible
  })

  test('the threshold is exactly the ruler-label legibility floor', () => {
    const frameW = 900
    // visible ⇔ RULER_LABEL_PX · seqZoom ≥ NUMBERS_MIN_LABEL_PX ⇔ seqZoom ≥ floor ratio
    const ratio = NUMBERS_MIN_LABEL_PX / RULER_LABEL_PX
    for (const n of [20, 40, 60, 90, 120, 160, 220]) {
      expect(numbersVisibleAt(n, frameW)).toBe(seqZoomAt(n, frameW) >= ratio)
    }
  })

  test('falls back to visible before the frame is measured', () => {
    expect(numbersVisibleAt(60, 0)).toBe(true)
  })
})

describe("fitBasesPerRow with showNumbers: 'auto'", () => {
  const locus: SeqGeometryInput = {
    seq: 'A'.repeat(2000),
    parts: [span(100, 350), span(900, 1150)],
    translations: [span(120, 123), span(920, 923)],
  }
  const frameW = 900
  const frameH = 520

  test('auto fits at fewer (or equal) bases per row than forcing numbers on', () => {
    // Auto hides the ruler at low zoom, shortening rows, so the whole locus fits with larger text.
    const hiTrue = basesPerRowBounds(locus, frameW, frameH, { showNumbers: true }).hi
    const hiAuto = basesPerRowBounds(locus, frameW, frameH, { showNumbers: 'auto' }).hi
    expect(hiAuto).toBeLessThanOrEqual(hiTrue)
  })

  test('the auto fit value genuinely fits once its own ruler visibility is applied', () => {
    const hiAuto = fitBasesPerRow(locus, frameW, frameH, { showNumbers: 'auto' })
    const showAtFit = numbersVisibleAt(hiAuto, frameW)
    expect(renderedHeightPx(locus, hiAuto, frameW, { showNumbers: showAtFit })).toBeLessThanOrEqual(frameH)
  })
})
