// tbdb.tandem similarity-cloud element↔locus aggregation + click semantics
// (PLAN /cloud §4.4, §6.4) — pure, framework-agnostic, unit-tested.
//
// The cloud defaults to ONE dot per locus (like `/tree`'s locus-collapse default),
// with an element toggle that reveals every element separately. Where `tree.ts`
// collapses clades topologically, the cloud collapses geometrically: a locus dot
// sits at the CENTROID of its elements' embedded coordinates (cheap, and consistent
// with the per-locus view). The locus specifier is aggregated exactly as
// `buildLocusTipMeta` does (single shared, or `A;B` sorted, or null).

import type { CloudPoint, Granularity, PointAction } from './types'

/** A point ready to render: a raw element, or a locus centroid carrying its count. */
export interface CloudRenderPoint extends CloudPoint {
  /** 1 for an element; the locus's element count for an aggregated locus dot. */
  memberCount: number
}

/** Distinct, sorted, non-`?`/non-null specifier tokens across a set of points. */
function distinctSpecifiers(points: CloudPoint[]): string[] {
  const set = new Set<string>()
  for (const p of points) {
    if (p.spec != null && p.spec !== '?') set.add(p.spec)
  }
  return [...set].sort()
}

/** Mean of a numeric field over the points that have it (null if none do). */
function meanOf(points: CloudPoint[], pick: (p: CloudPoint) => number | null): number | null {
  let sum = 0
  let n = 0
  for (const p of points) {
    const v = pick(p)
    if (v != null) {
      sum += v
      n++
    }
  }
  return n === 0 ? null : sum / n
}

/**
 * Collapse element points to one centroid point per locus (`tandem_id`), matching
 * the `buildLocusTipMeta` aggregation conventions:
 *   • coordinates = the mean of the locus's element coordinates;
 *   • specifier = the single shared specifier, `A;B` (sorted) when elements disagree,
 *     or null when all are unknown;  `mixed` = more than one distinct specifier;
 *   • ΔΔG = mean of the elements' ΔΔG (null when none have it);
 *   • locus-level fields (phylum / func / type / conf / ident / ncores) are taken
 *     from the locus's elements (identical across them — they are per-locus).
 * A point with no `tandem_id` falls back to grouping by its own `id` (never throws).
 */
export function toLocusPoints(points: CloudPoint[]): CloudRenderPoint[] {
  const groups = new Map<string, CloudPoint[]>()
  for (const p of points) {
    const key = p.tandem_id || p.id
    const g = groups.get(key)
    if (g) g.push(p)
    else groups.set(key, [p])
  }

  const out: CloudRenderPoint[] = []
  for (const [tandemId, members] of groups) {
    const n = members.length
    const cx = members.reduce((s, p) => s + p.x, 0) / n
    const cy = members.reduce((s, p) => s + p.y, 0) / n
    const cz = members.reduce((s, p) => s + p.z, 0) / n
    const specs = distinctSpecifiers(members)
    const first = members[0]
    out.push({
      ...first,
      id: tandemId,
      tandem_id: tandemId,
      spec: specs.length === 0 ? null : specs.join(';'),
      mixed: specs.length > 1,
      ddg: meanOf(members, (p) => p.ddg),
      x: cx,
      y: cy,
      z: cz,
      memberCount: n,
    })
  }
  return out
}

/** Render points for a granularity: raw elements (memberCount 1) or locus centroids. */
export function aggregatePoints(points: CloudPoint[], granularity: Granularity): CloudRenderPoint[] {
  if (granularity === 'locus') return toLocusPoints(points)
  return points.map((p) => ({ ...p, memberCount: 1 }))
}

/**
 * What a click on a point resolves to (pure; mirrors `PhyloTree.onTipClick`, §6.4):
 *   • not `selectable` (the full `/cloud` page) → navigate to the locus detail page;
 *   • `selectable` (a dashboard panel) → toggle the specifier facet, but ONLY when the
 *     point carries a single concrete specifier (a null / mixed `A;B` specifier
 *     no-ops, since the facet vocabulary is single amino acids).
 */
export function pointAction(
  point: Pick<CloudPoint, 'tandem_id' | 'spec'>,
  selectable: boolean,
): PointAction {
  if (!selectable) return { kind: 'navigate', tandem_id: point.tandem_id }
  const spec = point.spec
  if (spec == null || spec === '?' || spec.includes(';')) return { kind: 'none' }
  return { kind: 'facet', specifier: spec }
}
