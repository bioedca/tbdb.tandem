// R2DT secondary-structure diagrams (PLAN §9) — lazy loaders + layout helpers.
//
// R2DT draws each T-box element on the canonical RF00230 / T-box template — the
// recognizable, reproducible textbook layout, the complement to fornac's
// force-directed render. The diagrams are generated offline (data-pipeline/
// build_r2dt.py) and committed under public/data/r2dt/; this module fetches one
// member's compact diagram on demand and the small availability manifest once.
// Coloring is NOT here — the component paints each nucleotide from color.ts
// `buildStemColorMap` (the same palette fornac uses), so colors stay in one place.

import { dataUrl } from './data/load'
import type { R2dtDiagram, R2dtManifest } from './data/types'

export type { R2dtDiagram, R2dtManifest }

let manifestPromise: Promise<R2dtManifest | null> | null = null
const diagramCache = new Map<string, Promise<R2dtDiagram | null>>()

/** Fetch the R2DT availability manifest once (cached). Resolves null if absent
 *  (e.g. diagrams not yet generated) so the UI degrades to fornac-only. Only a
 *  SUCCESSFUL result is cached — a null/error result clears the cache slot so a
 *  later mount retries (mirrors lib/fornac.ts), in case the failure was transient. */
export function loadR2dtManifest(): Promise<R2dtManifest | null> {
  if (manifestPromise) return manifestPromise
  const p = fetch(dataUrl('r2dt/manifest.json'))
    .then((res) => (res.ok ? (res.json() as Promise<R2dtManifest>) : null))
    .catch(() => null)
  manifestPromise = p
  void p.then((v) => {
    if (v == null) manifestPromise = null
  })
  return p
}

/** Fetch one member's compact R2DT diagram (cached per member). Resolves null when
 *  the member has no committed diagram or the fetch fails (→ the viewer falls back).
 *  Only a successful result is cached, so a transient failure retries on a later view. */
export function loadR2dtDiagram(memberId: string): Promise<R2dtDiagram | null> {
  const cached = diagramCache.get(memberId)
  if (cached) return cached
  const p = fetch(dataUrl(`r2dt/${memberId}.json`))
    .then((res) => (res.ok ? (res.json() as Promise<R2dtDiagram>) : null))
    .catch(() => null)
  diagramCache.set(memberId, p)
  void p.then((v) => {
    if (v == null) diagramCache.delete(memberId)
  })
  return p
}

/** SVG viewBox `[minX, minY, width, height]` for a diagram's nucleotide centres,
 *  with a uniform padding so glyphs/circles at the edges aren't clipped. Returns a
 *  unit box for an empty diagram (defensive). */
export function diagramViewBox(d: R2dtDiagram, pad = 14): [number, number, number, number] {
  if (!d.x.length) return [0, 0, 1, 1]
  const minX = Math.min(...d.x)
  const maxX = Math.max(...d.x)
  const minY = Math.min(...d.y)
  const maxY = Math.max(...d.y)
  return [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad]
}

/** Median nearest-neighbour backbone step — the natural glyph/circle scale for a
 *  diagram (R2DT spaces consecutive nucleotides ~evenly). Used to size circles and
 *  letters so they read at any molecule length. Falls back to a sane default. */
export function nucleotideSpacing(d: R2dtDiagram): number {
  const n = d.x.length
  if (n < 2) return 12
  const steps: number[] = []
  for (let i = 1; i < n; i++) {
    steps.push(Math.hypot(d.x[i] - d.x[i - 1], d.y[i] - d.y[i - 1]))
  }
  steps.sort((a, b) => a - b)
  const mid = steps[Math.floor(steps.length / 2)]
  return mid > 0 ? mid : 12
}
