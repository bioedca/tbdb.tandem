// Component: SpecificityChart (PLAN §10.3, §9②). jsdom has no SVG layout, so the
// dynamically-imported Plotly is mocked (per PROGRESS S1.5): the fake records the
// `react` calls and captures the `plotly_click` handlers the component attaches,
// so we can assert it mounts, renders the triple-core list, and that a bar / cell
// click cross-filters the shared store.
import { render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const handlers: { bar: Record<string, (ev: unknown) => void>; heatmap: Record<string, (ev: unknown) => void> } = {
    bar: {},
    heatmap: {},
  }
  const reactCalls: { trace: string }[] = []
  const fake = {
    react: (el: HTMLElement & { on?: unknown }, data: { type?: string }[]) => {
      const trace = data?.[0]?.type === 'heatmap' ? 'heatmap' : 'bar'
      ;(el as { on: (evt: string, cb: (ev: unknown) => void) => void }).on = (evt, cb) => {
        handlers[trace as 'bar' | 'heatmap'][evt] = cb
      }
      reactCalls.push({ trace })
      return Promise.resolve(el)
    },
    newPlot: (el: HTMLElement) => Promise.resolve(el),
    purge: () => {},
    Plots: { resize: () => {} },
  }
  return { handlers, reactCalls, fake }
})

vi.mock('plotly.js-dist-min', () => ({ default: mock.fake }))

import SpecificityChart from '../../src/lib/components/SpecificityChart.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { resetStore, seedStore } from '../helpers'

beforeEach(() => {
  seedStore()
  mock.handlers.bar = {}
  mock.handlers.heatmap = {}
  mock.reactCalls.length = 0
})

afterEach(resetStore)

describe('SpecificityChart', () => {
  test('mounts both Plotly views and renders the triple-core list', async () => {
    render(SpecificityChart)
    await waitFor(() => expect(mock.reactCalls.length).toBeGreaterThanOrEqual(2))
    expect(mock.reactCalls.some((c) => c.trace === 'bar')).toBe(true)
    expect(mock.reactCalls.some((c) => c.trace === 'heatmap')).toBe(true)
    // the single fixture triple (T0005) is surfaced as a button, not a 2D cell.
    expect(screen.getByText('T0005')).toBeInTheDocument()
    expect(screen.getByText(/Triple-core loci/)).toBeInTheDocument()
  })

  test('clicking a bar cross-filters the store to that specifier', async () => {
    render(SpecificityChart)
    await waitFor(() => expect(mock.handlers.bar.plotly_click).toBeTypeOf('function'))
    mock.handlers.bar.plotly_click({ points: [{ y: 'TRP' }] })
    expect([...store.filter.specifier]).toEqual(['TRP'])
  })

  test('clicking the active bar again clears it (single-select toggle)', async () => {
    render(SpecificityChart)
    await waitFor(() => expect(mock.handlers.bar.plotly_click).toBeTypeOf('function'))
    mock.handlers.bar.plotly_click({ points: [{ y: 'TRP' }] })
    expect([...store.filter.specifier]).toEqual(['TRP'])
    mock.handlers.bar.plotly_click({ points: [{ y: 'TRP' }] })
    expect(store.filter.specifier.size).toBe(0)
  })

  test('clicking the ILE×LEU matrix cell cross-filters to ILE;LEU', async () => {
    render(SpecificityChart)
    await waitFor(() => expect(mock.handlers.heatmap.plotly_click).toBeTypeOf('function'))
    mock.handlers.heatmap.plotly_click({ points: [{ x: 'ILE', y: 'LEU', z: 10 }] })
    expect([...store.filter.specifier]).toEqual(['ILE;LEU'])
  })

  test('clicking an empty (null-z) matrix cell does nothing', async () => {
    render(SpecificityChart)
    await waitFor(() => expect(mock.handlers.heatmap.plotly_click).toBeTypeOf('function'))
    mock.handlers.heatmap.plotly_click({ points: [{ x: 'TRP', y: 'ALA', z: null }] })
    expect(store.filter.specifier.size).toBe(0)
  })
})
