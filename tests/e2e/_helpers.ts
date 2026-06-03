// Shared helpers for the Playwright e2e suite (PLAN §10.4). Not a spec file
// (no `.spec`/`.test` suffix) so Playwright's testMatch never collects it.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import type { Page, Locator } from '@playwright/test'

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/data')

/** Read a committed build artifact (the same JSON the app fetches). */
export function readArtifact<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(resolve(DATA_DIR, name), 'utf8')) as T
}

interface SummaryShape {
  counts: {
    loci: number
    members: number
    intra_locus_pairs: number
    pairs: number
    triples: number
    non_firmicutes: number
  }
  specifier_agreement: { same: number; mixed: number }
}
export const summary = readArtifact<SummaryShape>('summary.json')

/** Navigate to a hash route (resolved against the based `use.baseURL`). */
export async function gotoRoute(page: Page, hash: string): Promise<void> {
  await page.goto(`#${hash}`)
}

/**
 * Read the count actually rendered in the matrix cell (x, y) — proves the chart
 * data is right (not just the click wiring). z is indexed [row=y][col=x].
 */
export async function readMatrixCell(page: Page, x: string, y: string): Promise<number | null> {
  return page.evaluate(
    ({ x, y }) => {
      const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
        h.textContent?.includes('Element-pair matrix'),
      )
      const plot = h3?.closest('div.lg\\:col-span-3')?.querySelector('.js-plotly-plot') as
        | { data?: Array<{ x?: string[]; y?: string[]; z?: (number | null)[][] }> }
        | null
      const trace = plot?.data?.[0]
      if (!trace?.x || !trace.y || !trace.z) return null
      const ix = trace.x.indexOf(x)
      const iy = trace.y.indexOf(y)
      if (ix < 0 || iy < 0) return null
      return trace.z[iy]?.[ix] ?? null
    },
    { x, y },
  )
}

/**
 * The dashboard's element-pair matrix is a Plotly heatmap; Plotly's drag layer
 * intercepts real pointer events, so we drive the component's registered
 * `plotly_click` handler directly on the matrix graph div (the technique the
 * unit/component tests use). `cellFacetValue` folds (ILE,LEU)→"ILE;LEU".
 */
export async function clickMatrixCell(
  page: Page,
  x: string,
  y: string,
  z: number,
): Promise<void> {
  await page.evaluate(
    ({ x, y, z }) => {
      const h3 = Array.from(document.querySelectorAll('h3')).find((h) =>
        h.textContent?.includes('Element-pair matrix'),
      )
      const plot = h3?.closest('div.lg\\:col-span-3')?.querySelector('.js-plotly-plot') as
        | (Element & { emit?: (ev: string, data: unknown) => void })
        | null
      if (!plot || typeof plot.emit !== 'function') {
        throw new Error('matrix Plotly graph not ready')
      }
      plot.emit('plotly_click', { points: [{ x, y, z }] })
    },
    { x, y, z },
  )
}

/** The "Showing N of 470 loci" toolbar count (the live cross-filtered selection). */
export function shownCount(page: Page): Locator {
  return page.locator('p:has-text("Showing") strong').first()
}
