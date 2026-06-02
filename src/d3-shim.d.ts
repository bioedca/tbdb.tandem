// Minimal hand-written ambient types for the slice of D3 the architecture diagram
// uses. PLAN §7.1 locks "D3 + hand-rolled SVG … D3 only for scales" for the tandem
// architecture diagram (and §2.3 scopes D3 to this diagram + phylotree's substrate).
// The `d3` package ships no types and we deliberately avoid pulling the heavy
// `@types/d3` for one continuous position scale — mirroring the `plotly-shim.d.ts`
// approach (a precise local shim for a typeless viz dep). Extend this only as the
// diagram's D3 surface genuinely grows.

declare module 'd3' {
  /** A continuous linear scale: maps a numeric domain onto a numeric range. */
  export interface ScaleLinear {
    (value: number): number
    domain(): number[]
    domain(domain: Iterable<number>): ScaleLinear
    range(): number[]
    range(range: Iterable<number>): ScaleLinear
    clamp(clamp: boolean): ScaleLinear
  }

  /** `d3.scaleLinear()` — the only D3 entry point the architecture diagram needs. */
  export function scaleLinear(): ScaleLinear
}
