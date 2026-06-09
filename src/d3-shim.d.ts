// Minimal hand-written ambient types for the slice of D3 the architecture diagram
// uses. The `d3` package ships no types and we deliberately avoid pulling the heavy
// `@types/d3` package for one continuous scale plus a few deterministic SVG path
// helpers — mirroring the `plotly-shim.d.ts` approach (a precise local shim for a
// typeless viz dependency). Extend this only as the diagram's D3 surface genuinely
// grows.

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

  export interface CurveFactory {}

  export const curveBasis: CurveFactory

  export interface LineGenerator<T> {
    (data: Iterable<T>): string | null
    x(accessor: (d: T) => number): LineGenerator<T>
    y(accessor: (d: T) => number): LineGenerator<T>
    curve(curve: CurveFactory): LineGenerator<T>
  }

  export function line<T = [number, number]>(): LineGenerator<T>
}
