// Component: FacetTable (PLAN §10.3, §7.1, §7.3). Tabulator needs real layout, so
// it's mocked: the component owns the store-driven filter UI (search, facet
// disclosures, chips, count, CSV) and feeds Tabulator `store.selected` — the mock
// records construction, `replaceData`, and `download` so those wires are asserted
// without jsdom layout flakiness. Real Tabulator rendering is covered by the S3.4
// Playwright e2e.
import { flushSync } from 'svelte'
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { vi } from 'vitest'

const tab = vi.hoisted(() => {
  const calls: {
    construct: Record<string, unknown>[]
    replaceData: { tandem_id: string }[][]
    download: string[][]
    setColumns: { title?: string; field?: string; width?: number; minWidth?: number }[][]
    redraw: boolean[]
    destroy: number
  } = {
    construct: [],
    replaceData: [],
    download: [],
    setColumns: [],
    redraw: [],
    destroy: 0,
  }
  class MockTab {
    handlers: Record<string, (...a: unknown[]) => void> = {}
    constructor(_el: HTMLElement, opts: Record<string, unknown>) {
      calls.construct.push(opts)
    }
    on(evt: string, cb: (...a: unknown[]) => void) {
      this.handlers[evt] = cb
      if (evt === 'tableBuilt') cb() // the mock is "built" immediately
    }
    replaceData(rows: { tandem_id: string }[]) {
      calls.replaceData.push(rows)
      return Promise.resolve()
    }
    setColumns(defs: { title?: string; field?: string; width?: number; minWidth?: number }[]) {
      calls.setColumns.push(defs)
    }
    redraw(force?: boolean) {
      calls.redraw.push(!!force)
    }
    download(fmt: string, name: string) {
      calls.download.push([fmt, name])
    }
    destroy() {
      calls.destroy++
    }
  }
  return { calls, MockTab }
})

vi.mock('tabulator-tables', () => ({ TabulatorFull: tab.MockTab }))

import FacetTable from '../../src/lib/components/FacetTable.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { resetStore, seedStore } from '../helpers'

beforeEach(() => {
  seedStore()
  tab.calls.construct.length = 0
  tab.calls.replaceData.length = 0
  tab.calls.download.length = 0
  tab.calls.setColumns.length = 0
  tab.calls.redraw.length = 0
  tab.calls.destroy = 0
})

afterEach(resetStore)

describe('FacetTable', () => {
  test('constructs Tabulator keyed by tandem_id with the initial selection', async () => {
    render(FacetTable)
    await waitFor(() => expect(tab.calls.construct).toHaveLength(1))
    expect(tab.calls.construct[0].index).toBe('tandem_id')
    expect((tab.calls.construct[0].data as { tandem_id: string }[]).map((l) => l.tandem_id)).toEqual([
      'T0001', 'T0002', 'T0003', 'T0004', 'T0005', 'T0006',
    ])
  })

  test('auto-fits header columns so a long label never clips, preserving Organism grow', async () => {
    render(FacetTable)
    // Header fit runs once the table is built AND fonts settle (pretext measurement).
    await waitFor(() => expect(tab.calls.setColumns.length).toBeGreaterThanOrEqual(1))
    const fitted = tab.calls.setColumns.at(-1)!
    const byTitle = (t: string) => fitted.find((c) => c.title === t)!

    // The two clipping columns (§4.1) are widened past their original data-driven widths.
    expect(byTitle('Spec. agreement').width!).toBeGreaterThan(132)
    expect(byTitle('Elements').width!).toBeGreaterThan(92)
    // Their mobile minimums grow to match, so the header can't clip on a scrolled phone.
    expect(byTitle('Spec. agreement').minWidth!).toBeGreaterThanOrEqual(byTitle('Spec. agreement').width!)

    // A short-label column with room to spare keeps its width (fit only widens, never shrinks).
    expect(byTitle('Accession').width).toBe(140)
    // Organism flexes via widthGrow — it must NEVER be pinned to an explicit width.
    expect(byTitle('Organism').width).toBeUndefined()

    // The header fit ends with a forced redraw so fitColumns re-applies.
    await waitFor(() => expect(tab.calls.redraw.some((f) => f === true)).toBe(true))
  })

  test('fires a SECOND deferred forced redraw after build, re-fitting at the settled width (#10)', async () => {
    render(FacetTable)
    // Two distinct forced redraws on mount: the header fit + the deferred post-build redraw
    // (scheduleRedraw(60), the §4.5 fix for the standalone table filling only ~60% at 2560).
    // With that deferred redraw removed, only the single fit redraw fires and this fails.
    await waitFor(() => expect(tab.calls.redraw.filter((f) => f === true).length).toBeGreaterThanOrEqual(2))
  })

  test('the resize observer redraws only on a genuine WIDTH change (loop guard, #10)', async () => {
    // jsdom has no ResizeObserver, so the width-guard (the anti-redraw-loop discipline) is
    // never exercised by default. Install a minimal polyfill that captures the callback,
    // then drive it: a redraw changes the table's HEIGHT, which must NOT feed back a redraw.
    const callbacks: Array<(e: Array<{ contentRect: { width: number } }>) => void> = []
    const realRO = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(cb: (e: Array<{ contentRect: { width: number } }>) => void) {
        callbacks.push(cb)
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    vi.useFakeTimers()
    try {
      render(FacetTable)
      await vi.runAllTimersAsync() // settle the fit + deferred build-time redraws
      expect(callbacks.length).toBeGreaterThanOrEqual(1)
      const fire = (width: number) => callbacks[0]([{ contentRect: { width } }])
      const base = tab.calls.redraw.length

      fire(500)
      await vi.advanceTimersByTimeAsync(200)
      expect(tab.calls.redraw.length).toBe(base + 1) // first width → one redraw

      fire(500)
      await vi.advanceTimersByTimeAsync(200)
      expect(tab.calls.redraw.length).toBe(base + 1) // SAME width → guarded, no redraw

      fire(820)
      await vi.advanceTimersByTimeAsync(200)
      expect(tab.calls.redraw.length).toBe(base + 2) // changed width → redraw
    } finally {
      vi.useRealTimers()
      ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = realRO
    }
  })

  test('renders the store-driven filter UI', () => {
    const { container } = render(FacetTable)
    expect(screen.getByPlaceholderText('Search loci…')).toBeInTheDocument()
    expect(screen.getByText('Specifier')).toBeInTheDocument()
    expect(screen.getByText('Phylum')).toBeInTheDocument()
    expect(screen.getByText('Function class')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()
    const count = container.querySelector('p')
    expect(count?.textContent?.replace(/\s+/g, ' ').trim()).toMatch(/Showing 6 of 6 loci/)
  })

  test('typing in the search box updates the shared store', () => {
    render(FacetTable)
    fireEvent.input(screen.getByPlaceholderText('Search loci…'), { target: { value: 'bacillus' } })
    expect(store.filter.search).toBe('bacillus')
  })

  test('a facet checkbox toggles the shared store', () => {
    render(FacetTable)
    const label = screen.getByText('TRP').closest('label')!
    const checkbox = label.querySelector('input[type="checkbox"]')!
    fireEvent.change(checkbox)
    expect(store.isActive('specifier', 'TRP')).toBe(true)
  })

  test('re-feeds Tabulator with the cross-filtered selection', async () => {
    render(FacetTable)
    await waitFor(() => expect(tab.calls.replaceData.length).toBeGreaterThanOrEqual(1))
    const before = tab.calls.replaceData.length
    store.toggleFacet('specifier', 'TRP')
    flushSync()
    expect(tab.calls.replaceData.length).toBeGreaterThan(before)
    expect(tab.calls.replaceData.at(-1)!.map((l) => l.tandem_id)).toEqual(['T0001', 'T0005'])
  })

  test('Export CSV triggers a Tabulator csv download', () => {
    render(FacetTable)
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(tab.calls.download).toContainEqual(['csv', 'tbdb-tandem-loci.csv'])
  })

  // PLAN §8.4 list fade/reflow, scoped (S2.6): the `tv-narrowing` class is added
  // around a genuine cross-filter narrow and removed one animation later. Scoping it
  // to a `store.selected` change is what keeps the fade off Tabulator's virtual-scroll
  // recycling + column sorts (which re-render rows without this effect firing).
  test('scopes the fade to a cross-filter narrow: tv-narrowing added then removed', () => {
    vi.useFakeTimers()
    try {
      const { container } = render(FacetTable)
      flushSync()
      const wrap = container.querySelector('.tv-table') as HTMLElement
      vi.advanceTimersByTime(250) // clear any mount-time narrow
      expect(wrap.classList.contains('tv-narrowing')).toBe(false)

      store.toggleFacet('specifier', 'TRP') // a real cross-filter narrow
      flushSync()
      expect(wrap.classList.contains('tv-narrowing')).toBe(true)

      vi.advanceTimersByTime(250)
      expect(wrap.classList.contains('tv-narrowing')).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
