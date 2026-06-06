// tbdb.tandem similarity-cloud "spread" transform (PLAN /cloud §4.2) — pure,
// dependency-free, unit-tested without WebGL or Svelte (mirrors how `tree.ts` keeps
// the tree logic pure).
//
// THE honest-distortion centerpiece. A 3D PCoA embedding faithfully preserves
// patristic distance but PILES near-identical Stem-I sequences on top of each other
// (overlap of near-identical sequences IS the data). This anchored-repulsion stepper
// de-piles the crowded core for clickability WITHOUT destroying neighbour topology
// and while remaining fully reversible: every point is sprung toward its true PCoA
// anchor, and at `spread === 0` the cloud returns EXACTLY to those anchors.
//
// Each point feels two forces:
//   • a short-range REPULSION from nearby points (de-crowds the core), evaluated via
//     a uniform spatial hash (key = floor(coord / R), scan the 27 neighbour cells) so
//     work scales with the actual local neighbour count — never an O(n²) all-pairs scan;
//   • a SPRING toward its fixed anchor (keeps the map anchored to truth; bounds drift).
//
// The honesty UI surfaces the resulting mean offset; the locus detail pages remain the
// source of truth. This is a navigation aid, not a measurement instrument.

/** Live relaxation state. `positions`/`velocities` are mutated in place each step;
 *  `anchors` is the fixed truth (the PCoA coordinates). All are flat `[x,y,z,…]`. */
export interface RelaxState {
  /** Live positions, length `n*3`. */
  positions: Float32Array
  /** Per-component velocities, length `n*3`. */
  velocities: Float32Array
  /** Fixed PCoA anchor coordinates, length `n*3`. */
  anchors: Float32Array
  n: number
  /** Cooling factor (1 = fully energized → 0 = frozen). Forces are injected ∝ alpha,
   *  so motion necessarily decays to rest — the layout settles instead of jiggling
   *  forever in a force limit-cycle. `reheat()` re-energizes it on a spread change. */
  alpha: number
}

/** Resolved force parameters for a given spread (exported for inspection/tests). */
export interface RelaxParams {
  /** Repulsion radius (and spatial-hash cell size). */
  R: number
  /** Spring stiffness toward the anchor. */
  kSpring: number
  /** Repulsion strength. */
  kRep: number
  /** Velocity damping per step. */
  damping: number
  /** Per-axis velocity cap (prevents runaway). */
  velCap: number
}

/** Below this spread the cloud eases back to the anchors (the reversible rest state). */
export const SPREAD_REST = 0.001
/** Ease factor toward anchors when at rest (geometric approach). */
const EASE = 0.25
/** Once a coordinate is within this of its anchor at rest, snap it EXACTLY (so
 *  `spread === 0` is byte-exactly reversible after convergence — invariant #1). */
const REST_EPS = 1e-3

// ── Cooling schedule (kills the perpetual "jiggle" at non-zero spread) ─────────────
// The anchored-repulsion field has no exact fixed point — the hard repulsion cutoff at
// `d = R` and the `1/d` core singularity leave a stable limit-cycle, so without cooling
// the dots oscillate forever. Borrowing d3-force's remedy: an `alpha` that eases 1→0 and
// scales the injected force, so the velocity damps to zero and the layout FREEZES at its
// (near-)equilibrium. A spread change calls `reheat()` to re-energize it.
/** Per-step geometric decay of `alpha` toward 0 (≈110 steps, ~1.8 s, to ALPHA_MIN). */
export const ALPHA_DECAY = 0.035
/** At/under this alpha the forces are negligible; combined with a tiny residual speed
 *  the layout is treated as settled (see {@link isSettled}). */
export const ALPHA_MIN = 0.02
/** Per-step speed (world units/step) under which a cooled layout counts as at rest. */
export const SETTLE_SPEED = 0.02

/** Force parameters for a spread in (0,1] (PLAN §4.2 — the documented constants). */
export function relaxParams(spread: number): RelaxParams {
  const s = Math.min(1, Math.max(0, spread))
  return {
    R: 4 + 12 * s,
    kSpring: 0.06 * (1 - 0.92 * s),
    kRep: 0.9 * s,
    damping: 0.82,
    velCap: 3,
  }
}

/** Create a relaxation state from anchor coordinates (positions start AT the anchors,
 *  velocities zero, fully energized). `anchors` is copied so the caller's array is
 *  never mutated. */
export function createRelaxState(anchors: Float32Array): RelaxState {
  const a = Float32Array.from(anchors)
  return {
    positions: Float32Array.from(anchors),
    velocities: new Float32Array(anchors.length),
    anchors: a,
    n: anchors.length / 3,
    alpha: 1,
  }
}

/** Re-energize the layout so it relaxes toward the equilibrium for a NEW spread (call
 *  on every spread change). Without this a cooled layout would stay frozen and ignore
 *  the slider. */
export function reheat(state: RelaxState, alpha = 1): void {
  state.alpha = Math.max(state.alpha, alpha)
}

/** Largest per-component speed across all points — the residual motion the settle test
 *  watches (a cooled layout with near-zero speed is at rest). */
export function maxSpeed(state: RelaxState): number {
  const V = state.velocities
  let m = 0
  for (let k = 0; k < V.length; k++) {
    const a = V[k] < 0 ? -V[k] : V[k]
    if (a > m) m = a
  }
  return m
}

/** True once the layout has come to rest, so the render loop can stop stepping (no
 *  perpetual jiggle): at/under the rest spread it must sit EXACTLY on the anchors;
 *  above it, `alpha` must have cooled past ALPHA_MIN and motion fallen below
 *  SETTLE_SPEED. */
export function isSettled(state: RelaxState, spread: number): boolean {
  if (spread <= SPREAD_REST) return maxAnchorOffset(state) === 0
  return state.alpha <= ALPHA_MIN && maxSpeed(state) <= SETTLE_SPEED
}

/** Optional per-step instrumentation (the O(n²) guard asserts `pairChecks ≪ n²`). */
export interface StepStats {
  pairChecks: number
}

/**
 * Advance the relaxation one step (mutates `state.positions` / `state.velocities`).
 *
 * At `spread ≤ SPREAD_REST` the cloud eases toward the anchors and zeroes velocity,
 * snapping any settled coordinate exactly onto its anchor — so it is fully reversible.
 * Otherwise each point integrates spring + spatial-hash repulsion with damping and a
 * per-axis velocity cap. Pass `stats` to count pairwise distance evaluations.
 */
export function step(state: RelaxState, spread: number, stats?: StepStats): void {
  const { positions: P, velocities: V, anchors: A, n } = state

  // ── Rest: ease back to truth, exactly (reversibility, invariant #1) ──────────────
  if (spread <= SPREAD_REST) {
    for (let k = 0; k < P.length; k++) {
      const residual = A[k] - P[k]
      if (Math.abs(residual) < REST_EPS) P[k] = A[k]
      else P[k] += residual * EASE
      V[k] = 0
    }
    state.alpha = 0
    return
  }

  const { R, kSpring, kRep, damping, velCap } = relaxParams(spread)
  const invR = 1 / R

  // ── Uniform spatial hash: cell key = floor(coord / R) ────────────────────────────
  const buckets = new Map<number, number[]>()
  const cellOf = (i: number): [number, number, number] => [
    Math.floor(P[i * 3] * invR),
    Math.floor(P[i * 3 + 1] * invR),
    Math.floor(P[i * 3 + 2] * invR),
  ]
  // Pack a 3D integer cell into one number key (offset so negatives stay distinct).
  const KEY = (cx: number, cy: number, cz: number): number =>
    (cx + 2048) * 4194304 + (cy + 2048) * 2048 + (cz + 2048)
  for (let i = 0; i < n; i++) {
    const [cx, cy, cz] = cellOf(i)
    const key = KEY(cx, cy, cz)
    const b = buckets.get(key)
    if (b) b.push(i)
    else buckets.set(key, [i])
  }

  const R2 = R * R
  const fx = new Float32Array(n)
  const fy = new Float32Array(n)
  const fz = new Float32Array(n)

  // ── Repulsion: only over the 27 neighbouring cells of each point ─────────────────
  for (let i = 0; i < n; i++) {
    const ix = P[i * 3]
    const iy = P[i * 3 + 1]
    const iz = P[i * 3 + 2]
    const [cx, cy, cz] = cellOf(i)
    let ax = 0
    let ay = 0
    let az = 0
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const b = buckets.get(KEY(cx + dx, cy + dy, cz + dz))
          if (!b) continue
          for (let m = 0; m < b.length; m++) {
            const j = b[m]
            if (j === i) continue
            const ex = ix - P[j * 3]
            const ey = iy - P[j * 3 + 1]
            const ez = iz - P[j * 3 + 2]
            const d2 = ex * ex + ey * ey + ez * ez
            if (stats) stats.pairChecks++
            if (d2 >= R2 || d2 === 0) continue
            const d = Math.sqrt(d2)
            const mag = (kRep * (R - d)) / d // force magnitude along (Pi − Pj)/d
            ax += ex * mag
            ay += ey * mag
            az += ez * mag
          }
        }
      }
    }
    fx[i] = ax
    fy[i] = ay
    fz[i] = az
  }

  // ── Spring toward anchor + integrate (damping + velocity cap) ────────────────────
  // Forces are injected ∝ alpha (the cooling factor): the spread EQUILIBRIUM is where
  // repulsion balances spring, and scaling both by alpha preserves that balance point
  // while letting the per-step force — and hence the velocity — decay to zero, so the
  // layout freezes at equilibrium instead of orbiting it forever.
  const a = state.alpha
  const cap = (v: number): number => (v > velCap ? velCap : v < -velCap ? -velCap : v)
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      const k = i * 3 + c
      const f = ((c === 0 ? fx : c === 1 ? fy : fz)[i] + (A[k] - P[k]) * kSpring) * a
      let v = (V[k] + f) * damping
      v = cap(v)
      V[k] = v
      P[k] += v
    }
  }
  // Cool the layout for the next step (geometric decay toward 0).
  state.alpha = a * (1 - ALPHA_DECAY)
}

/** Run `iterations` steps at a fixed spread (convenience for tests / warm-up). */
export function relax(state: RelaxState, spread: number, iterations: number): void {
  for (let i = 0; i < iterations; i++) step(state, spread)
}

/** Mean offset of the live positions from their anchors (the honesty-UI readout). */
export function meanAnchorOffset(state: RelaxState): number {
  const { positions: P, anchors: A, n } = state
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const dx = P[i * 3] - A[i * 3]
    const dy = P[i * 3 + 1] - A[i * 3 + 1]
    const dz = P[i * 3 + 2] - A[i * 3 + 2]
    sum += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
  return sum / n
}

/** Max offset of any live position from its anchor (bounded-drift invariant #3). */
export function maxAnchorOffset(state: RelaxState): number {
  const { positions: P, anchors: A, n } = state
  let max = 0
  for (let i = 0; i < n; i++) {
    const dx = P[i * 3] - A[i * 3]
    const dy = P[i * 3 + 1] - A[i * 3 + 1]
    const dz = P[i * 3 + 2] - A[i * 3 + 2]
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d > max) max = d
  }
  return max
}
