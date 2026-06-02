// Unit: the reactive store wiring (PLAN §10.2, §7.3) — the `$state` filter +
// `$derived selected` recompute across every facet, plus `isFiltered`,
// `activeFilters`, and the facet mutators. The `.svelte.test.ts` extension lets
// the Svelte compiler process the runes in this file; `$effect.root` + `flushSync`
// give a synchronous reactive context (per the Svelte testing guide).
import { flushSync } from 'svelte'
import { expect, test } from 'vitest'
import { TandemStore } from '../../src/lib/stores/filters.svelte'
import { LOCI } from '../fixtures'

const ids = (loci: { tandem_id: string }[]) => loci.map((l) => l.tandem_id)

test('selected recomputes reactively across every facet + search', () => {
  const cleanup = $effect.root(() => {
    const s = new TandemStore()
    s.loci = LOCI

    // Unfiltered.
    expect(ids(s.selected)).toEqual(['T0001', 'T0002', 'T0003', 'T0004', 'T0005', 'T0006'])
    expect(s.isFiltered).toBe(false)
    expect(s.activeFilters).toEqual([])

    // toggleFacet adds a constraint.
    s.toggleFacet('specifier', 'TRP')
    flushSync()
    expect(ids(s.selected)).toEqual(['T0001', 'T0005'])
    expect(s.isFiltered).toBe(true)
    expect(s.isActive('specifier', 'TRP')).toBe(true)
    expect(s.activeFilters).toEqual([{ facet: 'specifier', value: 'TRP' }])

    // OR within the facet.
    s.toggleFacet('specifier', 'THR')
    flushSync()
    expect(ids(s.selected)).toEqual(['T0001', 'T0003', 'T0005'])

    // toggle off removes just that value.
    s.toggleFacet('specifier', 'TRP')
    flushSync()
    expect(ids(s.selected)).toEqual(['T0003'])
    expect(s.isActive('specifier', 'TRP')).toBe(false)

    // AND across facets: THR (low) ∧ confidence high → empty.
    s.setFacet('confidence', ['high'])
    flushSync()
    expect(s.selected).toHaveLength(0)

    // clearFacet drops the specifier constraint, leaving confidence high.
    s.clearFacet('specifier')
    flushSync()
    expect(ids(s.selected)).toEqual(['T0001', 'T0002', 'T0005', 'T0006'])

    // search narrows within the faceted set.
    s.setSearch('bacillus')
    flushSync()
    expect(ids(s.selected)).toEqual(['T0001', 'T0005'])

    // reset clears everything.
    s.reset()
    flushSync()
    expect(s.selected).toHaveLength(6)
    expect(s.isFiltered).toBe(false)
    expect(s.activeFilters).toEqual([])
  })
  cleanup()
})

test('setFacet replaces the whole selection', () => {
  const cleanup = $effect.root(() => {
    const s = new TandemStore()
    s.loci = LOCI
    s.setFacet('specifier', ['TRP', 'THR'])
    flushSync()
    expect(ids(s.selected)).toEqual(['T0001', 'T0003', 'T0005'])
    s.setFacet('specifier', ['THR'])
    flushSync()
    expect(ids(s.selected)).toEqual(['T0003'])
  })
  cleanup()
})

test('activeFilters flattens across facets in FACET_KEYS order', () => {
  const cleanup = $effect.root(() => {
    const s = new TandemStore()
    s.loci = LOCI
    s.setFacet('confidence', ['high'])
    s.setFacet('specifier', ['TRP'])
    flushSync()
    // specifier precedes confidence in FACET_KEYS regardless of set order.
    expect(s.activeFilters).toEqual([
      { facet: 'specifier', value: 'TRP' },
      { facet: 'confidence', value: 'high' },
    ])
  })
  cleanup()
})
