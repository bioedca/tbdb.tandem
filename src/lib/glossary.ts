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
    def: 'One genomic window holding two or more T-box elements (its members), the unit this explorer is built around (470 in all).',
  },
  element: {
    term: 'Element (also member)',
    def: 'One complete T-box unit: a Stem I that senses the tRNA plus the downstream antiterminator/terminator (or RBS-sequestering) switch, within a locus. Also called a member; 949 in all (461 two-element loci + 9 three-element loci).',
  },
  specifier: {
    term: 'Specifier',
    def: 'The amino acid a T-box senses, set by the specifier codon in its Stem I. Shown as a 3-letter code; the T-box turns its gene ON when this amino acid is scarce.',
  },
  specifier_codon: {
    term: 'Specifier codon',
    def: 'The codon in the Stem I specifier loop that base-pairs with the cognate tRNA’s anticodon, setting which amino acid the T-box responds to.',
  },
  stem_i: {
    term: 'Stem I',
    def: 'The part of the T-box RNA whose specifier codon base-pairs the cognate tRNA’s anticodon, setting the amino acid sensed. Its sequence is what the similarity map compares.',
  },
  antiterminator: {
    term: 'Antiterminator',
    def: 'A structure that, when the sensed tRNA is uncharged, is stabilized by that tRNA’s free 3′ acceptor end and blocks the terminator, so transcription reads through and the gene turns on.',
  },
  terminator: {
    term: 'Terminator',
    def: 'A hairpin that, when it forms, stops transcription: the gene-OFF state of a transcriptional T-box.',
  },
  discriminator: {
    term: 'Discriminator base',
    def: 'The unpaired tRNA base just 5′ of its 3′-CCA end. The conserved T-box bulge (5′-UGGN-3′) reads it by Watson–Crick pairing, helping the riboswitch verify it has bound the correct, uncharged tRNA.',
  },
  same_mixed: {
    term: 'Same / mixed specifier',
    def: 'A locus is same-specifier when all its elements sense the same amino acid, or mixed when they sense different ones (written with a semicolon, e.g. ILE;LEU).',
  },
  confidence: {
    term: 'Confidence',
    def: 'How confident the annotation is in a locus’s T-box elements (high = at least two complete elements). Low-confidence loci are kept and flagged, never dropped.',
  },
  intra_locus_pair: {
    term: 'Intra-locus pair',
    def: 'A pair of elements within the same locus, scored by full-leader sequence identity (gap-aware global alignment). 461 two-element loci give 1 pair each and 9 three-element loci give 3 each = 488 pairs.',
  },
  func_class: {
    term: 'Function class',
    def: 'The function of the gene or operon a locus regulates, from EC numbers or downstream protein / description text: aaRS = aminoacyl-tRNA synthetase, biosynthesis = a biosynthetic enzyme (EC transferase/lyase), transporter = a membrane transporter or permease, oxidoreductase = a redox enzyme, or unknown.',
  },
  func_source: {
    term: 'Classification source',
    def: 'How the function class was assigned: an EC (Enzyme Commission) enzyme number, annotation text (*lower confidence), or no annotation.',
  },
  regulation_type: {
    term: 'Regulation type',
    def: 'How a T-box acts: transcriptional (class I) T-boxes choose between an antiterminator and a terminator hairpin to start/stop transcription; translational (class II) T-boxes expose or sequester the ribosome-binding site (SD/RBS) to allow/block translation.',
  },
  branch_support: {
    term: 'Branch support',
    def: 'How strongly the sequence data back a grouping in the map (0–1, FastTree SH-like). Low-support branches are faded to dashed grey; nothing is removed.',
  },
  similarity_map: {
    term: 'Similarity map',
    def: 'An unrooted map that groups T-box elements by how alike their Stem I sequences are. It has no time axis and no outgroup, so it is not a phylogeny: clusters mean “these sequences resemble each other,” not a lineage or order of appearance.',
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
    def: 'The 16 of 470 loci that fall outside Firmicutes, in other bacterial phyla such as Actinobacteria. (T-box riboswitches are predominantly a Firmicutes feature, so the remaining 454 loci are Firmicutes.)',
  },
  varna: {
    term: 'VARNA',
    def: 'The secondary-structure drawing tbdb.io uses, the reference structure view for each element.',
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
