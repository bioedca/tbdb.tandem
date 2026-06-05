// Unit: reflow-free text measurement (responsive scaling — PLAN Workstream 1).
//
// Under vitest/jsdom there is no canvas 2D context, so `measure.ts` runs its
// off-canvas FALLBACK path (a glyph-count estimate). These tests pin the pure,
// deterministic CONTRACT of the sizing maths on that path — the guards, the
// [min,max] clamp, and the monotonic responses to width and target measure — which
// hold identically on the real canvas path (only the per-glyph advance differs).
import { describe, expect, test } from 'vitest'
import { fitFontSizePx, fitMeasureFontPx } from '../../src/lib/text/measure'

const FONT = '400 24px Inter' // probe shorthand; sizeOf() reads the 24px
const PROBE = 24

describe('fitMeasureFontPx', () => {
  const opts = { minPx: 16, maxPx: 26, targetChars: 90 }

  test('degenerate inputs fall back to the max size', () => {
    expect(fitMeasureFontPx('', FONT, PROBE, 1200, opts)).toBe(26)
    expect(fitMeasureFontPx('hello', FONT, PROBE, 0, opts)).toBe(26)
    expect(fitMeasureFontPx('hello', FONT, PROBE, 1200, { ...opts, targetChars: 0 })).toBe(26)
    expect(fitMeasureFontPx('hello', FONT, 0, 1200, opts)).toBe(26)
  })

  test('always returns a size within [minPx, maxPx]', () => {
    for (const boxW of [120, 400, 800, 1200, 1920, 4000]) {
      const size = fitMeasureFontPx('the quick brown fox jumps', FONT, PROBE, boxW, opts)
      expect(size).toBeGreaterThanOrEqual(opts.minPx)
      expect(size).toBeLessThanOrEqual(opts.maxPx)
    }
  })

  test('clamps to the max on a wide banner and the min on a narrow one', () => {
    expect(fitMeasureFontPx('the quick brown fox', FONT, PROBE, 4000, opts)).toBe(26)
    expect(fitMeasureFontPx('the quick brown fox', FONT, PROBE, 200, opts)).toBe(16)
  })

  test('grows the font as the column widens (constant-measure invariant)', () => {
    const text = 'the quick brown fox jumps over the lazy dog'
    let prev = 0
    for (const boxW of [300, 600, 900, 1200]) {
      const size = fitMeasureFontPx(text, FONT, PROBE, boxW, { ...opts, minPx: 1, maxPx: 200 })
      expect(size).toBeGreaterThanOrEqual(prev)
      prev = size
    }
  })

  test('asks for a smaller font as the target measure (chars/line) grows', () => {
    const text = 'the quick brown fox jumps over the lazy dog'
    const wide = fitMeasureFontPx(text, FONT, PROBE, 1200, { minPx: 1, maxPx: 200, targetChars: 60 })
    const narrow = fitMeasureFontPx(text, FONT, PROBE, 1200, { minPx: 1, maxPx: 200, targetChars: 120 })
    expect(narrow).toBeLessThan(wide)
  })

  test('counts by grapheme cluster, not UTF-16 code units (multi-codepoint glyphs)', () => {
    const wide = { minPx: 1, maxPx: 200, targetChars: 10 }
    // Three ASCII letters vs three emoji vs three ZWJ-family clusters are all 3 graphemes,
    // so they must size identically — proving naturalWidthPx and the divisor agree on units.
    // (A code-unit count would treat '👨‍👩‍👧‍👦' as ~25, sizing it ~25x too small.)
    const ascii = fitMeasureFontPx('abc', FONT, PROBE, 1200, wide)
    const emoji = fitMeasureFontPx('😀😀😀', FONT, PROBE, 1200, wide)
    const family = fitMeasureFontPx('👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦', FONT, PROBE, 1200, wide)
    expect(emoji).toBeCloseTo(ascii, 5)
    expect(family).toBeCloseTo(ascii, 5)
  })
})

describe('fitFontSizePx', () => {
  test('keeps the max size when the single line already fits', () => {
    expect(fitFontSizePx('470', FONT, 1000, { minPx: 12, maxPx: 36 })).toBe(36)
  })

  test('shrinks toward — but never below — minPx when the line would overflow', () => {
    const size = fitFontSizePx('a very long value that cannot fit', FONT, 40, { minPx: 14, maxPx: 36 })
    expect(size).toBeGreaterThanOrEqual(14)
    expect(size).toBeLessThanOrEqual(36)
  })
})
