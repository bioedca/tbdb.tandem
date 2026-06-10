// Unit: selection-highlight easing curves (PLAN /cloud). Pure maths — the per-frame
// attribute writes + reduced-motion snap live in the component; here we pin the curves.
import { describe, expect, test } from 'vitest'

import {
  dampScalar,
  HOVER_BUMP,
  highlightTargets,
  POP_AMPLITUDE,
  POP_DURATION_MS,
  popScale,
} from '../../../src/lib/cloud/highlight'

describe('dampScalar', () => {
  test('alpha = 1 snaps to the target (the reduced-motion path)', () => {
    expect(dampScalar(0.2, 1.6, 1)).toBe(1.6)
  })

  test('alpha = 0 freezes at the current value', () => {
    expect(dampScalar(0.2, 1.6, 0)).toBe(0.2)
  })

  test('clamps alpha and eases monotonically toward the target', () => {
    expect(dampScalar(0, 10, 2)).toBe(10) // clamped to 1
    expect(dampScalar(0, 10, -1)).toBe(0) // clamped to 0
    let v = 0
    let prev = -1
    for (let i = 0; i < 30; i++) {
      v = dampScalar(v, 1, 0.25)
      expect(v).toBeGreaterThan(prev) // strictly approaches
      expect(v).toBeLessThanOrEqual(1)
      prev = v
    }
    expect(v).toBeCloseTo(1, 2)
  })

  test('is idempotent once at the target', () => {
    expect(dampScalar(1, 1, 0.25)).toBe(1)
  })
})

describe('highlightTargets', () => {
  test('level 0 is the resting (no-highlight) state', () => {
    expect(highlightTargets(0)).toEqual({ sizeMul: 1, alphaLift: 0, ring: 0 })
  })

  test('level 1 is the full highlight', () => {
    expect(highlightTargets(1)).toEqual({ sizeMul: HOVER_BUMP, alphaLift: 1, ring: 1 })
  })

  test('clamps out-of-range levels and lerps the midpoint', () => {
    expect(highlightTargets(2)).toEqual({ sizeMul: HOVER_BUMP, alphaLift: 1, ring: 1 })
    expect(highlightTargets(-1)).toEqual({ sizeMul: 1, alphaLift: 0, ring: 0 })
    const mid = highlightTargets(0.5)
    expect(mid.sizeMul).toBeCloseTo(1 + (HOVER_BUMP - 1) * 0.5, 6)
    expect(mid.alphaLift).toBe(0.5)
    expect(mid.ring).toBe(0.5)
  })
})

describe('popScale', () => {
  test('starts and ends exactly at rest (no residual motion)', () => {
    expect(popScale(0)).toBe(1)
    expect(popScale(POP_DURATION_MS)).toBe(1)
    expect(popScale(POP_DURATION_MS + 50)).toBe(1)
    expect(popScale(-10)).toBe(1)
  })

  test('peaks at 1 + amplitude mid-way', () => {
    expect(popScale(POP_DURATION_MS / 2)).toBeCloseTo(1 + POP_AMPLITUDE, 6)
  })

  test('stays within [1, 1 + amplitude] over its lifetime (single hump, never < 1)', () => {
    let max = 0
    let maxAt = -1
    for (let t = 0; t <= POP_DURATION_MS; t += 5) {
      const v = popScale(t)
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(1 + POP_AMPLITUDE + 1e-9)
      if (v > max) {
        max = v
        maxAt = t
      }
    }
    expect(max).toBeCloseTo(1 + POP_AMPLITUDE, 4)
    expect(maxAt).toBeCloseTo(POP_DURATION_MS / 2, -1) // single maximum, mid-way
  })

  test('honours custom amplitude / duration', () => {
    expect(popScale(50, { amplitude: 0.2, durationMs: 100 })).toBeCloseTo(1 + 0.2, 6)
    expect(popScale(100, { amplitude: 0.2, durationMs: 100 })).toBe(1)
  })
})
