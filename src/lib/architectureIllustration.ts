// Deterministic SVG glyph geometry for the tandem-architecture figure (PLAN §9①).
// Every value here is a pure function of width / x / fixed dims — NO randomness — so
// the figure is byte-stable for the visual-regression baselines. The biology-specific
// shapes (the Stem-I ladder, the terminator hairpin, the antiterminator alt-fold bulge)
// are kept explicit and small so the figure reads as a clean engraved methods-paper
// plate rather than a busy sketch.

export interface Band {
  x: number
  w: number
}

/** Vertical band geometry shared by the diagram and its element glyphs (SVG units). */
export interface ArchitectureGlyphDims {
  /** AA-codon pill baseline. */
  yAa: number
  /** Stem-I terminal-loop centre (above the body). */
  yLoop: number
  /** Body (tbox rect) top / height / bottom / vertical mid. */
  yBodyT: number
  bodyH: number
  yBodyB: number
  yBodyMid: number
  /** Stem-I loop radius. */
  loopR: number
  /** Antiterminator-bulge baseline (the alt-fold lane just below the body). */
  yAntiterm: number
}

/**
 * Spread a set of label centres so no two are closer than `minSep`, while keeping
 * them as near their requested x as possible (and in their original left→right
 * order). Pure + deterministic (no randomness) so the figure stays byte-stable for
 * the visual baselines: a single left→right pass pushes each centre right just enough
 * to clear its predecessor, then the whole run is shifted back by half the total push
 * so the cluster stays roughly centred on its requested positions. Used to keep the
 * specifier AA chips from overlapping when two elements sit close on the axis; a
 * lone or well-separated set is returned unchanged.
 */
export function spreadLabelXs(centres: number[], minSep: number): number[] {
  const n = centres.length
  if (n < 2 || minSep <= 0) return centres.slice()
  // Sort indices by requested x so we resolve overlaps in left→right order even if the
  // caller passes elements out of axis order; we write results back to original slots.
  const order = centres.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const placed = new Array<number>(n)
  let prev = -Infinity
  for (const { x, i } of order) {
    const px = Math.max(x, prev + minSep)
    placed[i] = px
    prev = px
  }
  // Re-centre: shift the whole run left by half the net rightward push (the gap between
  // the last placed and last requested), so the labels straddle their true positions.
  const lastReq = order[n - 1].x
  const lastPlaced = placed[order[n - 1].i]
  const shift = (lastPlaced - lastReq) / 2
  if (shift > 0) for (let k = 0; k < n; k++) placed[k] -= shift
  return placed
}

export interface Rung {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Evenly-spaced base-pair rungs for a two-rail stem ladder spanning `band` between
 * `yTop` and `yBot`. The rung COUNT is a deterministic function of width
 * (`round(w / step)`, clamped) so the ladder reads as a duplex at every zoom without
 * any randomness. Returns `[]` for a band too narrow to carry legible rungs.
 */
export function ladderRungs(band: Band, yTop: number, yBot: number, step = 8): Rung[] {
  if (band.w < 11) return []
  const pad = Math.min(4, band.w / 6)
  const span = band.w - pad * 2
  const n = Math.min(8, Math.max(2, Math.round(span / step)))
  return Array.from({ length: n }, (_, i) => {
    const x = band.x + pad + (span * (i + 0.5)) / n
    return { x1: x, y1: yTop, x2: x, y2: yBot }
  })
}

/** The two horizontal rails of a stem ladder (inset by `pad` from the band ends). */
export function ladderRails(band: Band): { x0: number; x1: number } {
  const pad = Math.min(4, band.w / 6)
  return { x0: band.x + pad, x1: band.x + band.w - pad }
}

/**
 * A clean RNA stem-loop hairpin centred on `cx`, rising `height` units from `yBase`
 * to a rounded loop of radius `halfWidth`. Returns the two antiparallel strand paths,
 * the semicircular loop-cap path, and `nRungs` evenly-spaced base-pair rungs up the
 * stem. Used for the Transcriptional terminator (tall, solid) and — shorter + dashed —
 * the Translational anti-SD sequestrator, so the two conformations rhyme visually.
 */
export interface Hairpin {
  strands: string
  loop: string
  rungs: Rung[]
  apexY: number
}

export function hairpin(cx: number, yBase: number, height = 30, halfWidth = 6, nRungs = 3): Hairpin {
  const apexY = yBase - height
  const strandTopY = apexY + halfWidth // strands stop where the loop cap begins
  const left = `M ${cx - halfWidth} ${yBase} L ${cx - halfWidth} ${strandTopY}`
  const right = `M ${cx + halfWidth} ${yBase} L ${cx + halfWidth} ${strandTopY}`
  // Loop cap: a half-ellipse arc joining the two strand tops over the apex.
  const loop = `M ${cx - halfWidth} ${strandTopY} A ${halfWidth} ${halfWidth} 0 0 1 ${cx + halfWidth} ${strandTopY}`
  const stemLen = strandTopY - (yBase - 3)
  const rungs: Rung[] = Array.from({ length: nRungs }, (_, i) => {
    const y = yBase - 3 + (stemLen * (i + 1)) / (nRungs + 1)
    return { x1: cx - halfWidth + 1.3, y1: y, x2: cx + halfWidth - 1.3, y2: y }
  })
  return { strands: `${left} ${right}`, loop, rungs, apexY }
}

/**
 * The antiterminator alternative fold, drawn as a low two-strand bulge hanging just
 * below the body baseline across `band` (the "other conformation"). Two nested smooth
 * arcs suggest the open helix without competing with the tinted body capsule above.
 */
export function bulge(band: Band, yBase: number, depth = 9): { outer: string; inner: string } {
  const x0 = band.x + 2
  const x1 = band.x + band.w - 2
  const cx = (x0 + x1) / 2
  const k = 0.45
  const arc = (d: number) =>
    `M ${x0} ${yBase} C ${x0 + (cx - x0) * k} ${yBase + d}, ${x1 - (x1 - cx) * k} ${yBase + d}, ${x1} ${yBase}`
  return { outer: arc(depth), inner: arc(depth - 3) }
}
