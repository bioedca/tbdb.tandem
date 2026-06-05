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
/** Distance clamp so zoom can't invert or fly away. */
export const MIN_DISTANCE = 20
export const MAX_DISTANCE = 1200

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

/** Clamp a distance into [MIN_DISTANCE, MAX_DISTANCE]. */
export function clampDistance(distance: number): number {
  return Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, distance))
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

/** Zoom by a multiplicative factor (wheel): distance *= factor, clamped. */
export function orbitZoom(orbit: Orbit, factor: number): Orbit {
  return { ...orbit, distance: clampDistance(orbit.distance * factor) }
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
