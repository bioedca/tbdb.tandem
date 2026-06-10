// tbdb.tandem data contract — hand-written, stable types (PLAN §5.4).
//
// These mirror exactly what `data-pipeline/build_json.py` emits into
// `public/data/*.json` (PLAN §5.2). PLAN §5.4 deliberately omits a generated
// `types.ts` ("hand-write the small stable types") — so this file is the single
// front-end view of the artifact contract and must be kept in sync with the build
// by hand. Field names, nullability, and the categorical unions below were read
// off the committed artifacts (e.g. member `specifier.aa` is null for the 108
// codon-less partials; `phylum` is null for the 3 unassigned loci; `term_structure`
// is null for 13 members) — see PROGRESS S0.4/S0.5.

// ── Categorical unions ─────────────────────────────────────────────────────────

/** Genomic strand of a locus (sign of `locus_end - locus_start`). */
export type Strand = '+' | '-'

/** Regulatory mode (PLAN §2.2) — shown as a chip, never a toggle. */
export type RegulationType = 'Transcriptional' | 'Translational'

/** Locus confidence (PLAN §3.1: 394 high / 76 low; kept-and-flagged). */
export type Confidence = 'high' | 'low'

/** Member completeness (collapse priority 1; PLAN §5.1). */
export type Completeness = 'Full' | 'Partial'

/** Regulated downstream function class (PLAN §5.3, two-tier classifier). */
export type FuncClass =
  | 'aaRS'
  | 'biosynthesis'
  | 'oxidoreductase'
  | 'transporter'
  | 'unknown'

/** Provenance of `func_class` — EC tier, text tier, or neither (PLAN §5.3). */
export type FuncSource = 'EC' | 'text' | 'none'

/** Named feature spans projected per member (PLAN §5.2 "feature coords"). */
export type FeatureName =
  | 'tbox'
  | 's1'
  | 's1_loop'
  | 'codon'
  | 'antiterm'
  | 'term'
  | 'discrim'

/** A leader-relative or genome-projected `[start, end]`; either end may be null
 *  for a codon-less partial whose offset is missing (PLAN §5.1 / §5.2). */
export type Span = [number | null, number | null]

// ── members.json (PLAN §5.2) ───────────────────────────────────────────────────

/** Per-member specifier — from `amino_acid_top` / `refine_codon_top` only, never
 *  the corrupt raw `codon` (PLAN §3.1). Both null for codon-less partials. */
export interface MemberSpecifier {
  aa: string | null
  codon: string | null
}

/** Feature coordinates: the gap-free leader span plus per-feature window (leader-
 *  relative) and genome (projected) spans (PLAN §5.1, §5.2). */
export interface MemberCoords {
  /** `[locus_start, locus_end]` — the leader's genome span; `len(fasta_sequence)
   *  == |locus_end - locus_start| + 1` (gate #5). */
  leader: [number, number]
  /** Leader-relative offsets per feature. */
  window: Record<FeatureName, Span>
  /** Genome-projected coordinates per feature. */
  genome: Record<FeatureName, Span>
}

/** Stem-overlay key (build_json.py `derive_stems`) → a labelled structural domain
 *  of the rendered antiterminator fold (PLAN §9). Order is biological 5′→3′. */
export type StemKey = 'i' | 'ii' | 'iiab' | 'iii' | 'at'

/** One labelled stem span for the in-app RNA color overlay: 1-based, inclusive,
 *  leader-relative — the same frame as `fasta_sequence` / `whole_antiterm_structure`
 *  (PLAN §9). Absent domains are simply omitted (degenerate elements). */
export interface MemberStem {
  key: StemKey
  start: number
  end: number
}

/** Regulated-operon downstream protein + its two-tier classification (PLAN §5.3). */
export interface MemberDownstream {
  protein: string | null
  id: string | null
  ec: string | null
  desc: string | null
  func_class: FuncClass
  /** UI marks `text`-inferred classes with an asterisk (PLAN §5.3). */
  func_source: FuncSource
}

/** One canonical member element — `members.json` is keyed by `member_id`
 *  (`"{tandem_id}.m{ordinal}"`, ordinal = transcript-5′→3′; PLAN §5.2). */
export interface Member {
  member_id: string
  tandem_id: string
  /** 1-based transcript-5′ ordinal (ordinal 1 = most-5′ element). */
  ordinal: number
  /** tbdb deep-link key; present for all 949 members on the real data. */
  unique_name: string | null
  /** `https://tbdb.io/tboxes/<unique_name>.html` — null only if `unique_name` is. */
  tbdb_url: string | null
  /** NCBI coordinate fallback — always present (PLAN §9, the resilient path). */
  ncbi_url: string
  specifier: MemberSpecifier
  coords: MemberCoords
  /** Gap-free leader (DNA); non-empty by gate #4. */
  fasta_sequence: string
  /** Gapped Stem-I aligned RNA — NOT genome-indexable (PLAN §5.2). */
  aligned_sequence: string | null
  /** Stem-I structure, WUSS→dot-bracket converted; non-empty + balanced (gates #4/#7). */
  structure: string
  /** Already dot-bracket — passed through, not converted; non-null on the real
   *  data, but the build's `_s()` can emit null for a blank source cell (PLAN §3.1). */
  whole_antiterm_structure: string | null
  /** Already dot-bracket — passed through; null for 13 members (PLAN §3.1). */
  term_structure: string | null
  /** Terminator-hairpin sequence. WHEN PRESENT it pairs 1:1 with `term_structure` (equal
   *  length, round-bracket-balanced) — but it is an independent source cell, so it may be
   *  null even when `term_structure` is not (e.g. T0360.m2: a structure cell, no sequence
   *  cell). A terminator render MUST gate on `term_sequence != null`, not `term_structure`.
   *  May carry IUPAC ambiguity codes besides A/C/G/T. */
  term_sequence: string | null
  /** Full-leader TERMINATOR conformation (gene-OFF), dot-bracket — the derived analogue
   *  of `whole_antiterm_structure`: Stem I/II/III kept, the antiterminator helix replaced
   *  by the terminator hairpin (PLAN §9). Null for the members with no drawable terminator
   *  (the conformation toggle's enabled set; 922 non-null on the real data). */
  whole_term_structure: string | null
  /** Labelled stem spans (Stem I / II / IIA-B / III / antiterminator) indexing the
   *  rendered antiterminator fold, for the in-app RNA color overlay (PLAN §9). */
  stems: MemberStem[]
  deltadelta_g: number | null
  terminator_energy: number | null
  /** Regulation mode; non-null on the real data (the build's `_s()` allows null). */
  type: RegulationType | null
  completeness: Completeness | null
  /** tRNA family, e.g. `"LYS (UUU)"`. */
  trna: string | null
  downstream: MemberDownstream
}

/** `members.json` — a map from `member_id` to its member object. */
export type MembersMap = Record<string, Member>

// ── loci.json (PLAN §5.2) ──────────────────────────────────────────────────────

/** One tandem locus — the table backbone (PLAN §5.2). Denormalizes `member_ids`
 *  and `mean_pairwise_identity` so the table sorts without `members.json`. */
export interface Locus {
  tandem_id: string
  accession: string
  strand: Strand
  organism: string | null
  /** Null for the 3 unassigned-phylum loci (PLAN §3.1). */
  phylum: string | null
  tax_id: string | null
  n_cores: number
  n_complete_cores: number | null
  core_span: number | null
  /** Locus-level specifier (`?` for the 20 locus-level unknowns; PLAN §3.1). */
  specifier_aa: string | null
  same_specifier: boolean
  confidence: Confidence | null
  flags: string | null
  type: RegulationType
  func_class: FuncClass
  func_source: FuncSource
  downstream_gene: string | null
  downstream_id: string | null
  member_ids: string[]
  /** Mean intra-locus pairwise %-identity (backfilled at S0.5). */
  mean_pairwise_identity: number | null
}

/** Facet vocabularies for the filter store (PLAN §5.2, §7.3). `specifier` is
 *  frequency-descending (= the §9② bar order); the rest are sorted. Null facet
 *  values (e.g. unassigned phylum) are omitted but remain filterable as absent. */
export interface Facets {
  specifier: string[]
  phylum: string[]
  type: string[]
  confidence: string[]
  func_class: string[]
}

/** `loci.json` — the 470 loci plus the facet vocabularies. */
export interface LociFile {
  loci: Locus[]
  facets: Facets
}

// ── identity.json (PLAN §5.2) ──────────────────────────────────────────────────

/** One intra-locus pairwise %-identity entry; `a`/`b` are `member_id`s of the
 *  same locus. The file is a flat list of exactly 488 = Σ C(n_cores, 2) (gate #9). */
export interface IdentityPair {
  a: string
  b: string
  identity: number
}

/** `identity.json` — the flat 488-pair list. */
export type IdentityFile = IdentityPair[]

// ── summary.json (PLAN §5.2, §3.1) ─────────────────────────────────────────────

/** A `{value, count}` distribution row (frequency-descending). */
export interface DistItem {
  value: string
  count: number
}

/** The `n_cores` distribution row (numeric value). */
export interface NCoresItem {
  value: number
  count: number
}

/** `summary.json` — KPIs + distributions that boot the dashboard (~2 KB; PLAN §5.2). */
export interface Summary {
  counts: {
    loci: number
    members: number
    intra_locus_pairs: number
    pairs: number
    triples: number
    non_firmicutes: number
  }
  confidence: { high: number; low: number }
  specifier_agreement: { same: number; mixed: number }
  distributions: {
    specifier: DistItem[]
    phylum: DistItem[]
    type: DistItem[]
    func_class: DistItem[]
    func_source: DistItem[]
    n_cores: NCoresItem[]
  }
  numeric: {
    deltadelta_g: { n_filled: number; median: number | null }
    pairwise_identity: { median: number | null; mean: number | null }
  }
}

// ── tree artifacts (PLAN §5.2, §6) ─────────────────────────────────────────────

/** Which tree a tip lives in (`absent` = flagged out of both; PLAN §5.2). */
export type TreeName = 'main' | 'fallback' | 'absent'

/** Per-tip metadata, keyed in `tree_tips.json` by `unique_name`. */
export interface TreeTip {
  member_id: string
  tandem_id: string
  ordinal: number
  /** Member specifier (null for codon-less partials). */
  specifier: string | null
  /** Per-locus phylum (null for the unassigned loci). */
  phylum: string | null
  tree: TreeName
}

/** `tree_tips.json` — `unique_name` → tip metadata (949 entries). */
export type TreeTipsMap = Record<string, TreeTip>

/** `tree_locus_map.json` — `tandem_id` → its tip `unique_name`s (470 entries). */
export type TreeLocusMap = Record<string, string[]>

// ── R2DT diagrams (PLAN §9; data-pipeline/build_r2dt.py) ───────────────────────
//
// Per-member RNA secondary-structure diagrams drawn on the canonical RF00230 /
// T-box template by R2DT (offline, like the tree), committed under
// `public/data/r2dt/`. The app fetches one `<member_id>.json` on demand and
// colours each nucleotide CLIENT-SIDE from `color.ts` `STEM_COLORS` (the same
// palette the fornac overlay uses), keyed by `stems[]` — so colours live in one
// place and match across both viewers. Coordinates carry no units; the renderer
// fits them to its box. `residueIndex` is 1-based over the nucleotides, the SAME
// frame as `stems[]`, so `x[i-1]`/`y[i-1]` is the centre of nucleotide `i`.

/** One member's compact R2DT diagram (`public/data/r2dt/<member_id>.json`). */
export interface R2dtDiagram {
  /** RNA sequence (T→U), equals the member's `fasta_sequence` (asserted at build). */
  seq: string
  /** Per-nucleotide centre coordinates (length == `seq.length`). */
  x: number[]
  y: number[]
  /** Canonical base pairs as ordered 1-based `[lo, hi]` index pairs. */
  pairs: [number, number][]
  /** Matched template id (e.g. `"T-box"`) and library (`"Rfam"`); may be null. */
  template: string | null
  source: string | null
}

/** `public/data/r2dt/manifest.json` — which members have a committed diagram. */
export interface R2dtManifest {
  count: number
  diagrams: Record<string, { template: string | null; source: string | null }>
}

// ── locus genomic context (NCBI; data-pipeline/fetch_genomic_context.py) ───────
// One per-locus file `public/data/locus_context/<tandem_id>.json`, lazy-loaded on the
// detail route to draw the downstream gene + intergenic to scale and a continuous
// full-locus sequence track. `seq` is the interval's genomic sequence in
// transcription-5′→3′ orientation (reverse-complemented on the minus strand), so
// `seq.slice(offset, offset + length)` round-trips each member's `fasta_sequence` and
// each gene's CDS slice — offsets are 0-based into `seq`. Absent / fetch-failed (or
// `resolved: false`) → the figure degrades to the schematic ORF.

/** A genomic `[start, end]`, 1-based inclusive, ascending. */
export type GenomeInterval = [number, number]

/** One element's placement within `LocusContext.seq` (0-based, transcription-5′→3′). */
export interface ElementOffset {
  member_id: string
  offset: number
  length: number
}

/** A downstream regulated gene on the same molecule, to-scale (chrome-coloured). */
export interface DownstreamGeneContext {
  /** Display label (gene symbol / locus tag / protein id); chrome, never a specifier hue. */
  name: string | null
  protein_id: string | null
  locus_tag: string | null
  /** 0-based offset + length within `LocusContext.seq`. */
  offset: number
  length: number
  /** CDS strand ('+'/'-'); co-orientation is `strand === locus strand`. */
  strand: Strand
  /** How the coords were resolved (e.g. `"coded_by"`). */
  resolution: string
}

/** Per-locus NCBI genomic context (`public/data/locus_context/<tandem_id>.json`). */
export interface LocusContext {
  tandem_id: string
  accession: string
  strand: Strand
  /** True iff ≥1 downstream gene resolved (else the figure draws the schematic ORF). */
  resolved: boolean
  /** Absolute genomic interval `[lo, hi]` spanning the elements → the downstream gene. */
  interval: GenomeInterval
  /** The interval sequence, transcription-5′→3′; `length === interval[1] - interval[0] + 1`. */
  seq: string
  elements: ElementOffset[]
  downstream_genes: DownstreamGeneContext[]
  warnings: string[]
}

/** `public/data/locus_context/manifest.json` — which loci have a committed context file. */
export interface LocusContextManifest {
  meta: {
    generated: string
    version: number
    source: string
    count: number
    resolved_loci: number
    fetched_genes: number
  }
  loci: Record<string, true>
}

// ── filter / cross-filter state (PLAN §7.3) ────────────────────────────────────

/** The five multi-select facets backed by `loci.json` `facets` (PLAN §7.3). */
export type FacetKey = 'specifier' | 'phylum' | 'type' | 'confidence' | 'func_class'

/** The full cross-filter state: a selected-value set per facet + free-text search.
 *  An empty set means "no constraint" for that facet (PLAN §7.3). */
export interface FilterState {
  specifier: Set<string>
  phylum: Set<string>
  type: Set<string>
  confidence: Set<string>
  func_class: Set<string>
  search: string
}

/** Locus field a facet filters on. Each `FacetKey` reads one `Locus` field. */
export const FACET_FIELD: Record<FacetKey, keyof Locus> = {
  specifier: 'specifier_aa',
  phylum: 'phylum',
  type: 'type',
  confidence: 'confidence',
  func_class: 'func_class',
}

/** Locus string fields free-text search scans (case-insensitive substring). */
export const SEARCH_FIELDS: (keyof Locus)[] = [
  'tandem_id',
  'accession',
  'organism',
  'phylum',
  'specifier_aa',
  'downstream_gene',
  'func_class',
  'type',
]
