// Text-calibrated graph primitive scaling.
//
// `measure.ts` owns the pretext import; this helper builds on it to give non-text
// chart elements (points, gaps, strokes, margins) the same responsive rhythm as the
// fitted labels. The scale is derived from a pretext-measured probe font plus the
// graph's rendered box, so a wide desktop panel grows its primitives instead of
// leaving them at the small laptop baseline.
import { fitMeasureFontPx } from './measure'

const GRAPH_SCALE_PROBE =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789'

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function finitePositive(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export interface GraphPrimitiveScaleOptions {
  /** Minimum returned scale. Default 0.88. */
  minScale?: number
  /** Maximum returned scale. Default 1.6. */
  maxScale?: number
  /** Probe font-size encoded in `fontAtProbe`. Default 12. */
  probePx?: number
  /** Desired characters across the visual field before clamp. Default 96. */
  targetChars?: number
  /** Baseline graph box used for the geometric contribution. Default 720×420. */
  referenceWidth?: number
  referenceHeight?: number
  /** How much height/area can influence the result beyond the text fit. Default 0.3. */
  geometryWeight?: number
  /** Convert height to a readable width cap for tall/narrow boxes. Default 1.8. */
  heightToWidth?: number
}

/**
 * Return a unitless scale for graph primitives in a rendered box.
 *
 * The dominant signal is a pretext-backed constant-measure font fit: if a graph has
 * enough horizontal room for labels to read larger, its cells/points/strokes grow in
 * step. A smaller geometry term lets very tall graph boxes breathe too, without a
 * portrait viewport making everything comically large.
 */
export function graphPrimitiveScale(
  widthPx: number,
  heightPx: number,
  fontAtProbe: string,
  opts: GraphPrimitiveScaleOptions = {},
): number {
  const w = finitePositive(widthPx)
  const h = finitePositive(heightPx)
  if (w <= 0 || h <= 0) return 1

  const minScale = opts.minScale ?? 0.88
  const maxScale = opts.maxScale ?? 1.6
  const probePx = opts.probePx ?? 12
  const targetChars = opts.targetChars ?? 96
  const referenceWidth = opts.referenceWidth ?? 720
  const referenceHeight = opts.referenceHeight ?? 420
  const geometryWeight = clamp(opts.geometryWeight ?? 0.3, 0, 1)
  const heightToWidth = opts.heightToWidth ?? 1.8

  const measureWidth = Math.min(w, h * heightToWidth)
  const fittedPx = fitMeasureFontPx(GRAPH_SCALE_PROBE, fontAtProbe, probePx, measureWidth, {
    minPx: probePx * minScale,
    maxPx: probePx * maxScale,
    targetChars,
  })
  const textScale = fittedPx / probePx

  const areaScale = Math.sqrt((w * h) / (referenceWidth * referenceHeight))
  const geometryScale = clamp(areaScale, minScale, maxScale)
  return clamp(textScale * (1 - geometryWeight) + geometryScale * geometryWeight, minScale, maxScale)
}

/** Scale a pixel value and optionally clamp it to a practical range. */
export function scalePx(
  valuePx: number,
  scale: number,
  opts: { min?: number; max?: number; precision?: number } = {},
): number {
  const precision = opts.precision ?? 2
  const factor = 10 ** precision
  const scaled = valuePx * (Number.isFinite(scale) && scale > 0 ? scale : 1)
  const clamped = clamp(scaled, opts.min ?? -Infinity, opts.max ?? Infinity)
  return Math.round(clamped * factor) / factor
}
