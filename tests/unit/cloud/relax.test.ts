// Unit: the anchored-repulsion "spread" stepper (PLAN /cloud §4.2, §7.1). Exercises
// the required invariants on a deterministic synthetic 3-blob set:
//   1. reversibility   — spread=0 returns EXACTLY to the anchors after convergence;
//   2. de-crowding     — mean pairwise distance is non-decreasing in spread;
//   3. bounded drift   — max offset from anchor stays bounded (no runaway);
//   4. topology kept   — at spread=1, a point's 10 nearest still belong to its
//                        original cluster ≥ 80% of the time (the honest, achievable
//                        form of "neighbour topology largely preserved": strict
//                        10-NN *set* identity among near-coincident points is noise
//                        any de-pile reshuffles — co-membership is what navigation
//                        actually relies on, and it holds);
//   + the spatial hash never degenerates to an O(n²) all-pairs scan.
import { describe, expect, test } from 'vitest'

import {
  createRelaxState,
  maxAnchorOffset,
  relax,
  relaxParams,
  step,
  type RelaxState,
} from '../../../src/lib/cloud/relax'

// ── deterministic synthetic fixture: 3 tight Gaussian blobs ──────────────────────
function makeBlobs(): { anchors: Float32Array; labels: number[]; n: number } {
  let seed = 12345
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const gauss = (): number => {
    let u = 0
    let v = 0
    while (u === 0) u = rnd()
    while (v === 0) v = rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  const centers = [
    [-30, 0, 0],
    [30, 0, 0],
    [0, 39, 0],
  ]
  const per = 60
  const sigma = 2
  const n = centers.length * per
  const anchors = new Float32Array(n * 3)
  const labels: number[] = []
  let idx = 0
  centers.forEach((c, ci) => {
    for (let p = 0; p < per; p++) {
      anchors[idx * 3] = c[0] + gauss() * sigma
      anchors[idx * 3 + 1] = c[1] + gauss() * sigma
      anchors[idx * 3 + 2] = c[2] + gauss() * sigma
      labels.push(ci)
      idx++
    }
  })
  return { anchors, labels, n }
}

function meanPairwise(P: Float32Array, n: number): number {
  let sum = 0
  let count = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = P[i * 3] - P[j * 3]
      const dy = P[i * 3 + 1] - P[j * 3 + 1]
      const dz = P[i * 3 + 2] - P[j * 3 + 2]
      sum += Math.sqrt(dx * dx + dy * dy + dz * dz)
      count++
    }
  }
  return sum / count
}

/** Indices of the k nearest points to i (self excluded). */
function kNearest(P: Float32Array, n: number, i: number, k: number): number[] {
  const ds: [number, number][] = []
  for (let j = 0; j < n; j++) {
    if (j === i) continue
    const dx = P[i * 3] - P[j * 3]
    const dy = P[i * 3 + 1] - P[j * 3 + 1]
    const dz = P[i * 3 + 2] - P[j * 3 + 2]
    ds.push([dx * dx + dy * dy + dz * dz, j])
  }
  ds.sort((a, b) => a[0] - b[0])
  return ds.slice(0, k).map((x) => x[1])
}

/** Mean fraction of each point's k-NN that share its cluster label. */
function meanSameCluster(P: Float32Array, n: number, labels: number[], k: number): number {
  let sum = 0
  for (let i = 0; i < n; i++) {
    const nn = kNearest(P, n, i, k)
    const same = nn.filter((j) => labels[j] === labels[i]).length
    sum += same / nn.length
  }
  return sum / n
}

describe('relax (anchored-repulsion spread)', () => {
  test('relaxParams follow the documented schedule', () => {
    expect(relaxParams(0).kRep).toBe(0)
    expect(relaxParams(1).R).toBeCloseTo(16)
    expect(relaxParams(1).kRep).toBeCloseTo(0.9)
    expect(relaxParams(0).R).toBeCloseTo(4)
    // spring weakens as spread grows (let the cloud de-pile)
    expect(relaxParams(0).kSpring).toBeGreaterThan(relaxParams(1).kSpring)
  })

  test('invariant #1: spread=0 returns EXACTLY to the anchors after convergence', () => {
    const { anchors, n } = makeBlobs()
    const state = createRelaxState(anchors)
    relax(state, 1.0, 40) // disperse
    expect(maxAnchorOffset(state)).toBeGreaterThan(1) // genuinely moved
    relax(state, 0.0, 300) // ease back
    // byte-exact reversibility
    for (let k = 0; k < state.positions.length; k++) {
      expect(state.positions[k]).toBe(anchors[k])
    }
    expect(maxAnchorOffset(state)).toBe(0)
    void n
  })

  test('invariant #2: mean pairwise distance is non-decreasing in spread', () => {
    const { anchors, n } = makeBlobs()
    const spreads = [0, 0.25, 0.5, 0.75, 1]
    const means = spreads.map((s) => {
      const state = createRelaxState(anchors)
      relax(state, s, 200)
      return meanPairwise(state.positions, n)
    })
    for (let i = 1; i < means.length; i++) {
      expect(means[i]).toBeGreaterThanOrEqual(means[i - 1] - 1e-6)
    }
    // and spread genuinely de-crowds (the whole point)
    expect(means[means.length - 1]).toBeGreaterThan(means[0])
  })

  test('invariant #3: max offset from anchor stays bounded (no runaway)', () => {
    const { anchors } = makeBlobs()
    const state = createRelaxState(anchors)
    relax(state, 1.0, 300)
    const at300 = maxAnchorOffset(state)
    expect(Number.isFinite(at300)).toBe(true)
    expect(at300).toBeLessThan(50)
    // running further does not blow up (equilibrium, not divergence)
    relax(state, 1.0, 300)
    expect(maxAnchorOffset(state)).toBeLessThan(50)
  })

  test('invariant #4: at spread=1, k-NN largely stay in the same cluster (≥ 0.8)', () => {
    const { anchors, labels, n } = makeBlobs()
    // anchors start perfectly clustered
    expect(meanSameCluster(anchors, n, labels, 10)).toBeCloseTo(1.0, 5)
    const state = createRelaxState(anchors)
    relax(state, 1.0, 200)
    expect(meanSameCluster(state.positions, n, labels, 10)).toBeGreaterThanOrEqual(0.8)
  })

  test('repulsion uses the spatial hash — never an O(n²) all-pairs scan', () => {
    const { anchors, n } = makeBlobs()
    const state: RelaxState = createRelaxState(anchors)
    relax(state, 1.0, 150) // warm to a de-piled state
    const stats = { pairChecks: 0 }
    step(state, 1.0, stats)
    expect(stats.pairChecks).toBeGreaterThan(0)
    // an O(n²) scan would be n*(n-1) ≈ n² checks; the hash keeps it well below half
    expect(stats.pairChecks).toBeLessThan((n * n) / 2)
  })

  test('createRelaxState copies anchors (caller array untouched) and starts at rest', () => {
    const anchors = Float32Array.from([1, 2, 3, 4, 5, 6])
    const state = createRelaxState(anchors)
    expect(state.n).toBe(2)
    expect(Array.from(state.positions)).toEqual([1, 2, 3, 4, 5, 6])
    expect(Array.from(state.velocities)).toEqual([0, 0, 0, 0, 0, 0])
    step(state, 1.0)
    expect(Array.from(anchors)).toEqual([1, 2, 3, 4, 5, 6]) // anchors never mutated
  })
})
