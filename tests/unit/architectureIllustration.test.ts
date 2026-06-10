// Unit: the pure SVG-glyph geometry helpers for the tandem-architecture figure. Pins the
// deterministic label-collision spreader used to keep the specifier AA chips from overlapping
// when two elements sit close on the axis (the figure must stay byte-stable for the visual
// baseline, so the spread is a pure function of the inputs — no randomness).
import { describe, expect, test } from 'vitest'
import { spreadLabelXs } from '../../src/lib/architectureIllustration'

describe('spreadLabelXs', () => {
  test('a lone or empty set is returned unchanged', () => {
    expect(spreadLabelXs([], 32)).toEqual([])
    expect(spreadLabelXs([100], 32)).toEqual([100])
  })

  test('well-separated centres are left exactly where they are', () => {
    expect(spreadLabelXs([100, 400], 32)).toEqual([100, 400])
    expect(spreadLabelXs([10, 60, 120], 30)).toEqual([10, 60, 120])
  })

  test('two too-close centres are pushed to minSep apart, straddling their requested xs', () => {
    // requested 100 & 110 (gap 10) → must end ≥ 32 apart; re-centred around the original pair.
    const out = spreadLabelXs([100, 110], 32)
    expect(out[1] - out[0]).toBeCloseTo(32, 6)
    // re-centred: the mean of the placed pair equals the mean of the requested pair.
    expect((out[0] + out[1]) / 2).toBeCloseTo(105, 6)
    expect(out[0]).toBeLessThan(100)
    expect(out[1]).toBeGreaterThan(110)
  })

  test('order is preserved and every adjacent gap clears minSep', () => {
    const out = spreadLabelXs([0, 5, 9], 20)
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(20 - 1e-6)
    // still ascending (no reordering of the original left→right sequence)
    expect(out[0]).toBeLessThan(out[1])
    expect(out[1]).toBeLessThan(out[2])
  })

  test('centres passed out of axis order are resolved by position, then written back in place', () => {
    // index 0 sits to the RIGHT of index 1; the spreader resolves overlaps left→right but returns
    // results in the caller's original slot order.
    const out = spreadLabelXs([110, 100], 32)
    expect(out[0]).toBeGreaterThan(out[1]) // slot 0 (x=110) is still right of slot 1 (x=100)
    expect(Math.abs(out[0] - out[1])).toBeCloseTo(32, 6)
  })

  test('a non-positive minSep is a no-op', () => {
    expect(spreadLabelXs([100, 101], 0)).toEqual([100, 101])
  })
})
