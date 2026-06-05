// Unit: the orbit camera math (PLAN /cloud §4.5, §7.1). Spherical→cartesian camera
// position; polar-angle clamping; multiplicative zoom clamp; pan offsets the target
// along the camera basis vectors.
import { describe, expect, test } from 'vitest'

import {
  cameraBasis,
  cameraPosition,
  clampDistance,
  clampPolar,
  defaultOrbit,
  MAX_DISTANCE,
  MIN_DISTANCE,
  type Orbit,
  orbitPan,
  orbitRotate,
  orbitZoom,
  POLAR_EPSILON,
} from '../../../src/lib/cloud/orbit'

const base = (over: Partial<Orbit> = {}): Orbit => ({
  azimuth: 0,
  polar: Math.PI / 2,
  distance: 100,
  target: { x: 0, y: 0, z: 0 },
  ...over,
})

describe('cameraPosition (spherical → cartesian)', () => {
  test('equator + azimuth 0 looks down +X at the given distance', () => {
    const p = cameraPosition(base())
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(0)
  })
  test('azimuth π/2 rotates to +Z', () => {
    const p = cameraPosition(base({ azimuth: Math.PI / 2 }))
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(100)
  })
  test('polar → 0 sits on +Y (the pole)', () => {
    const p = cameraPosition(base({ polar: POLAR_EPSILON }))
    expect(p.y).toBeCloseTo(100, 1)
  })
  test('position is offset by a non-zero target', () => {
    const p = cameraPosition(base({ target: { x: 10, y: 5, z: -2 } }))
    expect(p.x).toBeCloseTo(110)
    expect(p.y).toBeCloseTo(5)
    expect(p.z).toBeCloseTo(-2)
  })
})

describe('clamping', () => {
  test('polar is clamped into (0, π) — never the degenerate poles', () => {
    expect(clampPolar(-1)).toBe(POLAR_EPSILON)
    expect(clampPolar(10)).toBe(Math.PI - POLAR_EPSILON)
    expect(clampPolar(Math.PI / 3)).toBeCloseTo(Math.PI / 3)
  })
  test('distance is clamped to [MIN, MAX]', () => {
    expect(clampDistance(1)).toBe(MIN_DISTANCE)
    expect(clampDistance(99999)).toBe(MAX_DISTANCE)
  })
  test('orbitRotate clamps polar; orbitZoom clamps distance', () => {
    expect(orbitRotate(base(), 0.1, 999).polar).toBe(Math.PI - POLAR_EPSILON)
    expect(orbitRotate(base({ azimuth: 1 }), 0.5, 0).azimuth).toBeCloseTo(1.5)
    expect(orbitZoom(base({ distance: 100 }), 0.5).distance).toBeCloseTo(50)
    expect(orbitZoom(base({ distance: 100 }), 0.0001).distance).toBe(MIN_DISTANCE)
  })
})

describe('cameraBasis + orbitPan', () => {
  test('basis vectors are orthonormal', () => {
    const { right, up, forward } = cameraBasis(base({ azimuth: 0.7, polar: 1.1 }))
    const dot = (a: typeof right, b: typeof right) => a.x * b.x + a.y * b.y + a.z * b.z
    expect(dot(right, right)).toBeCloseTo(1)
    expect(dot(up, up)).toBeCloseTo(1)
    expect(dot(forward, forward)).toBeCloseTo(1)
    expect(dot(right, up)).toBeCloseTo(0)
    expect(dot(right, forward)).toBeCloseTo(0)
    expect(dot(up, forward)).toBeCloseTo(0)
  })
  test('pan offsets the target along the camera right/up vectors', () => {
    const orbit = base({ azimuth: 0, polar: Math.PI / 2 })
    const { right, up } = cameraBasis(orbit)
    const panned = orbitPan(orbit, 4, 3)
    expect(panned.target.x).toBeCloseTo(-right.x * 4 + up.x * 3)
    expect(panned.target.y).toBeCloseTo(-right.y * 4 + up.y * 3)
    expect(panned.target.z).toBeCloseTo(-right.z * 4 + up.z * 3)
    // a no-op pan leaves the target unchanged
    expect(orbitPan(orbit, 0, 0).target).toEqual(orbit.target)
  })
})

describe('defaultOrbit', () => {
  test('is a sane, in-range framing', () => {
    const o = defaultOrbit()
    expect(o.polar).toBe(clampPolar(o.polar))
    expect(o.distance).toBe(clampDistance(o.distance))
    expect(o.target).toEqual({ x: 0, y: 0, z: 0 })
  })
})
