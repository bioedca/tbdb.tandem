// Component: PhyloTree (PLAN §10.3, §9④, §6). jsdom has no SVG layout, so the
// dynamically-imported `phylotree` is mocked (per the Plotly-component precedent):
// the fake records the Newick string each render is constructed with, so we can
// assert it mounts, that the locus/element toggle swaps in the collapsed vs full
// tree (tip counts), and that the main↔fallback toggle swaps the source tree —
// without any real d3/SVG layout. The lazy tree loaders are mocked to feed a tiny
// synthetic tree; the real collapse/render is covered by tree.test.ts + the live
// Playwright sweep.
import { fireEvent, render, waitFor } from '@testing-library/svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { countLeaves, parseNewick } from '../../src/lib/tree'
import type { TreeTipsMap } from '../../src/lib/data/types'

// Synthetic tree: U1,U2 are sisters of locus T1 (→ collapse to one tip); U3 is T2.
// Element main = 3 tips, locus main = 2 tips. Fallback = 2 tips (no collapse).
const MAIN_NWK = '((U1:0.1,U2:0.1)0.9:0.2,U3:0.3)0.8;'
const FALLBACK_NWK = '(U4:0.1,U5:0.1)0.7;'
const TIPS: TreeTipsMap = {
  U1: { member_id: 'T1.m1', tandem_id: 'T1', ordinal: 1, specifier: 'TRP', phylum: 'Firmicutes', tree: 'main' },
  U2: { member_id: 'T1.m2', tandem_id: 'T1', ordinal: 2, specifier: 'TRP', phylum: 'Firmicutes', tree: 'main' },
  U3: { member_id: 'T2.m1', tandem_id: 'T2', ordinal: 1, specifier: 'LEU', phylum: 'Actinobacteria', tree: 'main' },
  U4: { member_id: 'T3.m1', tandem_id: 'T3', ordinal: 1, specifier: 'ILE', phylum: 'Firmicutes', tree: 'fallback' },
  U5: { member_id: 'T4.m1', tandem_id: 'T4', ordinal: 1, specifier: null, phylum: null, tree: 'fallback' },
}

const mock = vi.hoisted(() => ({ constructed: [] as string[] }))

vi.mock('phylotree', () => ({
  phylotree: class {
    constructor(nwk: string) {
      mock.constructed.push(nwk)
    }
    render() {
      return {
        show: () => document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        update: () => {},
      }
    }
  },
}))

vi.mock('../../src/lib/data/load', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return {
    ...actual,
    loadTreeTips: () => Promise.resolve(TIPS),
    loadTreeLocusMap: () => Promise.resolve({ T1: ['U1', 'U2'], T2: ['U3'], T3: ['U4'], T4: ['U5'] }),
    loadNewick: (which: string) => Promise.resolve(which === 'main' ? MAIN_NWK : FALLBACK_NWK),
  }
})

import PhyloTree from '../../src/lib/components/PhyloTree.svelte'
import { store } from '../../src/lib/stores/filters.svelte'
import { resetStore, seedStore } from '../helpers'

/** Leaf count of the most recently constructed Newick. */
const lastLeaves = (): number => countLeaves(parseNewick(mock.constructed[mock.constructed.length - 1]))

beforeEach(() => {
  seedStore()
  // Seed the tree fields directly so renders after the first (cached load promise)
  // still see ready data; the mocked loaders cover the first onMount load.
  store.treeTips = TIPS
  store.treeLocusMap = { T1: ['U1', 'U2'], T2: ['U3'], T3: ['U4'], T4: ['U5'] }
  store.newickMain = MAIN_NWK
  store.newickFallback = FALLBACK_NWK
  store.treesStatus = 'ready'
  mock.constructed.length = 0
})

afterEach(resetStore)

describe('PhyloTree', () => {
  test('mounts and renders the locus-collapsed main tree by default (sisters fold)', async () => {
    render(PhyloTree)
    await waitFor(() => expect(mock.constructed.length).toBeGreaterThanOrEqual(1))
    // Locus view: T1's two sisters collapse → 2 tips (T1, T2).
    expect(lastLeaves()).toBe(2)
  })

  test('the element toggle expands to the full element tree', async () => {
    const { getByRole } = render(PhyloTree)
    await waitFor(() => expect(mock.constructed.length).toBeGreaterThanOrEqual(1))
    await fireEvent.click(getByRole('button', { name: 'Element' }))
    await waitFor(() => expect(lastLeaves()).toBe(3)) // U1, U2, U3
  })

  test('the fallback toggle switches to the fallback tree', async () => {
    const { getByRole } = render(PhyloTree)
    await waitFor(() => expect(mock.constructed.length).toBeGreaterThanOrEqual(1))
    await fireEvent.click(getByRole('button', { name: 'Fallback' }))
    // Now the fallback loci (T3, T4) replace the main loci (T1, T2). In the default
    // locus view its leaves are relabeled to tandem_id; 2 single-tip loci → 2 tips.
    await waitFor(() => {
      const nwk = mock.constructed[mock.constructed.length - 1]
      expect(nwk.includes('T3') && nwk.includes('T4')).toBe(true)
      expect(nwk.includes('T1') || nwk.includes('T2')).toBe(false)
      expect(countLeaves(parseNewick(nwk))).toBe(2)
    })
  })

  test('renders the controls and a specifier legend', () => {
    const { getByRole, getByText } = render(PhyloTree)
    expect(getByRole('button', { name: 'Locus' })).toBeInTheDocument()
    expect(getByRole('button', { name: 'Element' })).toBeInTheDocument()
    expect(getByRole('checkbox')).toBeInTheDocument() // non-Firmicutes filter
    expect(getByText('Specifier')).toBeInTheDocument()
  })

  test('shows a spinner until the tree artifacts are ready', () => {
    store.treesStatus = 'loading'
    const { getByRole } = render(PhyloTree)
    expect(getByRole('status')).toBeInTheDocument()
  })

  // ── S3.2: dashboard cross-filter (selector + responder) ─────────────────────────

  test('the full /tree view (default) hints a tip click opens its detail page', () => {
    const { getByText } = render(PhyloTree)
    expect(getByText(/click to open its detail page/i)).toBeInTheDocument()
  })

  test('the selectable dashboard panel hints a tip click filters by specifier', () => {
    const { getByText } = render(PhyloTree, { props: { selectable: true } })
    expect(getByText(/click to filter the dashboard by its specifier/i)).toBeInTheDocument()
  })

  test('shows the cross-filter cue and still mounts when the store is filtered (responder)', async () => {
    // An active facet makes `store.isFiltered` true → the responder path runs
    // (selectedTandemIds / crossFiltered / specifierByLocus derivations + the
    // out-of-selection dimming). The full tree still mounts (filtering dims, it
    // does not rebuild the topology), and the tip-count line surfaces the cue.
    store.setFacet('specifier', ['TRP'])
    const { getByRole, getByText } = render(PhyloTree, { props: { selectable: true } })
    await waitFor(() => expect(mock.constructed.length).toBeGreaterThanOrEqual(1))
    expect(getByRole('button', { name: 'Locus' })).toBeInTheDocument()
    expect(getByText(/cross-filtered/i)).toBeInTheDocument()
  })

  test('hides the cross-filter cue when the store is unfiltered', () => {
    // seedStore() leaves the store unfiltered → crossFiltered is false → no cue.
    const { queryByText } = render(PhyloTree, { props: { selectable: true } })
    expect(queryByText(/cross-filtered/i)).toBeNull()
  })
})
