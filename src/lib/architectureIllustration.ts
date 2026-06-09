// Small SVG helper layer for the locus architecture illustration. D3-shape gives
// the RNA glyphs smooth, reproducible curves while the Svelte components keep the
// biology-specific pieces explicit and testable.
import { curveBasis, line } from 'd3'

export interface Band {
  x: number
  w: number
}

export interface ArchitectureGlyphDims {
  yAa: number
  yLoop: number
  yBodyT: number
  bodyH: number
  yBodyB: number
  yBodyMid: number
  loopR: number
}

export interface Rung {
  x1: number
  y1: number
  x2: number
  y2: number
}

type Point = [number, number]

const smoothLine = line<Point>()
  .x((d) => d[0])
  .y((d) => d[1])
  .curve(curveBasis)

export function smoothPath(points: Point[]): string {
  return smoothLine(points) ?? ''
}

export function stemLoopPath(cx: number, cy: number, r: number): string {
  const points: Point[] = []
  // Leave a small lower-right notch so the loop reads as the annotated Stem I loop,
  // not a generic circle.
  const start = Math.PI
  const end = Math.PI * 2.45
  for (let i = 0; i <= 12; i++) {
    const t = start + ((end - start) * i) / 12
    points.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r])
  }
  return smoothPath(points)
}

export function terminatorHairpinPath(cx: number, yBase: number): string {
  const w = 10
  return smoothPath([
    [cx - w, yBase],
    [cx - w, yBase - 11],
    [cx - w * 0.95, yBase - 21],
    [cx - w * 0.48, yBase - 29],
    [cx, yBase - 31],
    [cx + w * 0.48, yBase - 29],
    [cx + w * 0.95, yBase - 21],
    [cx + w, yBase - 11],
    [cx + w, yBase],
  ])
}

export function sequestratorPath(cx: number, yBase: number): string {
  const w = 10
  return smoothPath([
    [cx - w, yBase],
    [cx - w * 0.95, yBase - 8],
    [cx - w * 0.45, yBase - 14],
    [cx, yBase - 15],
    [cx + w * 0.45, yBase - 14],
    [cx + w * 0.95, yBase - 8],
    [cx + w, yBase],
  ])
}

export function stemRungs(band: Band, y1: number, y2: number): Rung[] {
  if (band.w < 14) return []
  const n = Math.min(6, Math.max(2, Math.floor(band.w / 18)))
  const pad = Math.min(5, band.w / 5)
  return Array.from({ length: n }, (_, i) => {
    const x = band.x + pad + ((band.w - pad * 2) * (i + 0.5)) / n
    return { x1: x - 2.2, y1, x2: x + 2.2, y2 }
  })
}

export function hairpinRungs(cx: number, yBase: number): Rung[] {
  return [0, 1, 2].map((i) => {
    const y = yBase - 7 - i * 5.2
    const half = 6.8 - i * 1.25
    return { x1: cx - half, y1: y, x2: cx + half, y2: y }
  })
}

export function safeSvgId(raw: string, prefix: string): string {
  return `${prefix}-${raw.replace(/[^A-Za-z0-9_-]/g, '-')}`
}
