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
import type { MemberStem, R2dtDiagram, R2dtManifest } from './data/types'

export type { R2dtDiagram, R2dtManifest }

let manifestPromise: Promise<R2dtManifest | null> | null = null
const diagramCache = new Map<string, Promise<R2dtDiagram | null>>()
let termManifestPromise: Promise<R2dtManifest | null> | null = null
const termDiagramCache = new Map<string, Promise<R2dtDiagram | null>>()

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

/** Fetch the TERMINATOR diagram availability manifest once (cached). Same contract as
 *  {@link loadR2dtManifest} for the committed `r2dt/term/` assets — null → the
 *  conformation toggle has no terminator R2DT diagrams (degrades to fornac). */
export function loadTerminatorManifest(): Promise<R2dtManifest | null> {
  if (termManifestPromise) return termManifestPromise
  const p = fetch(dataUrl('r2dt/term/manifest.json'))
    .then((res) => (res.ok ? (res.json() as Promise<R2dtManifest>) : null))
    .catch(() => null)
  termManifestPromise = p
  void p.then((v) => {
    if (v == null) termManifestPromise = null
  })
  return p
}

/** Fetch one member's committed TERMINATOR diagram (cached per member). Same contract as
 *  {@link loadR2dtDiagram} for the `r2dt/term/` assets; null when absent / on failure. */
export function loadTerminatorDiagram(memberId: string): Promise<R2dtDiagram | null> {
  const cached = termDiagramCache.get(memberId)
  if (cached) return cached
  const p = fetch(dataUrl(`r2dt/term/${memberId}.json`))
    .then((res) => (res.ok ? (res.json() as Promise<R2dtDiagram>) : null))
    .catch(() => null)
  termDiagramCache.set(memberId, p)
  void p.then((v) => {
    if (v == null) termDiagramCache.delete(memberId)
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

function unitVector(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fallback: [number, number] = [1, 0],
): [number, number] {
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy)
  if (len > 1e-6) return [dx / len, dy / len]
  return fallback
}

function stemCentroid(d: R2dtDiagram, start: number, end: number): [number, number] {
  const lo = Math.max(1, Math.min(start, d.x.length))
  const hi = Math.max(lo, Math.min(end, d.x.length))
  let sx = 0
  let sy = 0
  let n = 0
  for (let r = lo; r <= hi; r++) {
    sx += d.x[r - 1]
    sy += d.y[r - 1]
    n += 1
  }
  return n > 0 ? [sx / n, sy / n] : [0, 0]
}

/**
 * Add a display-only spacer after Stem I, before Stem II, using the same idea as
 * tbdb.io's R2DT/VARNA spacer: the biological sequence frame stays unchanged, but
 * the downstream coordinates are shifted outward when the Stem-I→Stem-II connector
 * is too short to keep Stem-I loops visually clear of neighbouring structure.
 *
 * This returns the original object when a member lacks Stem I/II, when the existing
 * connector is already spacious, or when the coordinates are malformed. It never
 * edits `seq` or `pairs`, so residue-indexed color and feature overlays remain in
 * the committed member frame.
 */
export function withStemIToIISpacer(d: R2dtDiagram, stems: MemberStem[]): R2dtDiagram {
  const stemI = stems.find((s) => s.key === 'i')
  const stemII = stems.find((s) => s.key === 'ii')
  const n = d.seq.length
  if (!stemI || !stemII || n < 2 || d.x.length !== n || d.y.length !== n) return d
  if (stemI.end < 1 || stemI.end >= n || stemII.start <= stemI.end) return d

  const split = Math.min(n, stemI.end + 1)
  const anchor = Math.max(1, stemI.end)
  const spacing = nucleotideSpacing(d)
  if (!Number.isFinite(spacing) || spacing <= 0) return d

  const connector = Math.hypot(d.x[split - 1] - d.x[anchor - 1], d.y[split - 1] - d.y[anchor - 1])
  const linkerNt = Math.max(0, stemII.start - stemI.end - 1)
  // Short natural linkers get the largest virtual spacer; longer linkers still get
  // a modest floor because R2DT can pack them tightly around the template junction.
  const targetSteps = Math.max(5, 7 - Math.min(linkerNt, 4) * 0.5)
  const target = targetSteps * spacing
  const extra = target - connector
  if (extra < 0.25 * spacing) return d

  const stemIC = stemCentroid(d, stemI.start, stemI.end)
  const downstreamC = stemCentroid(d, split, Math.min(n, Math.max(stemII.end, split)))
  const fallback = unitVector(stemIC[0], stemIC[1], downstreamC[0], downstreamC[1])
  const [ux, uy] = unitVector(
    d.x[anchor - 1],
    d.y[anchor - 1],
    d.x[split - 1],
    d.y[split - 1],
    fallback,
  )

  const x = d.x.slice()
  const y = d.y.slice()
  for (let i = split - 1; i < n; i++) {
    x[i] += ux * extra
    y[i] += uy * extra
  }
  return { ...d, x, y }
}
