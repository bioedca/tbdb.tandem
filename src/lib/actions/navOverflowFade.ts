// `use:navOverflowFade` — reveal a horizontally-scrollable nav's hidden items with a
// directional edge fade (responsive scaling — PLAN Workstream 1, §1.2 critique fix).
//
// The mobile primary nav is `overflow-x-auto` with the scrollbar hidden (.tv-no-scrollbar),
// so when the labels overflow on a phone the cut-off item ("About & method") is reachable
// only by swipe, with NO affordance that it exists. This action toggles a `tv-nav-fade`
// class (a CSS mask, app.css) whose left/right fade widths track the scroll position, so a
// soft gradient signals "there is more this way" — and disappears at each end.
//
// The overflow DECISION is computed reflow-free with pretext: we sum the labels' natural
// widths (+ per-item chrome + gaps) and compare to the box width, instead of reading
// `scrollWidth` (a forced layout reflow) on every resize. Scroll-position reads use the
// cheap, event-driven `scrollLeft` only — never `scrollWidth`. Mirrors the debounced-
// ResizeObserver + onFontsReady discipline of `use:fitText`; no-ops cleanly where canvas /
// ResizeObserver are absent (jsdom / SSR): the class simply never toggles on.
import { naturalWidthPx, onFontsReady } from '../text/measure'

export interface NavFadeParams {
  /** CSS font shorthand for the nav labels — must be a NAMED family (pretext caveat). */
  font: string
  /** Inter-item flex gap (px). */
  gap?: number
  /** Per-item horizontal chrome (each item's own padding, both edges summed) in px. */
  itemPad?: number
  /** How far each edge fades when there is content past it (CSS length). */
  fade?: string
}

export function navOverflowFade(node: HTMLElement, params: NavFadeParams) {
  let { font, gap = 4, itemPad = 16, fade = '1.75rem' } = params
  let timer: ReturnType<typeof setTimeout> | undefined
  let needed = 0 // analytic intrinsic width of the items (px), measured reflow-free
  let boxW = 0 // available content-box width (clientWidth − the row's own padding)

  /** Re-measure the analytic content width and repaint. Called on font-ready + resize. */
  function recompute(): void {
    const items = Array.from(node.children) as HTMLElement[]
    const n = items.length
    let sum = n > 0 ? (n - 1) * gap + n * itemPad : 0
    for (const it of items) sum += naturalWidthPx((it.textContent ?? '').trim(), font)
    needed = sum
    // Subtract the row's OWN horizontal padding from clientWidth to get the space the
    // items actually lay out in. Read it from the live computed style rather than assume
    // a constant: the nav is `px-1` on phones but `sm:px-0` at ≥sm, so a fixed edge pad
    // would over-count by ~8px on desktop and falsely fade a row that isn't overflowing.
    const cs = getComputedStyle(node)
    const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
    boxW = node.clientWidth - pad
    paint()
  }

  /** Toggle the fade class + set the per-edge fade widths from the scroll position. */
  function paint(): void {
    // +2px tolerance absorbs residual pretext/sub-pixel drift so a non-overflowing row
    // never fades; nav items are tens of px wide, so this can't hide a real overflow.
    const overflowing = needed > boxW + 2
    node.classList.toggle('tv-nav-fade', overflowing)
    if (!overflowing) {
      node.style.removeProperty('--tv-fade-l')
      node.style.removeProperty('--tv-fade-r')
      return
    }
    const max = Math.max(0, needed - boxW)
    const sl = node.scrollLeft
    node.style.setProperty('--tv-fade-l', sl > 1 ? fade : '0px')
    node.style.setProperty('--tv-fade-r', sl < max - 1 ? fade : '0px')
  }

  const onScroll = (): void => paint()
  function schedule(): void {
    clearTimeout(timer)
    timer = setTimeout(recompute, 120)
  }

  onFontsReady(recompute) // canvas metrics need the real font loaded
  node.addEventListener('scroll', onScroll, { passive: true })

  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => schedule())
    ro.observe(node)
  }

  return {
    update(next: NavFadeParams): void {
      font = next.font
      gap = next.gap ?? gap
      itemPad = next.itemPad ?? itemPad
      fade = next.fade ?? fade
      recompute()
    },
    destroy(): void {
      clearTimeout(timer)
      node.removeEventListener('scroll', onScroll)
      ro?.disconnect()
    },
  }
}
