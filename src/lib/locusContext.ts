// Per-locus NCBI genomic context (PLAN §9 / fetch_genomic_context.py) — lazy loaders.
//
// The downstream gene's genomic coordinates + the interval sequence are fetched once,
// offline, from NCBI (data-pipeline/fetch_genomic_context.py) and committed under
// public/data/locus_context/; this module fetches one locus's context on demand and the
// small availability manifest once. Mirrors lib/r2dt.ts: a SUCCESSFUL result is cached;
// a null/error result clears its slot so a later mount retries (transient failure), and
// absence resolves to null so the figure degrades to the schematic downstream ORF.

import { dataUrl } from './data/load'
import type { LocusContext, LocusContextManifest } from './data/types'

export type { LocusContext, LocusContextManifest }

let manifestPromise: Promise<LocusContextManifest | null> | null = null
const contextCache = new Map<string, Promise<LocusContext | null>>()

/** Fetch the locus-context availability manifest once (cached). Resolves null if absent
 *  (e.g. the artifact isn't generated) so the UI degrades to the schematic gene. */
export function loadLocusContextManifest(): Promise<LocusContextManifest | null> {
  if (manifestPromise) return manifestPromise
  const p = fetch(dataUrl('locus_context/manifest.json'))
    .then((res) => (res.ok ? (res.json() as Promise<LocusContextManifest>) : null))
    .catch(() => null)
  manifestPromise = p
  void p.then((v) => {
    if (v == null) manifestPromise = null
  })
  return p
}

/** Fetch one locus's NCBI context (cached per tandem_id). Resolves null when the locus
 *  has no committed context or the fetch fails (→ the figure draws the schematic ORF and
 *  the per-element sequence track). Only a successful result is cached, so a transient
 *  failure retries on a later view. */
export function loadLocusContext(tandemId: string): Promise<LocusContext | null> {
  const cached = contextCache.get(tandemId)
  if (cached) return cached
  const p = fetch(dataUrl(`locus_context/${tandemId}.json`))
    .then((res) => (res.ok ? (res.json() as Promise<LocusContext>) : null))
    .catch(() => null)
  contextCache.set(tandemId, p)
  void p.then((v) => {
    if (v == null) contextCache.delete(tandemId)
  })
  return p
}
