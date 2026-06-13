/**
 * Fill-width vertical-zoom geometry for the full-locus sequence track (TandemArchitecture).
 *
 * The hatchlings SequenceViewer draws every base glyph at a FIXED 12 px font, so widening the track
 * only spreads the same-size bases sideways — text never actually grows from the width prop. We
 * instead drive the layout with `charsPerRow = n` (exact wrap) + a constant natural `charWidth`
 * (CHAR_CELL_PX), giving a deterministic laid-out width `rowWidthPx(n)`, then the component CSS-zooms
 * the whole track by `frameWidth / rowWidthPx(n)` so a row fills the frame edge-to-edge. The result:
 *
 *   • no horizontal whitespace / scroll — a row is always exactly the frame width;
 *   • zoom = bases-per-row — fewer bases ⇒ bigger text (max zoom = MIN_BASES_PER_ROW across), more
 *     bases ⇒ smaller text (min zoom = the whole locus fits the window height);
 *   • content grows only vertically (more rows) and scrolls inside the fixed window.
 *
 * Because the SequenceViewer's row heights are pure constant arithmetic (no text measurement), the
 * laid-out content height is fully predictable here — `predictContentHeightPx` mirrors the library's
 * `estimateRowHeight` / `totalSvgHeight`, locked by a test that renders the real viewer. That lets us
 * solve `fitBasesPerRow` (the min-zoom bound) analytically, with no render-measure feedback loop.
 *
 * The constants below mirror @molbiohive/hatchlings util/layout.js (v0.8.4) + SequenceRow/SequenceViewer.
 */

// ── hatchlings layout constants (util/layout.js) ──────────────────────────────────────────────
/** Left + right inner padding of the sequence grid (SEQ_PAD, applied on both sides). */
export const SEQ_PAD = 12
/** Vertical gap between rows (ROW_PADDING). */
export const ROW_PADDING = 4
/** Position-ruler band height when showNumbers is on (RULER_HEIGHT). */
export const RULER_H = 16
/** A single base line's height (LINE_HEIGHT). */
export const BASE_LINE_H = 14
/** Height contributed by one annotation lane (18) + the lane-zone pad (4) when ≥1 lane. */
export const ANNOT_LANE_H = 18
export const ANNOT_LANE_PAD = 4
/** Height of a translation track on rows it touches. */
export const TRANSLATION_H = 24
/** rowPositions' initial currentY (top inset before the first row). */
export const SVG_TOP = 8

// ── our chosen track geometry ─────────────────────────────────────────────────────────────────
/** Natural per-base cell width (px) passed to SequenceViewer's `charWidth`. The 12 px glyph (~7 px
 *  wide) sits comfortably in a 10 px cell; CSS-zoom then scales the whole grid uniformly, so this
 *  ratio — and the monospace look — holds at every zoom level. */
export const CHAR_CELL_PX = 10
/** Max zoom: the fewest bases shown across a row (≈ "see 20 bp horizontally"). */
export const MIN_BASES_PER_ROW = 20
/** Where the slider opens: a readable mid-level density, clamped into the locus's [lo, hi]. */
export const DEFAULT_BASES_PER_ROW = 60

/** Minimal structural shape of a hatchlings SequenceData we need for the geometry. */
export interface SeqGeometryInput {
  seq: string
  parts: { start: number; end: number }[]
  translations: { start: number; end: number }[]
}

export interface RowTrackOpts {
  showNumbers?: boolean
  showComplement?: boolean
  showTranslations?: boolean
}

/** The laid-out (pre-zoom) width of one full row of `n` bases — matches SequenceViewer's svgWidth. */
export function rowWidthPx(n: number): number {
  return 2 * SEQ_PAD + n * CHAR_CELL_PX
}

/** Greedy interval lane packing — a faithful copy of hatchlings util/coordinates.js `countLanes`. */
export function countLanes(intervals: { start: number; end: number }[]): number {
  if (intervals.length === 0) return 0
  const sorted = [...intervals].sort((a, b) => a.start - b.start)
  const lanes: { end: number }[] = []
  for (const item of sorted) {
    let placed = false
    for (const lane of lanes) {
      if (item.start >= lane.end) {
        lane.end = item.end
        placed = true
        break
      }
    }
    if (!placed) lanes.push({ end: item.end })
  }
  return lanes.length
}

/**
 * The laid-out (pre-zoom) height in px of the whole track at `n` bases per row. Mirrors the
 * SequenceViewer's `estimateRowHeight` (ruler + base line + annotation lanes + translation, no
 * primers/cut-sites here) and `totalSvgHeight = SVG_TOP + Σ rowH + ROW_PADDING·rows`.
 */
export function predictContentHeightPx(
  data: SeqGeometryInput,
  n: number,
  { showNumbers = true, showComplement = false, showTranslations = true }: RowTrackOpts = {},
): number {
  const seqLen = data.seq.length
  if (seqLen === 0 || n <= 0) return SVG_TOP + ROW_PADDING
  const rulerH = showNumbers ? RULER_H : 0
  const rows = Math.ceil(seqLen / n)
  let sum = 0
  for (let r = 0; r < rows; r++) {
    const rowStart = r * n
    const rowEnd = Math.min(rowStart + n, seqLen)
    let h = rulerH + BASE_LINE_H
    if (showComplement) h += BASE_LINE_H + 2
    const lanes = countLanes(data.parts.filter((p) => p.start < rowEnd && p.end > rowStart))
    if (lanes > 0) h += lanes * ANNOT_LANE_H + ANNOT_LANE_PAD
    if (showTranslations && data.translations.some((t) => t.start < rowEnd && t.end > rowStart)) h += TRANSLATION_H
    sum += h
  }
  return SVG_TOP + sum + ROW_PADDING * rows
}

/** The rendered (post-CSS-zoom) height of the track at `n` bases per row in a `frameW`-wide frame. */
export function renderedHeightPx(data: SeqGeometryInput, n: number, frameW: number, opts: RowTrackOpts = {}): number {
  return predictContentHeightPx(data, n, opts) * (frameW / rowWidthPx(n))
}

/**
 * The min-zoom bound: the fewest bases-per-row (largest text) at which the WHOLE locus still fits the
 * window height with no scroll. Rendered height shrinks monotonically as `n` grows (fewer, smaller
 * rows), so we scan up from MIN_BASES_PER_ROW and return the first `n` that fits; capped at the full
 * sequence length (one row). A small `safety` margin biases toward a guaranteed fit.
 *
 * Best-effort fallback: if even one row (`n === seqLen`) exceeds the budget — only when the window is
 * extremely short — we still return `seqLen`. That is the densest, smallest the track can be, so the
 * window simply scrolls; there is no smaller-text option, so this is the correct degenerate answer.
 */
export function fitBasesPerRow(
  data: SeqGeometryInput,
  frameW: number,
  frameH: number,
  opts: RowTrackOpts = {},
  safety = 4,
): number {
  const seqLen = data.seq.length
  if (seqLen === 0 || frameW <= 0 || frameH <= 0) return MIN_BASES_PER_ROW
  const budget = Math.max(0, frameH - safety)
  for (let n = MIN_BASES_PER_ROW; n < seqLen; n++) {
    if (renderedHeightPx(data, n, frameW, opts) <= budget) return n
  }
  return seqLen
}

export interface BasesPerRowBounds {
  /** max zoom — fewest bases per row (largest text). */
  lo: number
  /** min zoom — most bases per row (whole locus fits). */
  hi: number
}

/** The usable bases-per-row range for a locus in a given frame: [max-zoom, fit-whole]. */
export function basesPerRowBounds(
  data: SeqGeometryInput,
  frameW: number,
  frameH: number,
  opts: RowTrackOpts = {},
): BasesPerRowBounds {
  const seqLen = data.seq.length
  const lo = Math.min(MIN_BASES_PER_ROW, Math.max(1, seqLen))
  const hi = Math.max(lo, Math.min(fitBasesPerRow(data, frameW, frameH, opts), Math.max(1, seqLen)))
  return { lo, hi }
}

/** The opening zoom: a readable mid-level density, clamped into the locus's [lo, hi]. */
export function defaultBasesPerRow(bounds: BasesPerRowBounds): number {
  return Math.min(Math.max(DEFAULT_BASES_PER_ROW, bounds.lo), bounds.hi)
}
