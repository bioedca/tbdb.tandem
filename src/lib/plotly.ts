// Plotly lifecycle helper (PLAN §7.1).
//
// Plotly's `config.responsive: true` attaches a window 'resize' listener that
// `Plotly.purge` does NOT remove — verified on plotly.js-dist-min v3: purge clears
// the graph div but leaves the window listener, so each dashboard mount/unmount
// cycle leaks one listener per panel. The dashboard (the §9 centerpiece) is
// mounted/unmounted on every route change, so that adds up over a session.
//
// Instead of `responsive: true`, refit each panel with our OWN window 'resize'
// listener and a deterministic teardown that removes the listener and purges the
// div, so a dashboard mount/unmount cycle nets ZERO leaked listeners.

import type { PlotlyStatic } from 'plotly.js-dist-min'

/**
 * Keep `els` fitted to their containers on window resize (replacing Plotly's
 * leak-prone `responsive: true`), and return a teardown that removes the listener,
 * cancels any pending refit, and purges every div. The refit is rAF-coalesced (a
 * drag-resize burst becomes one fit) and no-ops on a div Plotly has not plotted into
 * or that has left the DOM (guards mount/unmount races). Safe where there is no
 * `window` (SSR / jsdom): it simply never fires, and teardown still purges.
 */
export function fitOnResize(plotly: PlotlyStatic, els: HTMLElement[]): () => void {
  const targets = els.filter(Boolean)
  let raf = 0

  const fit = () => {
    for (const el of targets) {
      // Only refit a still-mounted div Plotly has actually plotted into.
      if (el.isConnected && (el as unknown as { _fullLayout?: unknown })._fullLayout) {
        try {
          plotly.Plots.resize(el)
        } catch {
          /* torn down mid-frame — ignore */
        }
      }
    }
  }

  const onResize = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(fit)
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('resize', onResize)
  }

  return () => {
    if (raf) cancelAnimationFrame(raf)
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('resize', onResize)
    }
    for (const el of targets) plotly.purge(el)
  }
}
