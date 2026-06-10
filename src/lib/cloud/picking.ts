// Screen-space nearest-point picking for the 3D cloud (PLAN /cloud).
//
// The sprites are sized in PIXELS by the shader (`gl_PointSize`), yet the previous
// picker used three's Raycaster with a WORLD-space tube threshold — so the click
// forgiveness drifted with depth/zoom (a world tube ≠ a pixel sprite) and, in a dense
// pile, `hits[0]` returned the frontmost-along-the-ray point rather than the dot nearest
// the cursor. Reasoning in screen pixels fixes both: project every point to canvas
// pixels (from the LIVE position buffer, so the candidate tracks the spread relaxation),
// then pick the point whose screen-distance to the cursor is smallest within a generous,
// constant pixel radius, tie-breaking genuine center-overlaps by camera depth.
//
// Pure (no three, no DOM): the component owns the three-specific projection and hands
// these functions plain numbers, so they unit-test deterministically without WebGL.

/** A cloud point projected to canvas-pixel space for one pointer event. */
export interface ScreenPoint {
  /** Canvas-pixel x (0 = left edge), matching `clientX - rect.left`. */
  sx: number
  /** Canvas-pixel y (0 = top edge, y-down), matching `clientY - rect.top`. */
  sy: number
  /** Depth ordinal (projected NDC z): smaller = nearer the camera. Tie-break only. */
  depth: number
  /** False when off-pipeline (behind the near plane / non-finite) → not pickable. */
  visible: boolean
}

export interface PickResult {
  /** Index into the projected array, or -1 when nothing is within `radiusPx`. */
  index: number
  /** Screen-pixel distance to the winner (Infinity when none). */
  dist: number
}

/**
 * Screen-pixel slack within which two points count as "the same spot" for the depth
 * tie-break. A clearly-closer dot (more than this many px nearer the cursor) always
 * wins; only near-coincident centers fall back to frontmost-wins.
 */
export const DEPTH_TIE_PX = 2

/**
 * The nearest projected point to the cursor within `radiusPx`, depth tie-broken.
 *
 * Tie-break rule: a candidate replaces the current best when its screen distance is
 * meaningfully smaller (`best.dist - d > DEPTH_TIE_PX`), OR when the two are within
 * `DEPTH_TIE_PX` of each other AND the candidate is nearer the camera (smaller depth).
 * So overlapping centers resolve frontmost-wins, but a dot clearly closer to the cursor
 * always beats a frontmost-but-distant one. O(n) over the point set — trivial at pointer
 * cadence for ~949 points.
 */
export function pickNearest(
  points: readonly ScreenPoint[],
  cursorX: number,
  cursorY: number,
  radiusPx: number,
): PickResult {
  let bestIndex = -1
  let bestDist = Infinity
  let bestDepth = Infinity
  const r2 = radiusPx * radiusPx
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (!p.visible) continue
    const dx = p.sx - cursorX
    const dy = p.sy - cursorY
    const d2 = dx * dx + dy * dy
    if (d2 > r2) continue
    const d = Math.sqrt(d2)
    if (bestIndex < 0 || bestDist - d > DEPTH_TIE_PX) {
      // First hit, or this dot is clearly closer to the cursor.
      bestIndex = i
      bestDist = d
      bestDepth = p.depth
    } else if (d - bestDist <= DEPTH_TIE_PX && p.depth < bestDepth) {
      // Near-coincident screen distance → the one nearer the camera wins.
      bestIndex = i
      bestDist = d
      bestDepth = p.depth
    }
  }
  return { index: bestIndex, dist: bestIndex < 0 ? Infinity : bestDist }
}

export interface PickRadiusOpts {
  /** Floor so tiny far sprites stay hittable (the "hard to hit small dots" fix). */
  minPx?: number
  /** Ceiling so a huge near sprite doesn't grab half the screen. */
  maxPx?: number
  /** Forgiveness beyond the sprite radius. */
  over?: number
}

/**
 * The pick radius in canvas pixels for a sprite of pixel DIAMETER `spritePx`. Constant in
 * SCREEN space (the sprite is too), so the click forgiveness no longer drifts with
 * depth/zoom. The `minPx` floor is what makes the tiny, far points reliably clickable.
 */
export function pickRadiusPx(spritePx: number, opts: PickRadiusOpts = {}): number {
  const { minPx = 8, maxPx = 28, over = 1.4 } = opts
  const r = (spritePx / 2) * over
  if (!Number.isFinite(r)) return minPx
  return Math.min(maxPx, Math.max(minPx, r))
}
