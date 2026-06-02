// Test helpers for seeding / clearing the application singleton store
// (`stores/filters.svelte.ts`). The component tests render real components that
// read the singleton, so each test seeds it before rendering and clears it after
// (the global `afterEach` in `setup.ts` only unmounts the DOM).
import { store } from '../src/lib/stores/filters.svelte'
import type { Facets } from '../src/lib/data/types'
import { FACETS, LOCI, MEMBERS_BY_LOCUS, SUMMARY } from './fixtures'

/** Load the fixture dataset into the singleton store, unfiltered + members-ready. */
export function seedStore(): void {
  store.loci = LOCI
  store.facets = FACETS as Facets
  store.summary = SUMMARY
  store.membersByLocus = MEMBERS_BY_LOCUS
  store.membersStatus = 'ready'
  store.status = 'ready'
  store.reset()
}

/** Return the singleton to its pristine empty state between tests. Clears the
 *  lazy identity/tree fields too (unused by the Phase-1 component tests, but kept
 *  complete so S2/S3 tests that DO load them can't leak across tests). */
export function resetStore(): void {
  store.reset()
  store.loci = []
  store.facets = null
  store.summary = null
  store.status = 'idle'
  store.error = null
  store.members = null
  store.membersByLocus = new Map()
  store.membersStatus = 'idle'
  store.identityByLocus = null
  store.treeTips = null
  store.treeLocusMap = null
  store.newickMain = null
  store.newickFallback = null
}
