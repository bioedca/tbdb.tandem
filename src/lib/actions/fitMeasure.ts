// `use:fitMeasure` — size a full-width prose block's font so each wrapped line holds a
// comfortable, constant character measure, recomputed on resize (responsive scaling —
// PLAN Workstream 1).
//
// The companion to `use:fitText`. Where fitText shrinks a single line to fit, this fits
// MULTI-LINE prose: the element runs the FULL banner width (no narrow `max-width` cap) and
// pretext picks the font-size so a full line carries ~`targetChars` characters. The column
// therefore fills the banner at every width while the per-line measure — the real
// readability invariant — holds: the text scales UP on a wide desktop (bigger, same
// measure) and DOWN on a phone, instead of locking to a ribbon that leaves the banner empty.
//
// Mirrors the debounced-ResizeObserver + fonts-ready discipline of fitText. No-ops cleanly
// where ResizeObserver / canvas are absent (jsdom, SSR): the text simply keeps its CSS size.
import { fitMeasureFontPx, onFontsReady } from '../text/measure'

export interface FitMeasureParams {
  /** Smallest font-size (px). Default 16. */
  minPx?: number
  /** Largest font-size (px) — the cap on a wide screen. Default 26. */
  maxPx?: number
  /** Target characters per full-width line — the held reading measure. Default 90. */
  targetChars?: number
}

// Defaults tuned for a page-banner LEAD: it grows to a hero-scale ~26px on a wide desktop
// (holding ~90 chars/line) and eases down to ~16px on a phone. Card bodies pass their own
// (smaller) cap so body copy never out-sizes its panel title.
const DEFAULTS = { minPx: 16, maxPx: 26, targetChars: 90 } as const

export function fitMeasure(node: HTMLElement, params: FitMeasureParams = {}) {
  let minPx = params.minPx ?? DEFAULTS.minPx
  let maxPx = params.maxPx ?? DEFAULTS.maxPx
  let targetChars = params.targetChars ?? DEFAULTS.targetChars
  let raf = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let lastWidth = -1

  /** CSS font shorthand for `node` at a given px size (for canvas measurement). */
  function fontAt(px: number): string {
    const cs = getComputedStyle(node)
    const style = cs.fontStyle || 'normal'
    const weight = cs.fontWeight || '400'
    const family = cs.fontFamily || 'sans-serif'
    return `${style} ${weight} ${px}px ${family}`
  }

  function fit() {
    // The block fills its parent, so its width is layout-driven and independent of the
    // font-size we set — reading it without resetting the size is correct (and avoids a
    // reflow). Probe pretext at `maxPx`; the result scales linearly to the chosen size.
    const boxW = node.clientWidth
    if (boxW <= 0) return
    lastWidth = boxW
    const size = fitMeasureFontPx(node.textContent ?? '', fontAt(maxPx), maxPx, boxW, {
      minPx,
      maxPx,
      targetChars,
    })
    node.style.fontSize = `${size}px`
    node.dataset.fitted = '' // settle signal: lets the visual suite await a stable size
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

  // Refit only on genuine WIDTH changes — our font-size tweak changes the block's height,
  // which would otherwise feed the observer back into a loop.
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
    update(next: FitMeasureParams = {}) {
      const nextMin = next.minPx ?? DEFAULTS.minPx
      const nextMax = next.maxPx ?? DEFAULTS.maxPx
      const nextTarget = next.targetChars ?? DEFAULTS.targetChars
      // Svelte rebinds a fresh object literal on every parent render; only re-fit when a
      // value actually changed, so unrelated re-renders don't queue redundant measure cycles.
      if (nextMin === minPx && nextMax === maxPx && nextTarget === targetChars) return
      minPx = nextMin
      maxPx = nextMax
      targetChars = nextTarget
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
