// tbdb.tandem similarity-cloud types (the /cloud view) — the front-end mirror of
// the `public/data/cloud.json` contract emitted by `data-pipeline/build_cloud.py`.
//
// Like `data/types.ts`, these are hand-written stable types kept in sync with the
// build by hand. The cloud is an EXPLORATORY 3D similarity embedding (a companion
// to the unrooted `/tree` map) — NO POLARITY: positions reflect Stem-I sequence
// similarity, never ancestry (PLAN §6, §13).

import type { Confidence, FuncClass, RegulationType } from '../data/types'

/** One embedded element point (cloud.json `points[]`, build_cloud.py §3.4). */
export interface CloudPoint {
  /** `unique_name` — the tree leaf / tbdb deep-link key (the per-point identity). */
  id: string
  tandem_id: string
  member_id: string
  /** Transcript-5′ ordinal (1 = most-5′). */
  ord: number
  /** Member specifier amino acid (null for codon-less partials). */
  spec: string | null
  /** Per-locus phylum (null for the unassigned loci). */
  phylum: string | null
  /** Locus regulated downstream function class. */
  func: FuncClass | null
  /** Locus regulation mode. */
  type: RegulationType | null
  /** Locus confidence. */
  conf: Confidence | null
  /** True when the locus's elements disagree on specifier (`same_specifier === false`). */
  mixed: boolean
  /** Element ΔΔG (antiterminator↔terminator switch strength); null for partials. */
  ddg: number | null
  /** Mean intra-locus pairwise %-identity (locus-level; null if unavailable). */
  ident: number | null
  /** Number of T-box cores in the locus. */
  ncores: number | null
  /** PCoA coordinates, scaled so max(|coord|) === meta.scale (a stable canvas range). */
  x: number
  y: number
  z: number
}

/** One tree's embedding block (cloud.json `main` / `fallback`). */
export interface CloudTree {
  /** Leading PCoA variance ratios (fraction of positive eigenmass), length 6. */
  var: number[]
  points: CloudPoint[]
  /** Deduplicated undirected k-NN edges as `[i, j]` point-index pairs (i < j). */
  edges: [number, number][]
}

/** cloud.json `meta`. */
export interface CloudMeta {
  generated: string
  method: string
  scale: number
  k_nn: number
  version: number
}

/** The whole `public/data/cloud.json` document. */
export interface CloudData {
  meta: CloudMeta
  main: CloudTree
  fallback: CloudTree
}

// ── Control unions ───────────────────────────────────────────────────────────────

/** Which tree's embedding is shown (mirrors PhyloTree's main↔fallback toggle). */
export type WhichTree = 'main' | 'fallback'

/** Tip granularity (mirrors PhyloTree's locus↔element view; §4.4). */
export type Granularity = 'element' | 'locus'

/** Point color encoding axis (§4.3). */
export type ColorMode = 'specifier' | 'ddg' | 'func' | 'conf' | 'type' | 'phylum'

/** Point size encoding axis (§4.3). `divergence` = 1 − mean pairwise identity. */
export type SizeMode = 'uniform' | 'absDdg' | 'divergence'

/** A curated color+size encoding exposed as a one-click preset (§4.3). */
export interface Preset {
  key: PresetKey
  label: string
  color: ColorMode
  size: SizeMode
  /** Emphasize the non-Firmicutes minority (the Taxonomy preset; §4.3). */
  emphasizeNonFirmicutes?: boolean
  /** One-line description for the control's tooltip. */
  blurb: string
}

/** The five vetted presets (§4.3). */
export type PresetKey = 'specifier' | 'switch' | 'function' | 'qc' | 'taxonomy'

/** What a point click resolves to: open the locus detail page, or toggle a facet
 *  on the shared store (the dashboard-panel `selectable` mode). Mirrors
 *  `PhyloTree.onTipClick` but kept pure + testable (§4.4 / §6.4). */
export type PointAction =
  | { kind: 'navigate'; tandem_id: string }
  | { kind: 'facet'; specifier: string }
  | { kind: 'none' }
