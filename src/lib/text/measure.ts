// Reflow-free text measurement (responsive scaling — PLAN Workstream 1).
//
// This is the ONLY module that imports `@chenglou/pretext`. pretext is a canvas-based
// text-measurement library: it computes line widths/breaks from a CSS font + width
// WITHOUT touching the DOM (no getBoundingClientRect, no reflow). We use it for the two
// jobs CSS can't do precisely — shrink-to-fit font sizing and grapheme-correct
// truncation to an exact pixel width.
//
// pretext needs `Intl.Segmenter` + a 2D canvas context, NEITHER of which exists under
// jsdom (the vitest component tests) or SSR. Every export here is therefore guarded:
// when canvas is unavailable it returns a cheap approximation so callers — and the
// component tests — keep working with no special-casing. pretext is pre-1.0 and pinned;
// keeping it isolated here means a future API change touches exactly one file.
import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext'

/** True only in a real browser where canvas 2D text measurement works (not jsdom/SSR).
 *  The Node guard runs first so we never call canvas `getContext` under jsdom — which
 *  would emit a noisy "Not implemented" warning in the component tests even when caught. */
const CAN_MEASURE = (() => {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process
  if (proc?.versions?.node || typeof document === 'undefined') return false
  try {
    return !!document.createElement('canvas').getContext('2d')
  } catch {
    return false
  }
})()

/** Extract the px size from a CSS font shorthand ("… <n>px …") for the fallbacks. */
function sizeOf(font: string): number {
  const m = font.match(/(\d+(?:\.\d+)?)px/)
  return m ? parseFloat(m[1]) : 16
}

/** Average glyph advance as a fraction of font-size — the fallback estimate when canvas
 *  is unavailable. Deliberately a touch wide so fallbacks under-fill rather than clip. */
const FALLBACK_EM = 0.6

/** Minimal structural type for Intl.Segmenter (absent from some TS lib targets). */
type SegmenterLike = { segment(input: string): Iterable<{ segment: string }> }
type SegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'grapheme' | 'word' | 'sentence' },
) => SegmenterLike

/** Split into user-perceived characters (grapheme clusters) so truncation never cuts a
 *  multi-codepoint glyph in half. Uses Intl.Segmenter when present, else code points. */
function graphemes(text: string): string[] {
  const Ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter
  if (Ctor) {
    const seg = new Ctor(undefined, { granularity: 'grapheme' })
    return Array.from(seg.segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

/**
 * Natural single-line width (px) of `text` rendered with the CSS `font` shorthand,
 * measured reflow-free via pretext. Falls back to a glyph-count estimate off-canvas.
 */
export function naturalWidthPx(text: string, font: string): number {
  if (!text) return 0
  if (!CAN_MEASURE) return text.length * FALLBACK_EM * sizeOf(font)
  try {
    return measureNaturalWidth(prepareWithSegments(text, font))
  } catch {
    return text.length * FALLBACK_EM * sizeOf(font)
  }
}

/**
 * Largest font-size (px) at which `text` fits `boxWidthPx` on one line, within
 * [minPx, maxPx]. A single line's width scales linearly with font-size, so one
 * measurement at `maxPx` gives the answer analytically — no DOM, no binary search.
 * `fontAtMax` must be the CSS font shorthand at `maxPx` (e.g. "700 36px Inter").
 */
export function fitFontSizePx(
  text: string,
  fontAtMax: string,
  boxWidthPx: number,
  opts: { minPx: number; maxPx: number },
): number {
  const { minPx, maxPx } = opts
  if (!text || boxWidthPx <= 0) return maxPx
  const natural = naturalWidthPx(text, fontAtMax)
  if (natural <= 0 || natural <= boxWidthPx) return maxPx
  const scaled = (maxPx * boxWidthPx) / natural
  return Math.max(minPx, Math.min(maxPx, scaled))
}

/**
 * Truncate `text` with an ellipsis so it fits `maxPx` at the given CSS `font`, breaking
 * on grapheme boundaries (never mid-glyph). Returns `text` unchanged when it already
 * fits. Reflow-free; falls back to a glyph-count slice off-canvas.
 */
export function truncateToWidth(text: string, font: string, maxPx: number): string {
  if (!text || maxPx <= 0) return text
  if (naturalWidthPx(text, font) <= maxPx) return text
  const ELLIPSIS = '…'
  const gs = graphemes(text)
  if (!CAN_MEASURE) {
    const per = FALLBACK_EM * sizeOf(font)
    const n = Math.max(0, Math.floor(maxPx / per) - 1) // reserve room for the ellipsis
    return gs.slice(0, Math.min(gs.length, n)).join('') + ELLIPSIS
  }
  // Binary search for the largest prefix whose width (with ellipsis) fits.
  let lo = 0
  let hi = gs.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const w = naturalWidthPx(gs.slice(0, mid).join('') + ELLIPSIS, font)
    if (w <= maxPx) lo = mid
    else hi = mid - 1
  }
  return gs.slice(0, lo).join('') + ELLIPSIS
}

/**
 * Run `cb` once the document fonts have settled — canvas metrics are only correct after
 * the self-hosted Inter / JetBrains Mono woff2 (font-display: swap) finish loading, so
 * any measurement done before then must be redone. Calls back immediately where the
 * Font Loading API is absent (jsdom / SSR).
 */
export function onFontsReady(cb: () => void): void {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (fonts?.ready) {
    void fonts.ready.then(cb).catch(() => cb())
  } else {
    cb()
  }
}
