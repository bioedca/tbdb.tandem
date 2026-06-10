// Unit: screen-space nearest-point picker (PLAN /cloud). Pure — no three, no WebGL —
// so every "what does the user mean by this click" rule is pinned deterministically by
// feeding precomputed projected coordinates.
import { describe, expect, test } from 'vitest'

import {
  DEPTH_TIE_PX,
  pickNearest,
  pickRadiusPx,
  type ScreenPoint,
} from '../../../src/lib/cloud/picking'

const pt = (sx: number, sy: number, depth = 0, visible = true): ScreenPoint => ({
  sx,
  sy,
  depth,
  visible,
})

describe('pickNearest', () => {
  test('empty / all-invisible → -1', () => {
    expect(pickNearest([], 0, 0, 10).index).toBe(-1)
    expect(pickNearest([pt(0, 0, 0, false)], 0, 0, 10)).toEqual({ index: -1, dist: Infinity })
  })

  test('the nearest point within the radius wins, regardless of array order', () => {
    const points = [pt(50, 0), pt(5, 0), pt(20, 0)]
    expect(pickNearest(points, 0, 0, 100).index).toBe(1) // (5,0) is closest to the cursor
  })

  test('the radius is a hard cutoff', () => {
    // A single point 15px from the cursor: outside a 14px radius, inside a 16px radius.
    expect(pickNearest([pt(15, 0)], 0, 0, 14).index).toBe(-1)
    expect(pickNearest([pt(15, 0)], 0, 0, 16).index).toBe(0)
  })

  test('overlapping centers resolve frontmost (smaller depth) wins', () => {
    // Two coincident points; index 1 is nearer the camera (smaller depth).
    const points = [pt(0, 0, 0.5), pt(0, 0, -0.5)]
    expect(pickNearest(points, 0, 0, 10).index).toBe(1)
  })

  test('a dot clearly closer to the cursor beats a frontmost-but-distant one', () => {
    // index 0 is right under the cursor but far back; index 1 is frontmost but
    // > DEPTH_TIE_PX away. Screen proximity dominates depth.
    const points = [pt(0, 0, 5), pt(DEPTH_TIE_PX + 3, 0, -5)]
    expect(pickNearest(points, 0, 0, 20).index).toBe(0)
  })

  test('within the depth-tie band, the frontmost wins even if marginally farther', () => {
    // index 1 is DEPTH_TIE_PX-1 farther from the cursor (a near-tie) but in front.
    const points = [pt(0, 0, 5), pt(DEPTH_TIE_PX - 1, 0, -5)]
    expect(pickNearest(points, 0, 0, 20).index).toBe(1)
  })

  test('invisible points are skipped even when nearest', () => {
    const points = [pt(0, 0, -9, false), pt(6, 0, 9, true)]
    expect(pickNearest(points, 0, 0, 20).index).toBe(1)
  })

  test('spread responsiveness: the same cursor picks a different node as points move', () => {
    // "Piled": A and B near-coincident under the cursor, A frontmost → A (index 0).
    const piled = [pt(0, 0, -1), pt(0, 0, 1)]
    expect(pickNearest(piled, 0, 0, 25).index).toBe(0)
    // "Spread": A has drifted 20px away, B is now under the cursor → selection follows B.
    const spread = [pt(20, 0, -1), pt(0, 0, 1)]
    expect(pickNearest(spread, 0, 0, 25).index).toBe(1)
  })
})

describe('pickRadiusPx', () => {
  test('a mid-size sprite yields half-diameter × over', () => {
    expect(pickRadiusPx(20, { minPx: 4, maxPx: 40, over: 1.5 })).toBe(15) // 20/2 * 1.5
  })

  test('a tiny far sprite is floored so it stays hittable', () => {
    expect(pickRadiusPx(2)).toBe(8) // 2/2 * 1.4 = 1.4 → floored to default minPx 8
  })

  test('a huge near sprite is capped', () => {
    expect(pickRadiusPx(200)).toBe(28) // 200/2 * 1.4 = 140 → clamped to default maxPx 28
  })

  test('a non-finite sprite size falls back to the floor', () => {
    expect(pickRadiusPx(Number.NaN, { minPx: 9 })).toBe(9)
  })
})
