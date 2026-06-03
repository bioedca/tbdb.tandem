// Component: SpecPhylumHeatmap (PLAN §10.3, §9, §8.2). jsdom has no SVG layout, so
// the dynamically-imported Plotly is mocked (per the SpecificityChart precedent):
// the fake records `react` calls and captures the `plotly_click` handler, so we can
// assert it mounts and that a cell click cross-filters the shared store (incl. the
// unassigned-row special case and the empty-cell no-op).
import { render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const handlers: Record<string, (ev: unknown) => void> = {}
  const reactCalls: { trace: string }[] = []
  const fake = {
    react: (el: HTMLElement & { on?: unknown }, data: { type?: string }[]) => {
      ;(el as { on: (evt: string, cb: (ev: unknown) => void) => void }).on = (evt, cb) => {
        handlers[evt] = cb
      }
      reactCalls.push({ trace: data?.[0]?.type ?? 'unknown' })
      return Promise.resolve(el)
    },
    newPlot: (el: HTMLElement) => Promise.resolve(el),
    purge: () => {},
    Plots: { resize: () => {} },
  }
  return { handlers, reactCalls, fake }
})

vi.mock('plotly.js-dist-min', () => ({ default: mock.fake }))

import SpecPhylumHeatmap from '../../src/lib/components/SpecPhylumHeatmap.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { resetStore, seedStore } from '../helpers'

beforeEach(() => {
  seedStore()
  for (const k of Object.keys(mock.handlers)) delete mock.handlers[k]
  mock.reactCalls.length = 0
})

afterEach(resetStore)

describe('SpecPhylumHeatmap', () => {
  test('mounts a Plotly heatmap', async () => {
    render(SpecPhylumHeatmap)
    await waitFor(() => expect(mock.reactCalls.length).toBeGreaterThanOrEqual(1))
    expect(mock.reactCalls.some((c) => c.trace === 'heatmap')).toBe(true)
  })

  test('clicking a cell cross-filters to that specifier × phylum', async () => {
    render(SpecPhylumHeatmap)
    await waitFor(() => expect(mock.handlers.plotly_click).toBeTypeOf('function'))
    mock.handlers.plotly_click({ points: [{ x: 'TRP', y: 'Firmicutes', z: 2 }] })
    expect([...store.filter.specifier]).toEqual(['TRP'])
    expect([...store.filter.phylum]).toEqual(['Firmicutes'])
  })

  test('clicking the unassigned row sets only the specifier (null phylum is not a facet value)', async () => {
    render(SpecPhylumHeatmap)
    await waitFor(() => expect(mock.handlers.plotly_click).toBeTypeOf('function'))
    mock.handlers.plotly_click({ points: [{ x: '?', y: 'unassigned', z: 1 }] })
    expect([...store.filter.specifier]).toEqual(['?'])
    expect(store.filter.phylum.size).toBe(0)
  })

  test('clicking an empty (null-z) cell does nothing', async () => {
    render(SpecPhylumHeatmap)
    await waitFor(() => expect(mock.handlers.plotly_click).toBeTypeOf('function'))
    mock.handlers.plotly_click({ points: [{ x: 'THR', y: 'Firmicutes', z: null }] })
    expect(store.filter.specifier.size).toBe(0)
    expect(store.filter.phylum.size).toBe(0)
  })
})
