// Selection-highlight easing for the 3D cloud (PLAN /cloud §8.4 reduced-motion).
//
// The picker (../cloud/picking) resolves which node is hovered/selected; this module is
// the pure maths for how that node's highlight animates — a smooth size bump + brightness
// lift + teal halo ring, with a one-shot "pop" on (re)selection. Kept framework-agnostic
// (no three, no DOM) so the curves are unit-tested deterministically; the component owns
// the per-frame attribute writes and the reduced-motion snap.

/** Hover/selection size multiplier at full highlight (a unit sprite grows by this much). */
export const HOVER_BUMP = 2.0
/** Per-frame exponential ease toward the highlight target (mirrors `dampOrbit`'s feel). */
export const HIGHLIGHT_EASE = 0.25
/** Peak extra scale of the one-shot selection pop (0.45 → a 45 % overshoot at the peak). */
export const POP_AMPLITUDE = 0.45
/** Pop duration; the multiplier returns to exactly 1 by here (≈ the `motion.base` token). */
export const POP_DURATION_MS = 220
/** Halo-ring colour — brand on-dark teal, a CHROME hue (never a specifier/data colour). */
export const HIGHLIGHT_COLOR = '#5ec2d6'

/**
 * Exponential ease of a scalar toward `target` by fraction `alpha` each frame.
 * `alpha = 1` snaps (the reduced-motion path); `alpha = 0` freezes. Clamps `alpha`.
 */
export function dampScalar(current: number, target: number, alpha: number): number {
  const a = Math.min(1, Math.max(0, alpha))
  return current + (target - current) * a
}

export interface HighlightTargets {
  /** Size multiplier applied over the data-derived base size (1 → HOVER_BUMP). */
  sizeMul: number
  /** Fraction to lerp the point's base alpha toward 1 (so even a dimmed point lights up). */
  alphaLift: number
  /** Halo-ring strength fed to the shader (0 → 1). */
  ring: number
}

/**
 * The steady-state highlight at a continuous `level` in [0,1] (the eased hover/selection
 * amount). Pure and monotone in `level`, so the component can ease `level` and read off
 * consistent size/alpha/ring without branching.
 */
export function highlightTargets(level: number): HighlightTargets {
  const l = Math.min(1, Math.max(0, level))
  return { sizeMul: 1 + (HOVER_BUMP - 1) * l, alphaLift: l, ring: l }
}

export interface PopOpts {
  amplitude?: number
  durationMs?: number
}

/**
 * One-shot eased size "pop" as a function of elapsed time since (re)selection: a single
 * symmetric hump that is exactly 1 at `t = 0` and returns to exactly 1 by `durationMs`,
 * peaking at `1 + amplitude` mid-way. Pure function of time (no clock), so it is testable
 * and replay-safe. Skipped entirely under reduced motion (the component never calls it).
 */
export function popScale(elapsedMs: number, opts: PopOpts = {}): number {
  const { amplitude = POP_AMPLITUDE, durationMs = POP_DURATION_MS } = opts
  if (!(elapsedMs > 0) || elapsedMs >= durationMs) return 1
  return 1 + amplitude * Math.sin(Math.PI * (elapsedMs / durationMs))
}
