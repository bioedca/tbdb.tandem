// Unit: the pure cross-filter reducers (PLAN §10.2, §7.3) — `matchesFilters`,
// `filterLoci`, `searchMatch`, `emptyFilterState`. Exercised across EVERY facet,
// the OR-within / AND-across semantics, null-value exclusion, and search. The
// reactive `$state`/`$derived` wiring is covered separately in store.svelte.test.ts.
import { describe, expect, test } from 'vitest'
import {
  emptyFilterState,
  filterLoci,
  matchesFilters,
  searchMatch,
} from '../../src/lib/stores/filters.svelte'
import type { FacetKey, FilterState } from '../../src/lib/data/types'
import { LOCI } from '../fixtures'

const ids = (loci: { tandem_id: string }[]) => loci.map((l) => l.tandem_id)
const byId = (id: string) => LOCI.find((l) => l.tandem_id === id)!

function withFacet(facet: FacetKey, values: string[]): FilterState {
  const state = emptyFilterState()
  state[facet] = new Set(values)
  return state
}

describe('emptyFilterState', () => {
  test('has an empty set per facet and no search text', () => {
    const s = emptyFilterState()
    expect(s.specifier.size).toBe(0)
    expect(s.phylum.size).toBe(0)
    expect(s.type.size).toBe(0)
    expect(s.confidence.size).toBe(0)
    expect(s.func_class.size).toBe(0)
    expect(s.search).toBe('')
  })
})

describe('filterLoci — single facet, every dimension', () => {
  test('an empty filter passes everything', () => {
    expect(ids(filterLoci(LOCI, emptyFilterState()))).toEqual([
      'T0001', 'T0002', 'T0003', 'T0004', 'T0005', 'T0006',
    ])
  })

  test('specifier', () => {
    expect(ids(filterLoci(LOCI, withFacet('specifier', ['TRP'])))).toEqual(['T0001', 'T0005'])
  })

  test('phylum', () => {
    expect(ids(filterLoci(LOCI, withFacet('phylum', ['Firmicutes'])))).toEqual([
      'T0001', 'T0002', 'T0005',
    ])
  })

  test('type', () => {
    expect(ids(filterLoci(LOCI, withFacet('type', ['Translational'])))).toEqual(['T0004'])
  })

  test('confidence', () => {
    expect(ids(filterLoci(LOCI, withFacet('confidence', ['low'])))).toEqual(['T0003', 'T0004'])
  })

  test('func_class', () => {
    expect(ids(filterLoci(LOCI, withFacet('func_class', ['biosynthesis'])))).toEqual([
      'T0002', 'T0005',
    ])
  })
})

describe('filterLoci — combinators', () => {
  test('OR within a facet (multiple selected values)', () => {
    expect(ids(filterLoci(LOCI, withFacet('specifier', ['TRP', 'THR'])))).toEqual([
      'T0001', 'T0003', 'T0005',
    ])
  })

  test('AND across facets', () => {
    const state = withFacet('specifier', ['TRP'])
    state.confidence = new Set(['high'])
    expect(ids(filterLoci(LOCI, state))).toEqual(['T0001', 'T0005'])
  })

  test('a null facet value is excluded whenever that facet is active', () => {
    // T0004 has a null phylum → excluded by any active phylum filter.
    expect(ids(filterLoci(LOCI, withFacet('phylum', ['Actinobacteria'])))).toEqual(['T0003'])
  })
})

describe('searchMatch', () => {
  test('empty query matches everything', () => {
    expect(searchMatch(byId('T0001'), '')).toBe(true)
    expect(searchMatch(byId('T0001'), '   ')).toBe(true)
  })

  test('case-insensitive substring over the searchable string fields', () => {
    expect(searchMatch(byId('T0001'), 'BACILLUS')).toBe(true) // organism
    expect(searchMatch(byId('T0002'), 'ile;leu')).toBe(true) // specifier_aa
    expect(searchMatch(byId('T0001'), 'trps')).toBe(true) // downstream_gene
    expect(searchMatch(byId('T0001'), 'zzz')).toBe(false)
  })

  test('null fields are skipped without throwing', () => {
    // T0004 has a null phylum; querying a phylum string must not match or crash.
    expect(searchMatch(byId('T0004'), 'firmicutes')).toBe(false)
  })
})

describe('filterLoci — search combined with facets', () => {
  test('free-text narrows within the faceted set', () => {
    const state = withFacet('specifier', ['TRP'])
    state.search = 'cereus'
    expect(ids(filterLoci(LOCI, state))).toEqual(['T0005'])
  })

  test('search alone matches across organisms', () => {
    const state = emptyFilterState()
    state.search = 'bacillus'
    expect(ids(filterLoci(LOCI, state))).toEqual(['T0001', 'T0005'])
  })
})

describe('matchesFilters', () => {
  test('a single locus is judged against the full state', () => {
    const state = withFacet('specifier', ['TRP'])
    expect(matchesFilters(byId('T0001'), state)).toBe(true)
    expect(matchesFilters(byId('T0002'), state)).toBe(false)
  })
})
