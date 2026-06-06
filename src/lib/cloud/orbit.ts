// tbdb.tandem similarity-cloud orbit camera (PLAN /cloud §4.5) — a tiny spherical
// camera controller so the view needs NO external OrbitControls / d3 dependency.
// The angle math is pure + unit-tested here; pointer/wheel wiring lives in the
// component (it just calls these). NO DOM dependencies.

/** A 3-vector. */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Spherical orbit state: camera at `(azimuth, polar, distance)` around `target`. */
export interface Orbit {
  /** Azimuth angle (radians) around the world-up (Y) axis. */
  azimuth: number
  /** Polar angle (radians) from +Y; clamped to (0, π) so the camera never flips. */
  polar: number
  /** Distance from the target. */
  distance: number
  /** The look-at point the camera orbits. */
  target: Vec3
}

/** How close to the poles the polar angle may get (avoids a degenerate up vector). */
export const POLAR_EPSILON = 0.0001
/** Distance clamp so zoom can't invert or fly away. These are the FALLBACK rails for a
 *  ±100-scaled embedding; the live view derives tighter, geometry-matched bounds from
 *  the actual cloud extent (see {@link cloudMetrics} / {@link distanceClamp}) and passes
 *  them in, so the clamp adapts when the embedding's scale changes. */
export const MIN_DISTANCE = 20
export const MAX_DISTANCE = 1200

/** A min/max distance window for the zoom/framing clamp. */
export interface DistanceBounds {
  min: number
  max: number
}

/** The fixed fallback bounds (used when no geometry-derived window is supplied). */
export const DEFAULT_BOUNDS: DistanceBounds = { min: MIN_DISTANCE, max: MAX_DISTANCE }

/** A sensible default framing for the 100-unit-scaled embedding. */
export function defaultOrbit(): Orbit {
  return {
    azimuth: Math.PI * 0.25,
    polar: Math.PI * 0.42,
    distance: 320,
    target: { x: 0, y: 0, z: 0 },
  }
}

/** Clamp the polar angle into (POLAR_EPSILON, π − POLAR_EPSILON). */
export function clampPolar(polar: number): number {
  return Math.min(Math.PI - POLAR_EPSILON, Math.max(POLAR_EPSILON, polar))
}

/** Clamp a distance into `bounds` (defaults to the fixed fallback rails). */
export function clampDistance(distance: number, bounds: DistanceBounds = DEFAULT_BOUNDS): number {
  return Math.min(bounds.max, Math.max(bounds.min, distance))
}

/** Camera world position for an orbit (spherical → cartesian, offset by target).
 *  `polar` from +Y: `polar = π/2` is the equator; `azimuth` rotates around +Y. */
export function cameraPosition(orbit: Orbit): Vec3 {
  const { azimuth, polar, distance, target } = orbit
  const sinP = Math.sin(polar)
  return {
    x: target.x + distance * sinP * Math.cos(azimuth),
    y: target.y + distance * Math.cos(polar),
    z: target.z + distance * sinP * Math.sin(azimuth),
  }
}

// ── small vector helpers (pure) ──────────────────────────────────────────────────
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)
function normalize(a: Vec3): Vec3 {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l }
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 }

/** The camera basis (right, up, forward) for an orbit — forward points target→camera. */
export function cameraBasis(orbit: Orbit): { right: Vec3; up: Vec3; forward: Vec3 } {
  const pos = cameraPosition(orbit)
  const forward = normalize(sub(pos, orbit.target)) // points from target toward camera
  const right = normalize(cross(WORLD_UP, forward))
  const up = cross(forward, right)
  return { right, up, forward }
}

/** Rotate the orbit by pointer deltas (radians): azimuth += dAz, polar += dPolar
 *  (clamped). Returns a NEW orbit (callers hold orbit in reactive state). */
export function orbitRotate(orbit: Orbit, dAzimuth: number, dPolar: number): Orbit {
  return {
    ...orbit,
    azimuth: orbit.azimuth + dAzimuth,
    polar: clampPolar(orbit.polar + dPolar),
  }
}

/** Zoom by a multiplicative factor (wheel): distance *= factor, clamped to `bounds`. */
export function orbitZoom(orbit: Orbit, factor: number, bounds: DistanceBounds = DEFAULT_BOUNDS): Orbit {
  return { ...orbit, distance: clampDistance(orbit.distance * factor, bounds) }
}

/**
 * Zoom by `factor` toward the CURSOR instead of the centre: the world point on the
 * focal plane under the cursor stays fixed on screen, so you dolly into whatever you
 * point at. `ndcX`/`ndcY` are the cursor in normalized device coords (−1..1, y up);
 * (0, 0) reduces exactly to `orbitZoom`. Distance is clamped, and the target shift uses
 * the EFFECTIVE (post-clamp) factor, so the pivot never drifts once zoom is pinned at a
 * limit. (Derivation: a focal-plane point at offset `e` from the target projects to
 * `e / (distance·tan(fov/2))`; scaling distance by `eff` and moving the target by
 * `(1−eff)·e` leaves that projection unchanged.)
 */
export function orbitZoomToCursor(
  orbit: Orbit,
  factor: number,
  ndcX: number,
  ndcY: number,
  fovDeg: number,
  aspect: number,
  bounds: DistanceBounds = DEFAULT_BOUNDS,
): Orbit {
  const newDistance = clampDistance(orbit.distance * factor, bounds)
  const eff = orbit.distance > 0 ? newDistance / orbit.distance : 1
  // Cursor offset from the target on the focal plane (world units), in the camera basis.
  const halfH = orbit.distance * Math.tan(((fovDeg * Math.PI) / 180) / 2)
  const halfW = halfH * aspect
  const ex = ndcX * halfW
  const ey = ndcY * halfH
  const { right, up } = cameraBasis(orbit)
  const shift = 1 - eff // move the target toward the cursor point to keep it screen-fixed
  return {
    ...orbit,
    distance: newDistance,
    target: {
      x: orbit.target.x + shift * (right.x * ex + up.x * ey),
      y: orbit.target.y + shift * (right.y * ex + up.y * ey),
      z: orbit.target.z + shift * (right.z * ex + up.z * ey),
    },
  }
}

/**
 * Pan the target in screen space by `(dx, dy)` (world units along the camera basis):
 * moving the pointer right slides the scene right (target moves −right), moving it
 * down slides the scene down (target moves +up). Returns a NEW orbit.
 */
export function orbitPan(orbit: Orbit, dx: number, dy: number): Orbit {
  const { right, up } = cameraBasis(orbit)
  return {
    ...orbit,
    target: {
      x: orbit.target.x - right.x * dx + up.x * dy,
      y: orbit.target.y - right.y * dx + up.y * dy,
      z: orbit.target.z - right.z * dx + up.z * dy,
    },
  }
}

// ── Auto-framing (pivot on the cloud, not the world origin) ───────────────────────
// The PCoA embedding is centred on the origin only for the FULL element set; the
// locus-centroid view and the antiterminator (fallback) embedding sit off-origin, and
// every view has a lone far-divergence outlier streaking to the ±scale edge. Orbiting
// the world origin therefore swings the visible mass lopsidedly and frames it from too
// far out. These helpers pivot on the rendered points' centre of mass and pick a
// distance that fills the view with the dense core (a robust radius), so a far outlier
// doesn't shrink everything else to a speck. All pure + unit-tested.

/** A point with x/y/z (renderable). */
interface XYZ {
  x: number
  y: number
  z: number
}

/** Centre of mass (mean position) of a set of points; the origin for an empty set. */
export function centroidOf(points: ReadonlyArray<XYZ>): Vec3 {
  const n = points.length
  if (n === 0) return { x: 0, y: 0, z: 0 }
  let x = 0
  let y = 0
  let z = 0
  for (const p of points) {
    x += p.x
    y += p.y
    z += p.z
  }
  return { x: x / n, y: y / n, z: z / n }
}

/** The `pct`-quantile (0..1) of distance from `centre` — a radius that ignores the
 *  long tail so a single far outlier can't blow up the framing. */
export function robustRadius(points: ReadonlyArray<XYZ>, centre: Vec3, pct = 0.95): number {
  if (points.length === 0) return 0
  const ds = points
    .map((p) => Math.hypot(p.x - centre.x, p.y - centre.y, p.z - centre.z))
    .sort((a, b) => a - b)
  const q = Math.min(1, Math.max(0, pct))
  const idx = Math.min(ds.length - 1, Math.max(0, Math.round(q * (ds.length - 1))))
  return ds[idx]
}

/** An outlier-RESISTANT centre: the centre of mass of just the dense core (the points
 *  within the `pct`-radius of the plain mean). This matches `robustRadius` so the pivot
 *  sits ON the core rather than being dragged by a lone far outlier into the empty gap
 *  between the core and that outlier — the exact "feels off-centre" failure mode. */
export function robustCenter(points: ReadonlyArray<XYZ>, pct = 0.95): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 }
  const mean = centroidOf(points)
  const r = robustRadius(points, mean, pct)
  const core = points.filter((p) => Math.hypot(p.x - mean.x, p.y - mean.y, p.z - mean.z) <= r)
  return centroidOf(core.length > 0 ? core : points)
}

/** Camera distance that frames a sphere of `radius` for a perspective camera of
 *  vertical fov `fovDeg` at `aspect` (w/h). Uses the binding (smaller) of the
 *  vertical/horizontal half-angles so a portrait viewport still fits, plus `margin`
 *  breathing room. Clamped to `bounds` (the fixed fallback rails by default). */
export function framingDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  margin = 1,
  bounds: DistanceBounds = DEFAULT_BOUNDS,
): number {
  const vHalf = ((fovDeg * Math.PI) / 180) / 2
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(aspect, 1e-4))
  const half = Math.max(Math.min(vHalf, hHalf), 1e-4)
  return clampDistance((radius / Math.sin(half)) * margin, bounds)
}

/** Frame a point set: pivot the target on its centroid and pick a distance that fills
 *  the view with the dense core. Returns the `target` + `distance` only — the caller
 *  keeps the current azimuth/polar (a reframe re-centres without re-orienting).
 *  `opts.bounds` clamps the distance (defaults to the fixed fallback rails). */
export function framePoints(
  points: ReadonlyArray<XYZ>,
  fovDeg: number,
  aspect: number,
  opts: { pct?: number; margin?: number; bounds?: DistanceBounds } = {},
): { target: Vec3; distance: number } {
  const pct = opts.pct ?? 0.95
  const target = robustCenter(points, pct) // pivot on the core, consistent with the radius
  const radius = robustRadius(points, target, pct)
  const distance = framingDistance(Math.max(radius, 1), fovDeg, aspect, opts.margin ?? 1.4, opts.bounds)
  return { target, distance }
}

// ── Geometry-derived view scale (adapts every scale-dependent constant to the cloud) ──
// The point sprite size, the pick radius, the zoom clamps and the camera frustum were
// all once hardcoded to the ±100 canvas. But the measured core radius differs several-
// fold between embeddings (the dense main tree vs. the spread-out fallback) and would
// change again if `cloud.json` were regenerated at a new scale. `cloudMetrics` measures
// the ACTUAL geometry once per rebuild so the component can derive each constant from it
// — keeping points a consistent on-screen size and picking honest across any geometry.

/** Characteristic metrics of a rendered cloud, all in world units. */
export interface CloudMetrics {
  /** Outlier-resistant centre of mass (the framing pivot). */
  center: Vec3
  /** Robust (p`pct`) radius of the dense core — the characteristic on-screen extent. */
  radius: number
  /** Full (p100) radius including outliers — sizes the zoom-out + far-plane budget. */
  extent: number
}

/** Smallest core radius we report, so a degenerate (single-point / coincident) cloud
 *  still yields non-zero, finite derived constants instead of zero-size points. */
export const MIN_CLOUD_RADIUS = 1

/** Measure a render set's centre, core radius and full extent (see {@link CloudMetrics}). */
export function cloudMetrics(points: ReadonlyArray<XYZ>, pct = 0.95): CloudMetrics {
  const center = robustCenter(points, pct)
  const radius = Math.max(robustRadius(points, center, pct), MIN_CLOUD_RADIUS)
  const extent = Math.max(robustRadius(points, center, 1), radius)
  return { center, radius, extent }
}

/** Geometry-matched zoom window: approach to a small fraction of the core radius, pull
 *  back to several times the full extent — so you can inspect a single point yet never
 *  lose the cloud, at any embedding scale. */
export function distanceClamp(metrics: CloudMetrics): DistanceBounds {
  return {
    min: Math.max(metrics.radius * 0.05, 0.05),
    max: metrics.extent * 8,
  }
}

/** Ease `current` toward `target` by fraction `alpha` (0..1) each frame — a smooth,
 *  framerate-light follow for orbit/zoom/pan (the OrbitControls "damping" feel).
 *  `alpha = 1` snaps (used under prefers-reduced-motion). Azimuth is lerped directly:
 *  callers advance current + target together, so their gap stays small (no wrap). */
export function dampOrbit(current: Orbit, target: Orbit, alpha: number): Orbit {
  const a = Math.min(1, Math.max(0, alpha))
  const lerp = (x: number, y: number): number => x + (y - x) * a
  return {
    azimuth: lerp(current.azimuth, target.azimuth),
    polar: clampPolar(lerp(current.polar, target.polar)),
    distance: lerp(current.distance, target.distance),
    target: {
      x: lerp(current.target.x, target.target.x),
      y: lerp(current.target.y, target.target.y),
      z: lerp(current.target.z, target.target.z),
    },
  }
}
