// Component: OperonBreakdown (PLAN §10.3, §9③, §5.3). Mocks the dynamically-imported
// Plotly (no SVG layout in jsdom): records each `react` (bar vs sankey) with its data
// and captures the bar's `plotly_click` handler. Asserts both the stacked bars and
// the Sankey mount, the bar-click + type-chip cross-filters, and the Sankey
// node/link counts the model produced.
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mock = vi.hoisted(() => {
  const handlers: { bar: Record<string, (ev: unknown) => void>; sankey: Record<string, (ev: unknown) => void> } = {
    bar: {},
    sankey: {},
  }
  const reactCalls: { trace: 'bar' | 'sankey'; data: Record<string, unknown>[] }[] = []
  const fake = {
    react: (el: HTMLElement & { on?: unknown }, data: { type?: string }[]) => {
      const trace = data?.[0]?.type === 'sankey' ? 'sankey' : 'bar'
      ;(el as { on: (evt: string, cb: (ev: unknown) => void) => void }).on = (evt, cb) => {
        handlers[trace][evt] = cb
      }
      reactCalls.push({ trace, data: data as Record<string, unknown>[] })
      return Promise.resolve(el)
    },
    newPlot: (el: HTMLElement) => Promise.resolve(el),
    purge: () => {},
    Plots: { resize: () => {} },
  }
  return { handlers, reactCalls, fake }
})

vi.mock('plotly.js-dist-min', () => ({ default: mock.fake }))

import OperonBreakdown from '../../src/lib/components/OperonBreakdown.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { resetStore, seedStore } from '../helpers'

beforeEach(() => {
  seedStore()
  mock.handlers.bar = {}
  mock.handlers.sankey = {}
  mock.reactCalls.length = 0
})

afterEach(resetStore)

describe('OperonBreakdown', () => {
  test('mounts the stacked bars and the Sankey', async () => {
    render(OperonBreakdown)
    await waitFor(() => expect(mock.reactCalls.some((c) => c.trace === 'sankey')).toBe(true))
    expect(mock.reactCalls.some((c) => c.trace === 'bar')).toBe(true)
  })

  test('renders the regulation-type chips with their counts', () => {
    render(OperonBreakdown)
    expect(screen.getByRole('button', { name: /Transcriptional/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Translational/ })).toBeInTheDocument()
  })

  test('clicking a func_class bar cross-filters the store', async () => {
    render(OperonBreakdown)
    await waitFor(() => expect(mock.handlers.bar.plotly_click).toBeTypeOf('function'))
    mock.handlers.bar.plotly_click({ points: [{ y: 'aaRS' }] })
    expect([...store.filter.func_class]).toEqual(['aaRS'])
  })

  test('clicking a type chip toggles the type facet', () => {
    render(OperonBreakdown)
    fireEvent.click(screen.getByRole('button', { name: /Transcriptional/ }))
    expect(store.isActive('type', 'Transcriptional')).toBe(true)
  })

  test('the Sankey carries one node per axis value and one link per coupling', async () => {
    render(OperonBreakdown)
    await waitFor(() => expect(mock.reactCalls.some((c) => c.trace === 'sankey')).toBe(true))
    const sankey = mock.reactCalls.findLast((c) => c.trace === 'sankey')!.data[0] as {
      node: { label: string[] }
      link: { source: number[] }
    }
    expect(sankey.node.label).toHaveLength(10) // 5 specifiers + 5 func_classes (fixtures)
    expect(sankey.link.source).toHaveLength(6) // one per (specifier, func_class) co-occurrence
  })
})
