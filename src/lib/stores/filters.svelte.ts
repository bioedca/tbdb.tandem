// tbdb.tandem cross-filter brain + reactive data layer (PLAN §7.3, §7.5).
//
// One `$state` filter store with a `$derived selected = ALL.filter(...)` — 470
// rows recompute sub-millisecond, so there is NO crossfilter.js (PLAN §7.3). The
// loaded artifacts live here too: runes require a `.svelte.ts` module, and §7.5
// gives the front-end exactly one store file, so this singleton is both the data
// holder (loci / summary / the in-memory members Map / lazy identity + tree
// artifacts) and the facet filter state every view shares.
//
// The pure helpers (`matchesFilters`, `filterLoci`, …) are framework-agnostic and
// unit-tested at S1.6 (PLAN §10.2); the class wires them to reactive state.

import type { CloudData } from '../cloud/types'
import {
  buildIdentityMap,
  buildMemberMap,
  loadCloud,
  loadCore,
  loadIdentity,
  loadMembers,
  loadNewick,
  loadTreeLocusMap,
  loadTreeTips,
} from '../data/load'
import {
  FACET_FIELD,
  SEARCH_FIELDS,
  type Facets,
  type FacetKey,
  type FilterState,
  type IdentityFile,
  type Locus,
  type Member,
  type MembersMap,
  type Summary,
  type TreeLocusMap,
  type TreeTipsMap,
} from '../data/types'

// ── Pure filter logic (PLAN §7.3; unit-tested at S1.6) ─────────────────────────

/** The five facet keys in a stable order (search is handled separately). */
export const FACET_KEYS: FacetKey[] = [
  'specifier',
  'phylum',
  'type',
  'confidence',
  'func_class',
]

/** A fresh, empty filter state — every facet unconstrained, no search text. */
export function emptyFilterState(): FilterState {
  return {
    specifier: new Set<string>(),
    phylum: new Set<string>(),
    type: new Set<string>(),
    confidence: new Set<string>(),
    func_class: new Set<string>(),
    search: '',
  }
}

/** A facet matches when it is unconstrained (empty set) or the locus's value is in
 *  the selected set. A null locus value is excluded whenever the facet is active. */
function facetMatch(selected: Set<string>, value: string | null): boolean {
  if (selected.size === 0) return true
  return value !== null && selected.has(value)
}

/** Case-insensitive substring search over the locus's string fields (PLAN §7.3). */
export function searchMatch(locus: Locus, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return SEARCH_FIELDS.some((field) => {
    const value = locus[field]
    return typeof value === 'string' && value.toLowerCase().includes(needle)
  })
}

/** True iff a locus passes every active facet (AND across facets) AND the search. */
export function matchesFilters(locus: Locus, state: FilterState): boolean {
  for (const key of FACET_KEYS) {
    if (!facetMatch(state[key], locus[FACET_FIELD[key]] as string | null)) {
      return false
    }
  }
  return searchMatch(locus, state.search)
}

/** Apply the full filter state to a locus list (the `ALL.filter(...)` of §7.3). */
export function filterLoci(loci: Locus[], state: FilterState): Locus[] {
  return loci.filter((locus) => matchesFilters(locus, state))
}

/** A single active filter chip (for `FacetChip` rendering at S1.4/S1.5). */
export interface ActiveFilter {
  facet: FacetKey
  value: string
}

// ── Load lifecycle status ──────────────────────────────────────────────────────

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

// ── The store ──────────────────────────────────────────────────────────────────

/**
 * The application's single reactive store (PLAN §7.3). Boot fetches `loci.json` +
 * `summary.json` and, in parallel, `members.json`; `identity.json` and the tree
 * artifacts are lazy. `selected` is the cross-filtered locus list every panel,
 * the table, and (later) the tree share.
 */
export class TandemStore {
  // Boot data (loci + summary) — gates first paint.
  loci = $state<Locus[]>([])
  facets = $state<Facets | null>(null)
  summary = $state<Summary | null>(null)
  status = $state<LoadStatus>('idle')
  error = $state<string | null>(null)

  // Parallel data (members) — unlocks detail diagrams / RNA.
  members = $state<MembersMap | null>(null)
  /** `Map<tandem_id, Member[]>` (ordinal-ordered) — detail pages read this with
   *  no per-locus network call (PLAN §7.3). */
  membersByLocus = $state<Map<string, Member[]>>(new Map())
  membersStatus = $state<LoadStatus>('idle')

  // Lazy data (identity on detail; tree.* on /tree).
  identityByLocus = $state<Map<string, IdentityFile> | null>(null)
  treeTips = $state<TreeTipsMap | null>(null)
  treeLocusMap = $state<TreeLocusMap | null>(null)
  newickMain = $state<string | null>(null)
  newickFallback = $state<string | null>(null)
  treesStatus = $state<LoadStatus>('idle')

  // Lazy data (the 3D similarity-cloud embedding, on /cloud).
  cloud = $state<CloudData | null>(null)
  cloudStatus = $state<LoadStatus>('idle')

  // Filter state + the cross-filtered selection.
  filter = $state<FilterState>(emptyFilterState())

  /** The cross-filtered loci — `ALL.filter(...)` over the live filter state. */
  selected = $derived(filterLoci(this.loci, this.filter))

  /** Whether any facet or the search box is currently constraining the selection. */
  isFiltered = $derived(
    this.filter.search.trim().length > 0 ||
      FACET_KEYS.some((key) => this.filter[key].size > 0),
  )

  /** The active facet selections, flattened for chip rendering (S1.4/S1.5). */
  activeFilters: ActiveFilter[] = $derived.by(() => {
    const out: ActiveFilter[] = []
    for (const facet of FACET_KEYS) {
      for (const value of this.filter[facet]) out.push({ facet, value })
    }
    return out
  })

  // Promise guards so a lazy artifact is fetched at most once.
  #identityPromise: Promise<Map<string, IdentityFile>> | null = null
  #treesPromise: Promise<void> | null = null
  #cloudPromise: Promise<void> | null = null

  /** Boot: fetch the core pair (loci + summary); kick members off in parallel
   *  (PLAN §7.3). Idempotent — safe to call from App's mount effect. */
  async boot(): Promise<void> {
    if (this.status !== 'idle') return
    this.status = 'loading'
    // Members load concurrently with the boot pair, not after it.
    void this.#hydrateMembers()
    try {
      const [lociFile, summary] = await loadCore()
      this.loci = lociFile.loci
      this.facets = lociFile.facets
      this.summary = summary
      this.status = 'ready'
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
      this.status = 'error'
    }
  }

  async #hydrateMembers(): Promise<void> {
    if (this.membersStatus !== 'idle') return
    this.membersStatus = 'loading'
    try {
      const map = await loadMembers()
      this.members = map
      this.membersByLocus = buildMemberMap(map)
      this.membersStatus = 'ready'
    } catch {
      this.membersStatus = 'error'
    }
  }

  /** Lazily load `identity.json` and group it by locus (PLAN §7.3). A failed load
   *  degrades gracefully: the detail page's comparison panel simply omits the
   *  supplementary pairwise-%-identity rows (identity is not load-bearing for the
   *  page), and the guard is cleared so a later detail visit can retry — never an
   *  unhandled rejection. */
  ensureIdentity(): Promise<Map<string, IdentityFile>> {
    if (!this.#identityPromise) {
      this.#identityPromise = loadIdentity()
        .then(buildIdentityMap)
        .then((map) => {
          this.identityByLocus = map
          return map
        })
        .catch(() => {
          this.#identityPromise = null
          return new Map<string, IdentityFile>()
        })
    }
    return this.#identityPromise
  }

  /** Lazily load the four tree artifacts (`/tree`; PLAN §7.3). A failed load sets
   *  `treesStatus = 'error'` (the `/tree` view shows a fallback message) and clears
   *  the guard so a later visit can retry — never an unhandled rejection. */
  ensureTrees(): Promise<void> {
    if (!this.#treesPromise) {
      this.treesStatus = 'loading'
      this.#treesPromise = Promise.all([
        loadTreeTips(),
        loadTreeLocusMap(),
        loadNewick('main'),
        loadNewick('fallback'),
      ])
        .then(([tips, locusMap, main, fallback]) => {
          this.treeTips = tips
          this.treeLocusMap = locusMap
          this.newickMain = main
          this.newickFallback = fallback
          this.treesStatus = 'ready'
        })
        .catch(() => {
          this.treesStatus = 'error'
          this.#treesPromise = null
        })
    }
    return this.#treesPromise
  }

  /** Lazily load `cloud.json` (the `/cloud` 3D embedding; PLAN /cloud §6.2). A failed
   *  load sets `cloudStatus = 'error'` (the view shows a fallback) and clears the guard
   *  so a later visit can retry — never an unhandled rejection. Centralizing it here (as
   *  with `ensureTrees`) keeps the dashboard cross-filter wired to one store. */
  ensureCloud(): Promise<void> {
    if (!this.#cloudPromise) {
      this.cloudStatus = 'loading'
      this.#cloudPromise = loadCloud()
        .then((data) => {
          this.cloud = data
          this.cloudStatus = 'ready'
        })
        .catch(() => {
          this.cloudStatus = 'error'
          this.#cloudPromise = null
        })
    }
    return this.#cloudPromise
  }

  // ── Facet mutators (immutable Set replacement so `$derived` re-runs) ──────────

  /** Add or remove one value from a facet. */
  toggleFacet(facet: FacetKey, value: string): void {
    const next = new Set(this.filter[facet])
    if (next.has(value)) next.delete(value)
    else next.add(value)
    this.filter[facet] = next
  }

  /** Replace a facet's whole selection. */
  setFacet(facet: FacetKey, values: Iterable<string>): void {
    this.filter[facet] = new Set(values)
  }

  /** Clear one facet's selection. */
  clearFacet(facet: FacetKey): void {
    this.filter[facet] = new Set<string>()
  }

  /** Set the free-text search string. */
  setSearch(query: string): void {
    this.filter.search = query
  }

  /** Reset every facet and the search box to empty. */
  reset(): void {
    this.filter = emptyFilterState()
  }

  /** Whether a specific facet value is currently selected. */
  isActive(facet: FacetKey, value: string): boolean {
    return this.filter[facet].has(value)
  }
}

/** The application-wide singleton (PLAN §7.3 "one `$state` filter store"). */
export const store = new TandemStore()

// Dev-only handle so the boot + cross-filter reactivity can be exercised in the
// browser (and by the S3.4 e2e harness). Tree-shaken from the production build.
if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __tv?: { store: TandemStore } }).__tv = { store }
}
