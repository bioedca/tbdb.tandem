// `use:fitText` — shrink a single-line element's font-size so its text fills but never
// overflows its box, recomputed on resize (responsive scaling — PLAN Workstream 1).
//
// The element's CSS font-size is the MAX (so with no JS, or before fonts load, the text
// renders at full size — no FOUC); pretext then measures the text reflow-free and we
// scale down toward `minPx` only when it would otherwise overflow. Designed for the big
// KPI / stat numbers, whose values vary in width ("470" vs "23,500" vs "5 / 12").
//
// Mirrors the debounced-ResizeObserver discipline already used in PhyloTree.svelte and
// the rAF-coalescing in plotly.ts. No-ops cleanly where ResizeObserver / canvas are
// absent (jsdom, SSR): the text simply stays at its CSS size.
import { fitFontSizePx, onFontsReady } from '../text/measure'

export interface FitTextParams {
  /** Smallest font-size (px) to shrink to. Default 12. */
  minPx?: number
  /** Largest font-size (px). Defaults to the element's computed CSS font-size. */
  maxPx?: number
}

export function fitText(node: HTMLElement, params: FitTextParams = {}) {
  let minPx = params.minPx ?? 12
  let maxPxOverride = params.maxPx
  let raf = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastWidth = -1

  /** Build a CSS font shorthand for `node` at a given px size (for canvas measurement). */
  function fontAt(px: number): string {
    const cs = getComputedStyle(node)
    const style = cs.fontStyle || 'normal'
    const weight = cs.fontWeight || '400'
    const family = cs.fontFamily || 'sans-serif'
    return `${style} ${weight} ${px}px ${family}`
  }

  function fit() {
    const maxPx = maxPxOverride ?? (parseFloat(getComputedStyle(node).fontSize) || 16)
    // Width is layout-driven (block element fills its box) and independent of our
    // font-size change, so we can read it without first resetting the size.
    const boxW = node.clientWidth
    if (boxW <= 0) return
    lastWidth = boxW
    const size = fitFontSizePx(node.textContent ?? '', fontAt(maxPx), boxW, { minPx, maxPx })
    node.style.fontSize = `${size}px`
  }

  function schedule() {
    clearTimeout(timer)
    timer = setTimeout(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(fit)
    }, 120)
  }

  // First fit once fonts settle (canvas metrics need the real font face loaded).
  onFontsReady(schedule)

  // Refit only on genuine WIDTH changes — our own font-size tweak changes the element's
  // height, which would otherwise feed the observer back into a loop.
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? node.clientWidth
      if (Math.abs(w - lastWidth) < 0.5) return
      schedule()
    })
    ro.observe(node)
  }

  return {
    update(next: FitTextParams = {}) {
      minPx = next.minPx ?? 12
      maxPxOverride = next.maxPx
      lastWidth = -1
      schedule()
    },
    destroy() {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      ro?.disconnect()
    },
  }
}
