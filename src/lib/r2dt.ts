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

export const R2DT_MIN_LOOP_CLEARANCE_RATIO = 0.72

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

function loopHalfAngle(chordOverStep: number, k: number): number {
  let lo = 1e-6
  let hi = Math.PI - 1e-6
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const value = Math.sin(mid) / Math.sin(mid / (k + 1))
    if (value > chordOverStep) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

function arcPoints(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  k: number,
  spacing: number,
  side: 1 | -1,
): [number, number][] | null {
  const chord = Math.hypot(x1 - x0, y1 - y0)
  if (chord < 1e-6 || k <= 0) return null
  // If the anchors sit far apart, let the display-only loop use a slightly larger
  // step rather than collapsing to a straight guardrail. This preserves readable
  // separation without editing residue indices or base-pair data.
  const step = Math.max(spacing, chord / (k + 0.65))
  if (chord / step >= k + 1) {
    const straight: [number, number][] = []
    for (let t = 1; t <= k; t++) {
      const f = t / (k + 1)
      straight.push([x0 + f * (x1 - x0), y0 + f * (y1 - y0)])
    }
    return straight
  }
  const theta = loopHalfAngle(chord / step, k)
  const delta = (2 * theta) / (k + 1)
  let heading = Math.atan2(y1 - y0, x1 - x0) + side * ((delta * k) / 2)
  let px = x0
  let py = y0
  const pts: [number, number][] = []
  for (let t = 0; t < k; t++) {
    px += step * Math.cos(heading)
    py += step * Math.sin(heading)
    pts.push([px, py])
    heading -= side * delta
  }
  return pts
}

function minClearance(pts: [number, number][], obs: [number, number][]): number {
  if (!pts.length || !obs.length) return Number.POSITIVE_INFINITY
  let best = Number.POSITIVE_INFINITY
  for (const [x, y] of pts) {
    for (const [ox, oy] of obs) {
      best = Math.min(best, Math.hypot(x - ox, y - oy))
    }
  }
  return best
}

function pairResidues(d: R2dtDiagram): Set<number> {
  const out = new Set<number>()
  for (const [a, b] of d.pairs) {
    out.add(a)
    out.add(b)
  }
  return out
}

function terminatorSpan(terminatorPairs: [number, number][]): { start: number; end: number } | null {
  if (!terminatorPairs.length) return null
  let start = Number.POSITIVE_INFINITY
  let end = 0
  for (const [a, b] of terminatorPairs) {
    start = Math.min(start, a, b)
    end = Math.max(end, a, b)
  }
  return Number.isFinite(start) && end >= start ? { start, end } : null
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

/**
 * Open enclosed unpaired runs inside the visible R2DT stems so loops and bulges
 * read as loops, not as tightly staggered clash-avoidance tracks. The committed
 * R2DT coordinates already avoid hard overlap, but some Stem-I template guardrails
 * are still visually cramped after the inter-stem spacer gives us room. This is a
 * display-only coordinate pass: paired residues, `seq`, and `pairs` stay untouched,
 * so all residue-indexed color/feature overlays remain aligned.
 */
export function withReadableStemLoops(d: R2dtDiagram, spans: { start: number; end: number }[]): R2dtDiagram {
  const n = d.seq.length
  if (n < 3 || d.x.length !== n || d.y.length !== n || !spans.length) return d
  const spacing = nucleotideSpacing(d)
  if (!Number.isFinite(spacing) || spacing <= 0) return d

  const paired = pairResidues(d)
  const x = d.x.slice()
  const y = d.y.slice()
  const cx = x.reduce((sum, v) => sum + v, 0) / n
  const cy = y.reduce((sum, v) => sum + v, 0) / n
  let changed = false

  for (const span of spans) {
    const lo = Math.max(1, Math.min(span.start, span.end, n))
    const hi = Math.max(lo, Math.min(Math.max(span.start, span.end), n))
    let i = lo
    while (i <= hi) {
      if (paired.has(i)) {
        i += 1
        continue
      }
      let j = i
      while (j <= hi && !paired.has(j)) j += 1
      const s = i
      const e = j - 1
      const k = e - s + 1
      const left = s - 1
      const right = e + 1
      if (k >= 1 && left >= lo && right <= hi && paired.has(left) && paired.has(right)) {
        const obs: [number, number][] = []
        for (let r = 1; r <= n; r++) {
          if (r < s || r > e) obs.push([x[r - 1], y[r - 1]])
        }
        const candidates = ([1, -1] as const)
          .map((side) => {
            const pts = arcPoints(x[left - 1], y[left - 1], x[right - 1], y[right - 1], k, spacing, side)
            if (!pts) return null
            const bx = pts.reduce((sum, p) => sum + p[0], 0) / k
            const by = pts.reduce((sum, p) => sum + p[1], 0) / k
            return {
              pts,
              clearance: minClearance(pts, obs),
              outward: Math.hypot(bx - cx, by - cy),
            }
          })
          .filter((c): c is { pts: [number, number][]; clearance: number; outward: number } => !!c)
          .sort((a, b) => b.clearance - a.clearance || b.outward - a.outward)
        const best = candidates[0]
        if (best && best.clearance >= R2DT_MIN_LOOP_CLEARANCE_RATIO * spacing) {
          for (let r = s; r <= e; r++) {
            const [nx, ny] = best.pts[r - s]
            if (Math.abs(x[r - 1] - nx) > 1e-6 || Math.abs(y[r - 1] - ny) > 1e-6) changed = true
            x[r - 1] = nx
            y[r - 1] = ny
          }
        }
      }
      i = j
    }
  }

  return changed ? { ...d, x, y } : d
}

/** Full display-only R2DT readability pass used by the viewer. */
export function withReadableR2dtLayout(
  d: R2dtDiagram,
  stems: MemberStem[],
  variant: 'antiterm' | 'terminator' = 'antiterm',
  terminatorPairs: [number, number][] = [],
): R2dtDiagram {
  const spaced = withStemIToIISpacer(d, stems)
  const spans: { start: number; end: number }[] =
    variant === 'terminator'
      ? stems.filter((s) => s.key !== 'at').map(({ start, end }) => ({ start, end }))
      : stems.map(({ start, end }) => ({ start, end }))
  const term = variant === 'terminator' ? terminatorSpan(terminatorPairs) : null
  if (term) spans.push(term)
  return withReadableStemLoops(spaced, spans)
}
