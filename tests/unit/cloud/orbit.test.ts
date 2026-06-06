// Unit: the orbit camera math (PLAN /cloud §4.5, §7.1). Spherical→cartesian camera
// position; polar-angle clamping; multiplicative zoom clamp; pan offsets the target
// along the camera basis vectors.
import { describe, expect, test } from 'vitest'

import {
  cameraBasis,
  cameraPosition,
  centroidOf,
  clampDistance,
  clampPolar,
  cloudMetrics,
  dampOrbit,
  defaultOrbit,
  distanceClamp,
  framePoints,
  framingDistance,
  MAX_DISTANCE,
  MIN_CLOUD_RADIUS,
  MIN_DISTANCE,
  type Orbit,
  orbitPan,
  orbitRotate,
  orbitZoom,
  orbitZoomToCursor,
  POLAR_EPSILON,
  robustCenter,
  robustRadius,
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

describe('orbitZoomToCursor (dolly toward the pointer)', () => {
  const fovDeg = 45
  const aspect = 1.6
  test('a centred cursor (0,0) reduces to a plain zoom — target unchanged', () => {
    const o = base({ azimuth: 0.7, polar: 1.1, distance: 100, target: { x: 5, y: -2, z: 3 } })
    const out = orbitZoomToCursor(o, 0.5, 0, 0, fovDeg, aspect)
    expect(out.distance).toBeCloseTo(orbitZoom(o, 0.5).distance)
    expect(out.target.x).toBeCloseTo(o.target.x)
    expect(out.target.y).toBeCloseTo(o.target.y)
    expect(out.target.z).toBeCloseTo(o.target.z)
  })
  test('keeps the world point under the cursor screen-fixed (the dolly-to-cursor invariant)', () => {
    const o = base({ azimuth: 0.7, polar: 1.1, distance: 100, target: { x: 5, y: -2, z: 3 } })
    const ndcX = 0.4
    const ndcY = -0.3
    // The world point H on the focal plane under the cursor (in the camera basis).
    const { right, up } = cameraBasis(o)
    const halfH = o.distance * Math.tan(((fovDeg * Math.PI) / 180) / 2)
    const halfW = halfH * aspect
    const H = {
      x: o.target.x + ndcX * halfW * right.x + ndcY * halfH * up.x,
      y: o.target.y + ndcX * halfW * right.y + ndcY * halfH * up.y,
      z: o.target.z + ndcX * halfW * right.z + ndcY * halfH * up.z,
    }
    const out = orbitZoomToCursor(o, 0.5, ndcX, ndcY, fovDeg, aspect)
    // Azimuth/polar are unchanged, so the basis is the same; re-project H under the new
    // distance/target and confirm its NDC is still (ndcX, ndcY).
    const halfH2 = out.distance * Math.tan(((fovDeg * Math.PI) / 180) / 2)
    const dx = H.x - out.target.x
    const dy = H.y - out.target.y
    const dz = H.z - out.target.z
    const projX = (dx * right.x + dy * right.y + dz * right.z) / (halfH2 * aspect)
    const projY = (dx * up.x + dy * up.y + dz * up.z) / halfH2
    expect(projX).toBeCloseTo(ndcX)
    expect(projY).toBeCloseTo(ndcY)
  })
  test('clamped zoom pins the target (no drift once distance hits a limit)', () => {
    const o = base({ distance: MIN_DISTANCE, target: { x: 1, y: 2, z: 3 } })
    const out = orbitZoomToCursor(o, 0.0001, 0.5, 0.5, fovDeg, aspect)
    expect(out.distance).toBe(MIN_DISTANCE)
    expect(out.target).toEqual(o.target) // eff = 1 ⇒ zero shift
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

describe('centroidOf (centre of mass)', () => {
  test('averages the coordinates', () => {
    const c = centroidOf([
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 4, z: 6 },
      { x: 4, y: 8, z: 12 },
    ])
    expect(c).toEqual({ x: 2, y: 4, z: 6 })
  })
  test('an empty set centres on the origin', () => {
    expect(centroidOf([])).toEqual({ x: 0, y: 0, z: 0 })
  })
})

describe('robustRadius (outlier-resistant framing radius)', () => {
  // A dense unit-radius core plus one far outlier: the p95 radius tracks the core,
  // NOT the outlier — so framing fills the view with the bulk, not the speck.
  const centre = { x: 0, y: 0, z: 0 }
  const core = Array.from({ length: 20 }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i), z: 0 }))
  const withOutlier = [...core, { x: 1000, y: 0, z: 0 }]
  test('ignores a lone far outlier at p95', () => {
    expect(robustRadius(withOutlier, centre, 0.95)).toBeCloseTo(1, 5)
  })
  test('p100 (max) DOES include the outlier', () => {
    expect(robustRadius(withOutlier, centre, 1)).toBeCloseTo(1000)
  })
  test('an empty set has radius 0', () => {
    expect(robustRadius([], centre)).toBe(0)
  })
})

describe('framingDistance', () => {
  test('a wider fov needs less distance to fit the same radius', () => {
    const near = framingDistance(50, 90, 1, 1)
    const far = framingDistance(50, 30, 1, 1)
    expect(far).toBeGreaterThan(near)
  })
  test('a portrait (narrow) aspect pushes the camera further back', () => {
    const landscape = framingDistance(50, 45, 2, 1)
    const portrait = framingDistance(50, 45, 0.5, 1)
    expect(portrait).toBeGreaterThan(landscape)
  })
  test('margin scales distance linearly (within the clamp range)', () => {
    const base = framingDistance(50, 45, 1, 1)
    const roomy = framingDistance(50, 45, 1, 1.5)
    expect(roomy).toBeCloseTo(base * 1.5)
  })
  test('result is clamped into the legal distance range', () => {
    expect(framingDistance(0.0001, 45, 1, 1)).toBe(MIN_DISTANCE)
    expect(framingDistance(1e6, 45, 1, 1)).toBe(MAX_DISTANCE)
  })
})

describe('robustCenter (outlier-resistant centre of mass)', () => {
  // A dense ring core centred at (-4,0,0) plus one far outlier: the plain mean is
  // dragged toward the outlier, but the robust centre stays ON the core.
  const ring = Array.from({ length: 40 }, (_, i) => {
    const t = (2 * Math.PI * i) / 40
    return { x: -4 + 8 * Math.cos(t), y: 8 * Math.sin(t), z: 0 }
  })
  const pts = [...ring, { x: 200, y: 0, z: 0 }]
  test('stays on the core where the plain mean is pulled toward the outlier', () => {
    const robust = robustCenter(pts, 0.95)
    const mean = centroidOf(pts)
    expect(mean.x).toBeGreaterThan(0) // mean is dragged right by the outlier
    expect(robust.x).toBeLessThan(-2) // robust centre sits back on the core (~ −4)
    // …and is much closer to the true core centre (−4) than the mean is.
    expect(Math.abs(robust.x - -4)).toBeLessThan(Math.abs(mean.x - -4))
  })
  test('an empty set centres on the origin', () => {
    expect(robustCenter([])).toEqual({ x: 0, y: 0, z: 0 })
  })
  test('with no outliers it equals the plain mean', () => {
    expect(robustCenter(ring, 0.95)).toEqual(centroidOf(ring))
  })
})

describe('framePoints (pivot on the core, frame the core)', () => {
  // A realistic view: a dense core (many points on a radius-8 ring around (-4,0,0))
  // plus ONE far-divergence outlier — mirroring the real embedding (a tight bulk + a
  // lone point streaking to the ±scale edge among hundreds).
  const ring = Array.from({ length: 40 }, (_, i) => {
    const t = (2 * Math.PI * i) / 40
    return { x: -4 + 8 * Math.cos(t), y: 8 * Math.sin(t), z: 0 }
  })
  const pts = [...ring, { x: 200, y: 0, z: 0 }]

  test('pivots on the dense core (robust centre), NOT pulled toward the outlier', () => {
    const { target } = framePoints(pts, 45, 1.5)
    expect(target).toEqual(robustCenter(pts, 0.95))
    expect(target.x).toBeLessThan(-2) // on the core (~ −4), not in the gap toward +200
  })
  test('frames the dense core, not the lone outlier', () => {
    const { distance } = framePoints(pts, 45, 1.5)
    // Far less than the distance the 200-unit outlier alone would demand.
    expect(distance).toBeLessThan(framingDistance(200, 45, 1.5, 1.4) / 3)
    expect(distance).toBeGreaterThanOrEqual(MIN_DISTANCE)
  })
})

describe('dampOrbit (per-frame easing toward the input orbit)', () => {
  const a = (over: Partial<Orbit> = {}): Orbit => base(over)
  test('alpha 1 snaps exactly to the target', () => {
    const cur = a({ azimuth: 0, polar: 1, distance: 100, target: { x: 0, y: 0, z: 0 } })
    const tgt = a({ azimuth: 2, polar: 1.4, distance: 300, target: { x: 5, y: 6, z: 7 } })
    const out = dampOrbit(cur, tgt, 1)
    expect(out.azimuth).toBeCloseTo(2)
    expect(out.polar).toBeCloseTo(1.4)
    expect(out.distance).toBeCloseTo(300)
    expect(out.target).toEqual({ x: 5, y: 6, z: 7 })
  })
  test('alpha 0 holds the current orbit', () => {
    const cur = a({ azimuth: 0.3, distance: 120 })
    expect(dampOrbit(cur, a({ azimuth: 9, distance: 999 }), 0)).toEqual(cur)
  })
  test('alpha 0.5 moves halfway and clamps polar', () => {
    const cur = a({ azimuth: 0, polar: Math.PI / 2, distance: 100 })
    const tgt = a({ azimuth: 1, polar: Math.PI / 2, distance: 200 })
    const out = dampOrbit(cur, tgt, 0.5)
    expect(out.azimuth).toBeCloseTo(0.5)
    expect(out.distance).toBeCloseTo(150)
    expect(out.polar).toBe(clampPolar(out.polar))
  })
  test('repeated easing converges onto the target', () => {
    let cur = a({ azimuth: 0, polar: 0.5, distance: 100, target: { x: 0, y: 0, z: 0 } })
    const tgt = a({ azimuth: 2, polar: 1.2, distance: 400, target: { x: 10, y: -4, z: 2 } })
    for (let i = 0; i < 200; i++) cur = dampOrbit(cur, tgt, 0.22)
    expect(cur.azimuth).toBeCloseTo(2, 3)
    expect(cur.distance).toBeCloseTo(400, 3)
    expect(cur.target.x).toBeCloseTo(10, 3)
  })
})

// The view's scale-dependent constants (point size, pick radius, zoom clamps, frustum)
// are derived from the MEASURED geometry so the cloud adapts when its extent changes.
// `cloudMetrics`/`distanceClamp` are that measurement; the optional `bounds` params let
// the component swap the fixed ±100 rails for a geometry-matched window.
describe('cloudMetrics (geometry-derived view scale)', () => {
  // A dense unit-of-8 ring at the origin plus one far outlier — the realistic shape.
  const ring = Array.from({ length: 40 }, (_, i) => {
    const t = (2 * Math.PI * i) / 40
    return { x: 8 * Math.cos(t), y: 8 * Math.sin(t), z: 0 }
  })
  const pts = [...ring, { x: 200, y: 0, z: 0 }]

  test('measures a robust centre, core radius, and full extent', () => {
    const m = cloudMetrics(pts, 0.95)
    // Robust ⇒ the centre sits ON the ring (~origin), NOT dragged toward the +200 outlier
    // (the plain mean would be ~+4.9). Not exactly 0: the p95 cutoff drops a boundary point.
    expect(Math.abs(m.center.x)).toBeLessThan(1)
    expect(m.radius).toBeGreaterThan(7) // p95 core radius tracks the ring (~8), not the outlier
    expect(m.radius).toBeLessThan(9)
    expect(m.extent).toBeGreaterThan(150) // p100 extent DOES include the far outlier
  })

  test('floors a degenerate (single / empty) cloud to a finite radius', () => {
    expect(cloudMetrics([{ x: 5, y: 5, z: 5 }]).radius).toBe(MIN_CLOUD_RADIUS)
    expect(cloudMetrics([]).radius).toBe(MIN_CLOUD_RADIUS)
    expect(cloudMetrics([]).extent).toBe(MIN_CLOUD_RADIUS) // extent ≥ radius always
  })

  test('extent is never below the core radius', () => {
    // a perfectly uniform cloud (no outlier) — p100 == p95 == the radius
    const m = cloudMetrics(ring, 0.95)
    expect(m.extent).toBeGreaterThanOrEqual(m.radius)
  })
})

describe('distanceClamp (geometry-matched zoom window)', () => {
  test('scales the window with the cloud extent', () => {
    const small = distanceClamp({ center: { x: 0, y: 0, z: 0 }, radius: 8, extent: 20 })
    const big = distanceClamp({ center: { x: 0, y: 0, z: 0 }, radius: 80, extent: 200 })
    expect(big.min).toBeGreaterThan(small.min) // a bigger core ⇒ keep further away when closest
    expect(big.max).toBeGreaterThan(small.max) // …and pull back further
    expect(small.max).toBeGreaterThan(small.min)
  })
  test('lets you approach to a small fraction of the core and pull well back', () => {
    const b = distanceClamp({ center: { x: 0, y: 0, z: 0 }, radius: 100, extent: 100 })
    expect(b.min).toBeLessThan(100) // can get inside the core
    expect(b.max).toBeGreaterThan(100 * 4) // can pull back to several extents
  })
})

describe('optional distance bounds thread through the zoom/framing helpers', () => {
  const bounds = { min: 10, max: 100 }
  test('clampDistance honours custom bounds', () => {
    expect(clampDistance(5, bounds)).toBe(10)
    expect(clampDistance(500, bounds)).toBe(100)
    expect(clampDistance(50, bounds)).toBe(50)
  })
  test('orbitZoom honours custom bounds', () => {
    expect(orbitZoom(base({ distance: 50 }), 0.001, bounds).distance).toBe(10)
    expect(orbitZoom(base({ distance: 50 }), 1000, bounds).distance).toBe(100)
  })
  test('orbitZoomToCursor honours custom bounds', () => {
    const out = orbitZoomToCursor(base({ distance: 50, target: { x: 1, y: 2, z: 3 } }), 0.001, 0.5, 0.5, 45, 1.6, bounds)
    expect(out.distance).toBe(10) // clamped to the custom min
  })
  test('framingDistance honours custom bounds', () => {
    expect(framingDistance(1e6, 45, 1, 1, bounds)).toBe(100)
    expect(framingDistance(1e-6, 45, 1, 1, bounds)).toBe(10)
  })
  test('framePoints honours bounds (a tiny cloud is pushed out to a large min)', () => {
    const { distance } = framePoints([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }], 45, 1, {
      bounds: { min: 500, max: 1000 },
    })
    expect(distance).toBe(500)
  })
  test('omitting bounds falls back to the fixed ±100 rails (unchanged behaviour)', () => {
    expect(clampDistance(1)).toBe(MIN_DISTANCE)
    expect(clampDistance(99999)).toBe(MAX_DISTANCE)
  })
})
