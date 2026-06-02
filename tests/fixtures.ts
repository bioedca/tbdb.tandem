// Shared synthetic fixtures for the Phase-1 unit + component tests (PLAN §10.2,
// §10.3). A small, hand-built dataset whose filter / matrix-folding answers are
// known by construction — distinct from the real-artifact drift guards in
// `tests/unit/specificity.test.ts`, which load the committed `public/data/*.json`.
//
// Six loci (T0001–T0006) span every facet value used in the tests:
//   T0001  TRP        Firmicutes        Transcriptional  high  aaRS           pair  [TRP, TRP]   (same)
//   T0002  ILE;LEU    Firmicutes        Transcriptional  high  biosynthesis   pair  [ILE, LEU]   (mixed — the focal cell)
//   T0003  THR        Actinobacteria    Transcriptional  low   transporter    pair  [THR, THR]   (same)
//   T0004  ?          (null phylum)     Translational    low   unknown        pair  [?,   TRP]   (unknown + null phylum)
//   T0005  TRP        Firmicutes        Transcriptional  high  biosynthesis   triple[TRP,ILE,LEU](excluded from matrix)
//   T0006  ALA;VAL    Chloroflexi       Transcriptional  high  oxidoreductase pair  [VAL, ALA]   (non-Firmicutes, mixed)

import type {
  FeatureName,
  Locus,
  Member,
  MemberCoords,
  RegulationType,
  Span,
  Summary,
} from '../src/lib/data/types'

const FEATURES: FeatureName[] = ['tbox', 's1', 's1_loop', 'codon', 'antiterm', 'term', 'discrim']

function spanMap(span: Span): Record<FeatureName, Span> {
  return Object.fromEntries(FEATURES.map((f) => [f, span])) as Record<FeatureName, Span>
}

function coords(): MemberCoords {
  return { leader: [1, 180], window: spanMap([1, 30]), genome: spanMap([1, 30]) }
}

const CODON: Record<string, string> = {
  TRP: 'UGG',
  THR: 'ACU',
  ILE: 'AUU',
  LEU: 'CUU',
  VAL: 'GUU',
  ALA: 'GCU',
}

export function makeMember(o: Partial<Member> & Pick<Member, 'member_id' | 'tandem_id'>): Member {
  const aa = o.specifier?.aa ?? null
  // Passing `unique_name: null` nulls the tbdb deep-link too (the NCBI-fallback case).
  const unique_name = 'unique_name' in o ? (o.unique_name ?? null) : `UNI${o.member_id.replace(/\W/g, '')}`
  const defaults: Member = {
    member_id: o.member_id,
    tandem_id: o.tandem_id,
    ordinal: 1,
    unique_name,
    tbdb_url: unique_name ? `https://tbdb.io/tboxes/${unique_name}.html` : null,
    ncbi_url: 'https://www.ncbi.nlm.nih.gov/nuccore/CP000000?report=genbank&from=1&to=180',
    specifier: { aa, codon: aa ? (CODON[aa] ?? null) : null },
    coords: coords(),
    fasta_sequence: 'ACGT'.repeat(45),
    aligned_sequence: '((....))',
    structure: '((....))',
    whole_antiterm_structure: '((..))',
    term_structure: '((..))',
    deltadelta_g: -12.5,
    terminator_energy: -8.0,
    type: 'Transcriptional',
    completeness: 'Full',
    trna: aa ? `${aa} (XXX)` : null,
    downstream: { protein: 'hypothetical protein', id: 'X', ec: null, desc: null, func_class: 'unknown', func_source: 'none' },
  }
  return { ...defaults, ...o }
}

export function makeLocus(overrides: Partial<Locus> & Pick<Locus, 'tandem_id'>): Locus {
  return {
    accession: 'CP000000',
    strand: '+',
    organism: 'Genus species',
    phylum: 'Firmicutes',
    tax_id: '1',
    n_cores: 2,
    n_complete_cores: 2,
    core_span: 200,
    specifier_aa: 'TRP',
    same_specifier: true,
    confidence: 'high',
    flags: null,
    type: 'Transcriptional',
    func_class: 'unknown',
    func_source: 'none',
    downstream_gene: null,
    downstream_id: null,
    member_ids: [],
    mean_pairwise_identity: 80.0,
    ...overrides,
  }
}

/** Build a locus + its ordinal-ordered members from a compact spec. */
function locusWith(
  tandem_id: string,
  specs: (string | null)[],
  locusOverrides: Partial<Locus>,
): { locus: Locus; members: Member[] } {
  const members = specs.map((aa, i) =>
    makeMember({
      member_id: `${tandem_id}.m${i + 1}`,
      tandem_id,
      ordinal: i + 1,
      specifier: { aa, codon: aa ? (CODON[aa] ?? null) : null },
      type: (locusOverrides.type as RegulationType) ?? 'Transcriptional',
    }),
  )
  const locus = makeLocus({
    tandem_id,
    n_cores: specs.length,
    member_ids: members.map((m) => m.member_id),
    ...locusOverrides,
  })
  return { locus, members }
}

const built = [
  locusWith('T0001', ['TRP', 'TRP'], {
    organism: 'Bacillus subtilis',
    specifier_aa: 'TRP',
    same_specifier: true,
    phylum: 'Firmicutes',
    confidence: 'high',
    func_class: 'aaRS',
    func_source: 'EC',
    downstream_gene: 'trpS',
  }),
  locusWith('T0002', ['ILE', 'LEU'], {
    organism: 'Clostridium acetobutylicum',
    specifier_aa: 'ILE;LEU',
    same_specifier: false,
    phylum: 'Firmicutes',
    confidence: 'high',
    func_class: 'biosynthesis',
    func_source: 'text',
    downstream_gene: 'ilvD',
  }),
  locusWith('T0003', ['THR', 'THR'], {
    organism: 'Streptomyces coelicolor',
    specifier_aa: 'THR',
    same_specifier: true,
    phylum: 'Actinobacteria',
    confidence: 'low',
    func_class: 'transporter',
    func_source: 'text',
    downstream_gene: 'thrP',
  }),
  locusWith('T0004', [null, 'TRP'], {
    organism: 'Uncultured bacterium',
    specifier_aa: '?',
    same_specifier: false,
    phylum: null,
    confidence: 'low',
    type: 'Translational',
    func_class: 'unknown',
    func_source: 'none',
    downstream_gene: null,
  }),
  locusWith('T0005', ['TRP', 'ILE', 'LEU'], {
    organism: 'Bacillus cereus',
    specifier_aa: 'TRP',
    same_specifier: false,
    phylum: 'Firmicutes',
    confidence: 'high',
    func_class: 'biosynthesis',
    func_source: 'EC',
    downstream_gene: 'trpE',
  }),
  locusWith('T0006', ['VAL', 'ALA'], {
    organism: 'Chloroflexus aurantiacus',
    specifier_aa: 'ALA;VAL',
    same_specifier: false,
    phylum: 'Chloroflexi',
    confidence: 'high',
    func_class: 'oxidoreductase',
    func_source: 'EC',
    downstream_gene: 'aldH',
  }),
]

/** The six fixture loci (T0001–T0006). */
export const LOCI: Locus[] = built.map((b) => b.locus)

/** `Map<tandem_id, Member[]>` (ordinal-ordered), mirroring the store's shape. */
export const MEMBERS_BY_LOCUS: Map<string, Member[]> = new Map(
  built.map((b) => [b.locus.tandem_id, b.members]),
)

/** Facet vocabularies matching the fixture loci (specifier frequency-desc). */
export const FACETS = {
  specifier: ['TRP', 'THR', 'ILE;LEU', 'ALA;VAL', '?'],
  phylum: ['Firmicutes', 'Actinobacteria', 'Chloroflexi'],
  type: ['Transcriptional', 'Translational'],
  confidence: ['high', 'low'],
  func_class: ['aaRS', 'biosynthesis', 'oxidoreductase', 'transporter', 'unknown'],
}

/** A minimal `summary.json`-shaped object for KPI / bar rendering. */
export const SUMMARY: Summary = {
  counts: { loci: 6, members: 13, intra_locus_pairs: 8, pairs: 5, triples: 1, non_firmicutes: 2 },
  confidence: { high: 4, low: 2 },
  specifier_agreement: { same: 2, mixed: 4 },
  distributions: {
    specifier: [
      { value: 'TRP', count: 2 },
      { value: 'THR', count: 1 },
      { value: 'ILE;LEU', count: 1 },
      { value: 'ALA;VAL', count: 1 },
      { value: '?', count: 1 },
    ],
    phylum: [
      { value: 'Firmicutes', count: 3 },
      { value: 'Actinobacteria', count: 1 },
      { value: 'Chloroflexi', count: 1 },
    ],
    type: [
      { value: 'Transcriptional', count: 5 },
      { value: 'Translational', count: 1 },
    ],
    func_class: [
      { value: 'biosynthesis', count: 2 },
      { value: 'aaRS', count: 1 },
      { value: 'oxidoreductase', count: 1 },
      { value: 'transporter', count: 1 },
      { value: 'unknown', count: 1 },
    ],
    func_source: [
      { value: 'EC', count: 3 },
      { value: 'text', count: 2 },
      { value: 'none', count: 1 },
    ],
    n_cores: [
      { value: 2, count: 5 },
      { value: 3, count: 1 },
    ],
  },
  numeric: {
    deltadelta_g: { n_filled: 13, median: -12.5 },
    pairwise_identity: { median: 80.0, mean: 80.0 },
  },
}
