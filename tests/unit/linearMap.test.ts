// Unit: the shared bp→x projection. This pure mirror of the vendored LinearMap's internal `bpToX`
// is what the glyph overlay uses, so it must stay byte-identical to the strip's math.
import { describe, expect, test } from 'vitest'
import { linearMapBpToX } from '../../src/lib/architectureMap'

describe('linearMapBpToX', () => {
  // width 1000, margins 20 each → backbone width 960.
  test('bp 0 lands at the left margin', () => {
    expect(linearMapBpToX(0, 100, 1000)).toBe(20)
  })
  test('bp = size lands at the right margin', () => {
    expect(linearMapBpToX(100, 100, 1000)).toBe(980) // 20 + 1.0 * 960
  })
  test('the midpoint lands at the backbone centre', () => {
    expect(linearMapBpToX(50, 100, 1000)).toBe(500) // 20 + 0.5 * 960
  })
  test('a zero size is guarded (returns the left margin, not NaN)', () => {
    expect(linearMapBpToX(42, 0, 1000)).toBe(20)
  })
})
