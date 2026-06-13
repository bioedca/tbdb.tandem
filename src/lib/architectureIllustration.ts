// Deterministic SVG glyph geometry for the tandem-architecture figure (PLAN §9①).
// Every value here is a pure function of width / x / fixed dims — NO randomness — so
// the figure is byte-stable for the visual-regression baselines.

export interface Band {
  x: number
  w: number
}

/** Vertical band geometry shared by the overlay and its element glyphs (SVG units). */
export interface ArchitectureGlyphDims {
  /** Specifier AA-chip baseline (just above the body). */
  yAa: number
  /** Body (tbox arrow) top / bottom. */
  yBodyT: number
  yBodyB: number
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
