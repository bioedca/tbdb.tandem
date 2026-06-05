// Unit: the specifier color map + color math (PLAN §10.2, §8.2). Pure logic, no
// DOM. Covers AA→hex, `?`/null→grey, the mixed 45° two-tone, `withAlpha`, the
// HSL/RGB helpers, and the chrome⟂data disjointness margins that gate §8.2.
import { describe, expect, test } from 'vitest'
import {
  FEATURE_OVERLAY_META,
  FEATURE_PARENT,
  MIN_BRAND_DATA_HUE_GAP,
  PHYLUM_DEFAULT_COLOR,
  SPECIFIER_COLORS,
  STEM_COLORS,
  STEM_LINKER_COLOR,
  UNKNOWN_SPECIFIER_COLOR,
  aaColor,
  assertChromeDataDisjoint,
  buildStemColorMap,
  featurePositions,
  featureShade,
  hexToHsl,
  hexToRgb,
  hslToHex,
  hueDistance,
  isMixed,
  phylumColor,
  rgbDistance,
  specifierColors,
  splitSpecifier,
  swatchBackground,
  withAlpha,
} from '../../src/lib/color'

describe('aaColor', () => {
  test('maps a known amino acid to its exact palette hex', () => {
    expect(aaColor('TRP')).toBe('#9333ea')
    expect(aaColor('ILE')).toBe('#4d7c0f')
    expect(aaColor('LEU')).toBe('#16a34a')
    expect(aaColor('THR')).toBe('#ea580c')
  })

  test('is case-insensitive and trims', () => {
    expect(aaColor('trp')).toBe('#9333ea')
    expect(aaColor('  Ile ')).toBe('#4d7c0f')
  })

  test('returns the neutral grey for `?`, unknown, empty, or null', () => {
    expect(aaColor('?')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(aaColor('XYZ')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(aaColor('')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(aaColor(null)).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(aaColor(undefined)).toBe(UNKNOWN_SPECIFIER_COLOR)
  })
})

describe('the palette itself', () => {
  test('has 20 amino acids, each a valid 6-digit hex', () => {
    const entries = Object.values(SPECIFIER_COLORS)
    expect(entries).toHaveLength(20)
    for (const hex of entries) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('every specifier color is distinct (no two AAs collide)', () => {
    const set = new Set(Object.values(SPECIFIER_COLORS).map((c) => c.toLowerCase()))
    expect(set.size).toBe(20)
  })

  test('the unknown grey is not one of the 20 data hues', () => {
    expect(Object.values(SPECIFIER_COLORS)).not.toContain(UNKNOWN_SPECIFIER_COLOR)
  })
})

describe('splitSpecifier', () => {
  test('splits a mixed specifier on `;` and normalizes', () => {
    expect(splitSpecifier('ILE;LEU')).toEqual(['ILE', 'LEU'])
    expect(splitSpecifier(' ile ; leu ')).toEqual(['ILE', 'LEU'])
  })

  test('drops empty tokens', () => {
    expect(splitSpecifier('A;;B')).toEqual(['A', 'B'])
  })

  test('a single specifier yields one token; null/empty yield none', () => {
    expect(splitSpecifier('TRP')).toEqual(['TRP'])
    expect(splitSpecifier(null)).toEqual([])
    expect(splitSpecifier('')).toEqual([])
    expect(splitSpecifier(undefined)).toEqual([])
  })
})

describe('isMixed', () => {
  test('true only when >1 distinct non-`?` specifier', () => {
    expect(isMixed('ILE;LEU')).toBe(true)
    expect(isMixed('ILE;LEU;VAL')).toBe(true)
  })

  test('false for single, repeated, `?`-paired, or null', () => {
    expect(isMixed('TRP')).toBe(false)
    expect(isMixed('TRP;TRP')).toBe(false)
    expect(isMixed('?;TRP')).toBe(false)
    expect(isMixed(null)).toBe(false)
    expect(isMixed('')).toBe(false)
  })
})

describe('specifierColors', () => {
  test('one color for a single specifier, ordered constituents for a mixed one', () => {
    expect(specifierColors('TRP')).toEqual(['#9333ea'])
    expect(specifierColors('ILE;LEU')).toEqual(['#4d7c0f', '#16a34a'])
  })

  test('null collapses to the single neutral grey', () => {
    expect(specifierColors(null)).toEqual([UNKNOWN_SPECIFIER_COLOR])
  })
})

describe('swatchBackground (PLAN §8.2 mixed = 45° two-tone)', () => {
  test('a single specifier is a solid color', () => {
    expect(swatchBackground('TRP')).toBe('#9333ea')
    expect(swatchBackground('?')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(swatchBackground(null)).toBe(UNKNOWN_SPECIFIER_COLOR)
  })

  test('a mixed specifier is a 45° hard-stop two-tone of its constituents', () => {
    const bg = swatchBackground('ILE;LEU')
    expect(bg).toContain('linear-gradient(45deg,')
    expect(bg).toContain('#4d7c0f 0.000% 50.000%')
    expect(bg).toContain('#16a34a 50.000% 100.000%')
  })

  test('the angle is configurable', () => {
    expect(swatchBackground('ILE;LEU', 90)).toContain('linear-gradient(90deg,')
  })
})

describe('phylumColor', () => {
  test('maps a known phylum, falls back to the neutral default otherwise', () => {
    expect(phylumColor('Firmicutes')).toBe('#cbd5e1')
    expect(phylumColor('Nonexistent')).toBe(PHYLUM_DEFAULT_COLOR)
    expect(phylumColor(null)).toBe(PHYLUM_DEFAULT_COLOR)
    expect(phylumColor(undefined)).toBe(PHYLUM_DEFAULT_COLOR)
  })
})

describe('hexToRgb', () => {
  test('parses a 6-digit hex', () => {
    expect(hexToRgb('#9333ea')).toEqual({ r: 147, g: 51, b: 234 })
    expect(hexToRgb('#0f766e')).toEqual({ r: 15, g: 118, b: 110 })
  })

  test('expands a 3-digit shorthand', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 255, g: 255, b: 255 })
  })

  test('throws on malformed input', () => {
    expect(() => hexToRgb('nope')).toThrow()
    expect(() => hexToRgb('#12345')).toThrow()
  })
})

describe('hexToHsl', () => {
  test('achromatic inputs have zero saturation', () => {
    expect(hexToHsl('#ffffff')).toEqual({ h: 0, s: 0, l: 1 })
    expect(hexToHsl('#000000')).toEqual({ h: 0, s: 0, l: 0 })
    const grey = hexToHsl('#808080')
    expect(grey.s).toBe(0)
    expect(grey.l).toBeCloseTo(0.502, 2)
  })

  test('primary hues land where expected', () => {
    expect(hexToHsl('#ff0000').h).toBeCloseTo(0, 5)
    expect(hexToHsl('#00ff00').h).toBeCloseTo(120, 5)
    expect(hexToHsl('#0000ff').h).toBeCloseTo(240, 5)
    expect(hexToHsl('#ff0000').s).toBeCloseTo(1, 5)
  })
})

describe('hueDistance', () => {
  test('takes the shortest way around the wheel', () => {
    expect(hueDistance(10, 350)).toBeCloseTo(20, 5)
    expect(hueDistance(350, 10)).toBeCloseTo(20, 5)
    expect(hueDistance(0, 180)).toBeCloseTo(180, 5)
    expect(hueDistance(100, 100)).toBe(0)
  })
})

describe('rgbDistance', () => {
  test('zero for identical, maximal for black↔white', () => {
    expect(rgbDistance('#000000', '#000000')).toBe(0)
    expect(rgbDistance('#000000', '#ffffff')).toBeCloseTo(441.67, 1)
  })
})

describe('withAlpha', () => {
  test('produces an rgba() string', () => {
    expect(withAlpha('#0f766e', 0.25)).toBe('rgba(15, 118, 110, 0.25)')
    expect(withAlpha('#000000', 1)).toBe('rgba(0, 0, 0, 1)')
  })
})

describe('hslToHex / featureShade (conserved-motif overlay, PLAN §9)', () => {
  test('hslToHex round-trips hexToHsl on the stem palette', () => {
    for (const hex of Object.values(STEM_COLORS)) {
      const { h, s, l } = hexToHsl(hex)
      expect(hslToHex(h, s, l)).toBe(hex)
    }
  })

  test('featureShade keeps the hue but is deeper + more saturated than the stem', () => {
    for (const hex of Object.values(STEM_COLORS)) {
      const base = hexToHsl(hex)
      const shade = hexToHsl(featureShade(hex))
      expect(hueDistance(shade.h, base.h)).toBeLessThan(2) // same hue family
      expect(shade.l).toBeLessThan(base.l) // deeper
      expect(shade.s).toBeGreaterThan(base.s) // more saturated
    }
  })

  test('FEATURE_OVERLAY_META swatches are the shade of their parent stem', () => {
    for (const f of FEATURE_OVERLAY_META) {
      expect(f.color).toBe(featureShade(STEM_COLORS[FEATURE_PARENT[f.key]]))
    }
    expect(FEATURE_OVERLAY_META.map((f) => f.key).sort()).toEqual(['discrim', 's1_loop'])
  })
})

describe('buildStemColorMap feature overlay + featurePositionSet (PLAN §9)', () => {
  const stems = [
    { key: 'i' as const, start: 1, end: 10 },
    { key: 'at' as const, start: 20, end: 30 },
  ]
  const features = [
    { key: 's1_loop' as const, start: 4, end: 6 },
    { key: 'discrim' as const, start: 22, end: 25 },
  ]

  test('features paint a deeper shade of their parent stem, over the stem fill', () => {
    const m = buildStemColorMap(stems, 30, features)
    expect(m[3]).toBe(STEM_COLORS.i) // Stem-I, outside the loop
    expect(m[4]).toBe(featureShade(STEM_COLORS.i)) // specifier loop → deeper Stem-I
    expect(m[6]).toBe(featureShade(STEM_COLORS.i))
    expect(m[7]).toBe(STEM_COLORS.i) // back to plain Stem-I
    expect(m[21]).toBe(STEM_COLORS.at) // antiterminator, outside UGGN
    expect(m[22]).toBe(featureShade(STEM_COLORS.at)) // UGGN → deeper antiterminator
    expect(m[25]).toBe(featureShade(STEM_COLORS.at))
  })

  test('a feature is CLIPPED to its parent stem: residues off Stem-I are NOT deepened', () => {
    // s1_loop runs 1..6 but Stem-I is 3..10, so 1..2 are a pre-Stem-I linker, and 7..8
    // are inside the WRONG stem ('at' here) — none may be painted deeper Stem-I.
    const m = buildStemColorMap(
      [{ key: 'i', start: 3, end: 6 }, { key: 'at', start: 7, end: 9 }],
      10,
      [{ key: 's1_loop', start: 1, end: 8 }],
    )
    expect(m[1]).toBe(STEM_LINKER_COLOR) // pre-Stem-I linker — unchanged
    expect(m[2]).toBe(STEM_LINKER_COLOR)
    expect(m[3]).toBe(featureShade(STEM_COLORS.i)) // in Stem-I → deepened
    expect(m[6]).toBe(featureShade(STEM_COLORS.i))
    expect(m[7]).toBe(STEM_COLORS.at) // 'at' residue — NOT forced to deeper Stem-I
    expect(m[8]).toBe(STEM_COLORS.at)
  })

  test('with no features the map is unchanged (default arg)', () => {
    const a = buildStemColorMap(stems, 30)
    const b = buildStemColorMap(stems, 30, [])
    expect(a).toEqual(b)
    expect(a[4]).toBe(STEM_COLORS.i) // no deepening without features
  })

  test('featurePositions = the feature residues clipped to the visible parent stem', () => {
    // the [28,100] s1_loop falls on the 'at' stem (20..30), NOT Stem-I → contributes nothing.
    const set = featurePositions(stems, 30, [...features, { key: 's1_loop', start: 28, end: 100 }])
    expect([...set].sort((x, y) => x - y)).toEqual([4, 5, 6, 22, 23, 24, 25])
    expect(set.has(3)).toBe(false) // just outside the first loop
    expect(set.has(28)).toBe(false) // s1_loop residue on the 'at' stem → not ringed as Stem-I
  })
})

describe('assertChromeDataDisjoint (PLAN §8.2 invariant)', () => {
  test('the palettes are provably disjoint with the stated margins', () => {
    const report = assertChromeDataDisjoint()
    expect(report.minHueGap).toBeGreaterThanOrEqual(MIN_BRAND_DATA_HUE_GAP)
    expect(report.maxNeutralSaturation).toBeLessThan(report.minDataSaturation)
    expect(MIN_BRAND_DATA_HUE_GAP).toBe(20)
  })

  test('does not throw', () => {
    expect(() => assertChromeDataDisjoint()).not.toThrow()
  })
})
