// tbdb.tandem staged data loading (PLAN §7.3).
//
// The committed artifacts under `public/data/` are fetched in stages so the
// dashboard boots instantly (PLAN §7.3):
//
//   boot      → loci.json + summary.json  (table / charts / KPIs render at once)
//   parallel  → members.json              (unlocks detail diagrams / RNA)
//   lazy      → identity.json             (on a detail page)
//   lazy      → tree.* on /tree           (the four tree artifacts)
//
// Every fetch goes through `import.meta.env.BASE_URL` (PLAN §7.4) so the same code
// resolves at `/` locally and `/tbdb.tandem/` on GitHub Pages. These are
// pure functions with no reactive state — the reactive store in
// `stores/filters.svelte.ts` orchestrates and holds the results.

import type { CloudData } from '../cloud/types'
import type {
  IdentityFile,
  LociFile,
  Member,
  MembersMap,
  Summary,
  TreeLocusMap,
  TreeName,
  TreeTipsMap,
} from './types'

/** Absolute URL of a committed `public/data/<file>`, base-path aware (PLAN §7.4).
 *  `BASE_URL` always ends in `/`, so e.g. `data/loci.json` →
 *  `/tbdb.tandem/data/loci.json` in CI, `/data/loci.json` locally. */
export function dataUrl(file: string): string {
  return `${import.meta.env.BASE_URL}data/${file}`
}

/** Fetch + parse one JSON artifact, throwing a contextual error on a bad response. */
async function fetchJson<T>(file: string): Promise<T> {
  const url = dataUrl(file)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ${file} (${res.status} ${res.statusText})`)
  }
  return (await res.json()) as T
}

/** Fetch one artifact as text (the Newick tree files are not JSON). */
async function fetchText(file: string): Promise<string> {
  const url = dataUrl(file)
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to load ${file} (${res.status} ${res.statusText})`)
  }
  return res.text()
}

// ── Boot stage (PLAN §7.3) ─────────────────────────────────────────────────────

/** `loci.json` — the 470 loci + facet vocabularies (table backbone). */
export function loadLoci(): Promise<LociFile> {
  return fetchJson<LociFile>('loci.json')
}

/** `summary.json` — KPI + distribution payload (~2 KB). */
export function loadSummary(): Promise<Summary> {
  return fetchJson<Summary>('summary.json')
}

/** The boot pair, fetched together so KPIs + table render instantly (PLAN §7.3). */
export function loadCore(): Promise<[LociFile, Summary]> {
  return Promise.all([loadLoci(), loadSummary()])
}

// ── Parallel stage (PLAN §7.3) ─────────────────────────────────────────────────

/** `members.json` — the 949 member objects, keyed by `member_id`. */
export function loadMembers(): Promise<MembersMap> {
  return fetchJson<MembersMap>('members.json')
}

/** Group members into the in-memory `Map<tandem_id, Member[]>` the detail pages
 *  read with no per-locus network call (PLAN §7.3). Each locus's members are
 *  ordered by transcript-5′ `ordinal` (1 = most-5′). */
export function buildMemberMap(members: MembersMap): Map<string, Member[]> {
  const byLocus = new Map<string, Member[]>()
  for (const member of Object.values(members)) {
    const list = byLocus.get(member.tandem_id)
    if (list) list.push(member)
    else byLocus.set(member.tandem_id, [member])
  }
  for (const list of byLocus.values()) {
    list.sort((a, b) => a.ordinal - b.ordinal)
  }
  return byLocus
}

// ── Lazy stages (PLAN §7.3) ────────────────────────────────────────────────────

/** `identity.json` — the flat 488-pair intra-locus %-identity list. Lazy on detail. */
export function loadIdentity(): Promise<IdentityFile> {
  return fetchJson<IdentityFile>('identity.json')
}

/** `tree_tips.json` — `unique_name` → tip metadata. Lazy on `/tree`. */
export function loadTreeTips(): Promise<TreeTipsMap> {
  return fetchJson<TreeTipsMap>('tree_tips.json')
}

/** `tree_locus_map.json` — `tandem_id` → tip `unique_name`s. Lazy on `/tree`. */
export function loadTreeLocusMap(): Promise<TreeLocusMap> {
  return fetchJson<TreeLocusMap>('tree_locus_map.json')
}

/** A Newick tree as text — `main` → `tree.nwk`, `fallback` → `tree_fallback.nwk`.
 *  The stored Newick is midpoint-rooted for layout only; the view displays it
 *  UNROOTED (PLAN §6). Lazy on `/tree`. */
export function loadNewick(which: Extract<TreeName, 'main' | 'fallback'>): Promise<string> {
  return fetchText(which === 'main' ? 'tree.nwk' : 'tree_fallback.nwk')
}

/** `cloud.json` — the 3D similarity-cloud embedding (PCoA coords + k-NN edges +
 *  per-point metadata). Lazy on `/cloud` (PLAN /cloud §6.2). */
export function loadCloud(): Promise<CloudData> {
  return fetchJson<CloudData>('cloud.json')
}

/** Group an intra-locus identity list into `Map<tandem_id, IdentityFile>` for the
 *  detail page (PLAN §7.3). The locus key is the shared `member_id` prefix. */
export function buildIdentityMap(pairs: IdentityFile): Map<string, IdentityFile> {
  const byLocus = new Map<string, IdentityFile>()
  for (const pair of pairs) {
    const tandemId = pair.a.split('.')[0]
    const list = byLocus.get(tandemId)
    if (list) list.push(pair)
    else byLocus.set(tandemId, [pair])
  }
  return byLocus
}

export type { Member }
