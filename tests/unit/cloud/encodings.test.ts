// Unit: cloud color/size encodings + presets (PLAN /cloud §4.3, §7.1). Each color
// mode returns the expected `color.ts` hex (incl. null / `?` / mixed / null ΔΔG);
// the ΔΔG ramp hits its endpoints + clamps; size modes hit their documented bounds;
// every preset maps to a valid (color, size) pair.
import { describe, expect, test } from 'vitest'

import {
  CLOUD_NEUTRAL_COLOR,
  CONFIDENCE_COLORS,
  DDG_STOPS,
  FUNC_CLASS_COLORS,
  PHYLUM_COLORS,
  PHYLUM_DEFAULT_COLOR,
  SPECIFIER_COLORS,
  TYPE_COLORS,
  UNKNOWN_SPECIFIER_COLOR,
} from '../../../src/lib/color'
import {
  ABS_DDG_SATURATION,
  NON_FIRMICUTES_BUMP,
  NON_FIRMICUTES_HIGHLIGHT_BUMP,
  pointColor,
  PRESET_ORDER,
  PRESETS,
  resolveEncoding,
  SIZE_MAX,
  SIZE_MIN,
  sizeFactor,
} from '../../../src/lib/cloud/encodings'
import type { CloudPoint, ColorMode, SizeMode } from '../../../src/lib/cloud/types'

/** A minimal point with sensible neutral defaults, overridable per assertion. */
function pt(over: Partial<CloudPoint> = {}): CloudPoint {
  return {
    id: 'X',
    tandem_id: 'T0',
    member_id: 'T0.m1',
    ord: 1,
    spec: 'TRP',
    phylum: 'Firmicutes',
    func: 'aaRS',
    type: 'Transcriptional',
    conf: 'high',
    mixed: false,
    ddg: -15,
    ident: 80,
    ncores: 2,
    x: 0,
    y: 0,
    z: 0,
    ...over,
  }
}

describe('pointColor', () => {
  test('specifier — single, mixed (first hue), and null/?', () => {
    expect(pointColor(pt({ spec: 'TRP' }), 'specifier')).toBe(SPECIFIER_COLORS.TRP)
    expect(pointColor(pt({ spec: 'ILE;LEU' }), 'specifier')).toBe(SPECIFIER_COLORS.ILE)
    expect(pointColor(pt({ spec: null }), 'specifier')).toBe(UNKNOWN_SPECIFIER_COLOR)
    expect(pointColor(pt({ spec: '?' }), 'specifier')).toBe(UNKNOWN_SPECIFIER_COLOR)
  })

  test('ddg — diverging endpoints, midpoint, clamping, and null', () => {
    expect(pointColor(pt({ ddg: -25 }), 'ddg')).toBe(DDG_STOPS.strong)
    expect(pointColor(pt({ ddg: -5 }), 'ddg')).toBe(DDG_STOPS.weak)
    expect(pointColor(pt({ ddg: -15 }), 'ddg')).toBe(DDG_STOPS.neutral)
    expect(pointColor(pt({ ddg: -100 }), 'ddg')).toBe(DDG_STOPS.strong) // clamp low
    expect(pointColor(pt({ ddg: 50 }), 'ddg')).toBe(DDG_STOPS.weak) // clamp high
    expect(pointColor(pt({ ddg: null }), 'ddg')).toBe(UNKNOWN_SPECIFIER_COLOR)
  })

  test('func / conf / type — categorical lookups + neutral fallback', () => {
    expect(pointColor(pt({ func: 'biosynthesis' }), 'func')).toBe(FUNC_CLASS_COLORS.biosynthesis)
    expect(pointColor(pt({ func: null }), 'func')).toBe(CLOUD_NEUTRAL_COLOR)
    expect(pointColor(pt({ conf: 'low' }), 'conf')).toBe(CONFIDENCE_COLORS.low)
    expect(pointColor(pt({ conf: null }), 'conf')).toBe(CLOUD_NEUTRAL_COLOR)
    expect(pointColor(pt({ type: 'Translational' }), 'type')).toBe(TYPE_COLORS.Translational)
    expect(pointColor(pt({ type: null }), 'type')).toBe(CLOUD_NEUTRAL_COLOR)
  })

  test('phylum — context ramp + unassigned default', () => {
    expect(pointColor(pt({ phylum: 'Firmicutes' }), 'phylum')).toBe(PHYLUM_COLORS.Firmicutes)
    expect(pointColor(pt({ phylum: null }), 'phylum')).toBe(PHYLUM_DEFAULT_COLOR)
  })
})

describe('sizeFactor', () => {
  test('uniform is 1.0 for the Firmicutes majority', () => {
    expect(sizeFactor(pt({ phylum: 'Firmicutes' }), 'uniform')).toBe(1.0)
  })

  test('absDdg hits documented bounds and handles null', () => {
    expect(sizeFactor(pt({ phylum: 'Firmicutes', ddg: 0 }), 'absDdg')).toBeCloseTo(SIZE_MIN)
    expect(
      sizeFactor(pt({ phylum: 'Firmicutes', ddg: -ABS_DDG_SATURATION }), 'absDdg'),
    ).toBeCloseTo(SIZE_MAX)
    expect(sizeFactor(pt({ phylum: 'Firmicutes', ddg: -1000 }), 'absDdg')).toBeCloseTo(SIZE_MAX) // clamp
    expect(sizeFactor(pt({ phylum: 'Firmicutes', ddg: null }), 'absDdg')).toBeCloseTo(SIZE_MIN)
  })

  test('divergence = 1 − identity/100 across the range', () => {
    expect(sizeFactor(pt({ phylum: 'Firmicutes', ident: 100 }), 'divergence')).toBeCloseTo(SIZE_MIN)
    expect(sizeFactor(pt({ phylum: 'Firmicutes', ident: 0 }), 'divergence')).toBeCloseTo(SIZE_MAX)
    expect(sizeFactor(pt({ phylum: 'Firmicutes', ident: null }), 'divergence')).toBeCloseTo(1.0)
  })

  test('non-Firmicutes get a bump, larger under the highlight toggle', () => {
    expect(sizeFactor(pt({ phylum: 'Actinobacteria' }), 'uniform')).toBeCloseTo(NON_FIRMICUTES_BUMP)
    expect(
      sizeFactor(pt({ phylum: 'Actinobacteria' }), 'uniform', { highlightNonFirmicutes: true }),
    ).toBeCloseTo(NON_FIRMICUTES_HIGHLIGHT_BUMP)
    // null phylum counts as non-Firmicutes (matches tree.ts isNonFirmicutes)
    expect(sizeFactor(pt({ phylum: null }), 'uniform')).toBeCloseTo(NON_FIRMICUTES_BUMP)
  })
})

describe('presets', () => {
  const HEX = /^#[0-9a-f]{6}$/i
  test('every preset maps to a valid (color, size) pair', () => {
    for (const key of PRESET_ORDER) {
      const preset = PRESETS[key]
      expect(preset).toBeTruthy()
      const { color, size } = resolveEncoding(
        pt(),
        preset.color as ColorMode,
        preset.size as SizeMode,
        { highlightNonFirmicutes: preset.emphasizeNonFirmicutes },
      )
      expect(color).toMatch(HEX)
      expect(size).toBeGreaterThan(0)
    }
  })

  test('Specifier is the default (first) preset; Taxonomy emphasizes non-Firmicutes', () => {
    expect(PRESET_ORDER[0]).toBe('specifier')
    expect(PRESETS.specifier.color).toBe('specifier')
    expect(PRESETS.taxonomy.emphasizeNonFirmicutes).toBe(true)
  })
})
