// Canonical plain-language definitions for the load-bearing vocabulary (PLAN §8.1
// voice, §14 glossary). ONE source of truth so every surface — KPI tiles, chart
// captions, the tree controls, the detail page, and the About glossary — defines a
// term the same way. Definitions are present-tense and structural: they state what
// a thing IS or DOES, never an evolutionary direction (§6/§13 no-polarity).
//
// Science is grounded in the T-box mechanism: a T-box riboswitch in a bacterial
// mRNA leader binds one specific tRNA and reads its aminoacylation (charging)
// state, turning the downstream gene ON when the amino acid is scarce (the tRNA is
// uncharged). The specifier amino acid is read from `amino_acid_top`/
// `refine_codon_top` (the raw `codon` column is corrupt; §3.1) — never surfaced as
// a raw codon. Keep these one-liners short enough to live in a tooltip.

/** A defined term: the headword plus a one-line, tooltip-sized definition. */
export interface GlossaryEntry {
  term: string
  def: string
}

export const GLOSSARY = {
  tbox: {
    term: 'T-box riboswitch',
    def: 'A regulatory RNA in the 5′ leader of a bacterial mRNA. It binds one specific tRNA and senses whether that tRNA is charged with its amino acid, switching the downstream gene ON when the amino acid is scarce (the tRNA is uncharged).',
  },
  tandem: {
    term: 'Tandem locus',
    def: 'A locus that stacks two or more complete T-box units in the same mRNA leader, regulating the same downstream gene or operon.',
  },
  locus: {
    term: 'Locus',
    def: 'One genomic window holding two or more T-box elements — the unit this explorer is built around (470 in all).',
  },
  element: {
    term: 'Element (core, member)',
    def: 'One complete T-box unit — Stem I plus its switch — within a locus. Also called a core or member; 949 in all (461 two-element loci + 9 three-element loci).',
  },
  specifier: {
    term: 'Specifier',
    def: 'The amino acid a T-box senses, set by the specifier codon in its Stem I. Shown as a 3-letter code; the T-box turns its gene ON when this amino acid is scarce.',
  },
  specifier_codon: {
    term: 'Specifier codon',
    def: 'A codon displayed in Stem I that base-pairs with the cognate tRNA’s anticodon, setting which amino acid the T-box responds to.',
  },
  stem_i: {
    term: 'Stem I',
    def: 'The part of the T-box RNA that displays the specifier codon and contacts the sensed tRNA. Its sequence is what the similarity map compares.',
  },
  antiterminator: {
    term: 'Antiterminator',
    def: 'A structure that, when the sensed tRNA is uncharged, is stabilized by that tRNA’s free 3′ end and blocks the terminator — so transcription reads through and the gene turns on.',
  },
  terminator: {
    term: 'Terminator',
    def: 'A hairpin that, when it forms, stops transcription — the gene-OFF state of a transcriptional T-box.',
  },
  discriminator: {
    term: 'Discriminator',
    def: 'A short conserved element in the antiterminator region, at the 3′ end of the T-box switch.',
  },
  same_mixed: {
    term: 'Same / mixed specifier',
    def: 'A locus is same-specifier when all its elements sense the same amino acid, or mixed when they sense different ones (written with a semicolon, e.g. ILE;LEU).',
  },
  confidence: {
    term: 'Confidence',
    def: 'Annotation confidence for a locus’s T-box calls (high = at least two complete elements). Low-confidence loci are kept and flagged, never dropped.',
  },
  intra_locus_pair: {
    term: 'Intra-locus pair',
    def: 'A pair of elements within the same locus, scored by full-leader sequence identity (gap-aware global alignment). 461 two-element loci give 1 pair each and 9 three-element loci give 3 each = 488 pairs.',
  },
  func_class: {
    term: 'Function class',
    def: 'The function of the gene a locus regulates, from its EC number or text annotation: aaRS = aminoacyl-tRNA synthetase, biosynthesis = a biosynthetic enzyme (EC transferase/lyase), transporter = a membrane transporter or permease, oxidoreductase = a redox enzyme, or unknown.',
  },
  func_source: {
    term: 'Classification source',
    def: 'How the function class was assigned: an EC (Enzyme Commission) enzyme number, the gene’s text annotation (*lower confidence), or no annotation.',
  },
  regulation_type: {
    term: 'Regulation type',
    def: 'How a T-box acts: transcriptional T-boxes switch a terminator hairpin; translational T-boxes sequester the ribosome-binding site (SD/RBS).',
  },
  branch_support: {
    term: 'Branch support',
    def: 'How strongly the sequence data back a grouping in the map (0–1, FastTree SH-like). Low-support branches are faded to dashed grey; nothing is removed.',
  },
  similarity_map: {
    term: 'Similarity map',
    def: 'An unrooted map that groups T-box elements by how alike their Stem-I sequences are. It has no time axis and no outgroup, so it is not a phylogeny — clusters mean “these sequences resemble each other,” not a lineage or order of appearance.',
  },
  ddg: {
    term: 'ΔΔG',
    def: 'A predicted free-energy difference (kcal/mol) between the riboswitch’s two alternative folds (antiterminator vs terminator). The in-cell bar shows its magnitude.',
  },
  terminator_energy: {
    term: 'Terminator energy',
    def: 'Predicted free energy of the terminator hairpin (kcal/mol). More negative = a more stable hairpin.',
  },
  mean_identity: {
    term: 'Mean % identity',
    def: 'Mean sequence identity between the full leaders of the elements in a locus (gap-aware global alignment). Collapse-recovered loci share one leader window, so their identity saturates at 100%.',
  },
  non_firmicutes: {
    term: 'Non-Firmicutes',
    def: 'T-box riboswitches are predominantly found in Firmicutes; 454 of 470 loci are Firmicutes and 16 are from other bacterial phyla.',
  },
  varna: {
    term: 'VARNA',
    def: 'The secondary-structure drawing tbdb.io uses — the reference structure view for each element.',
  },
} as const satisfies Record<string, GlossaryEntry>

export type GlossaryKey = keyof typeof GLOSSARY

/** The one-line definition for a term (for tooltips / `title` attributes). */
export function def(key: GlossaryKey): string {
  return GLOSSARY[key].def
}

/** The headword for a term. */
export function term(key: GlossaryKey): string {
  return GLOSSARY[key].term
}
