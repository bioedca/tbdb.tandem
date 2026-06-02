// Minimal ambient types for `plotly.js-dist-min` (PLAN §7.1).
//
// The dist bundle ships NO types (`types: null`, a minified UMD), and we use only
// a tiny slice of the API — `react`/`newPlot`/`purge` plus the `plotly_click`
// event. Per PLAN §5.4's "hand-write the small stable types" philosophy we declare
// just that surface here rather than pull the heavy `@types/plotly.js`. Plotly is
// always loaded via a dynamic `import()` so it stays out of the boot bundle (§7.1).

declare module 'plotly.js-dist-min' {
  /** One trace (bar / heatmap …). Loosely typed — we set only a few keys. */
  export interface PlotData {
    type?: string
    orientation?: 'h' | 'v'
    x?: unknown[]
    y?: unknown[]
    z?: (number | null)[][]
    text?: unknown
    texttemplate?: string
    textfont?: Record<string, unknown>
    hovertemplate?: string
    hoverongaps?: boolean
    marker?: Record<string, unknown>
    colorscale?: unknown
    showscale?: boolean
    zmin?: number
    zmax?: number
    xgap?: number
    ygap?: number
    [key: string]: unknown
  }

  /** Layout is a deep, optional config object — kept open. */
  export type Layout = Record<string, unknown>

  export interface Config {
    displayModeBar?: boolean
    responsive?: boolean
    [key: string]: unknown
  }

  /** One point in a `plotly_click` event (heatmap → x/y/z; bar → x/y). */
  export interface PlotMouseEventPoint {
    x?: unknown
    y?: unknown
    z?: unknown
    pointNumber?: number
    [key: string]: unknown
  }

  export interface PlotMouseEvent {
    points: PlotMouseEventPoint[]
  }

  /** The graph `<div>` after a plot — Plotly augments it with `.on(...)`. */
  export interface PlotlyHTMLElement extends HTMLElement {
    on(event: 'plotly_click', handler: (ev: PlotMouseEvent) => void): void
  }

  /** The slice of the Plotly static API we use. */
  export interface PlotlyStatic {
    newPlot(
      root: HTMLElement,
      data: Partial<PlotData>[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<PlotlyHTMLElement>
    react(
      root: HTMLElement,
      data: Partial<PlotData>[],
      layout?: Partial<Layout>,
      config?: Partial<Config>,
    ): Promise<PlotlyHTMLElement>
    purge(root: HTMLElement): void
    Plots: { resize(root: HTMLElement): void }
  }

  const Plotly: PlotlyStatic
  export default Plotly
}
