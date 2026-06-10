// Pure adapters from the tandem-architecture model (`architecture.ts`) and a member
// (`data/types.ts`) to the data shapes the vendored hatchlings LinearMap and the published
// SequenceViewer consume. Framework-agnostic and unit-tested — no DOM, no Svelte.
//
// TWO COORDINATE CONVENTIONS, on purpose:
//   • LinearMap is a genomic feature track: `bpToX(bp) = MARGIN + (bp/size)*(width-2·MARGIN)` over
//     a bio-axis domain [0, size]. We pass each element body's bio-axis bp through unchanged.
//   • SequenceViewer is a character grid: parts are 0-based, half-open `[start, end)` indices into
//     `seq` (rows slice `seq.slice(i, i+charsPerRow)`; the ruler displays `pos+1`). A 1-based,
//     inclusive leader window `[lo, hi]` therefore maps to `{ start: lo-1, end: hi }`.

import type { ArchitectureModel } from './architecture'
import type { FuncClass, Member } from './data/types'
import type { Part, SequenceData, Translation } from './vendor/hatchlings'
import { LINEAR_MARGIN_LEFT, LINEAR_MARGIN_RIGHT } from './vendor/hatchlings/util/layout'
import { STEM_COLORS, TERMINATOR_COLOR, FUNC_CLASS_SHADE, aaColor } from './color'
import { featureSpans, FEATURE_LABEL, HIGHLIGHT_FEATURES, type HighlightFeature } from './sequence'

/** Stable id for the synthetic downstream-ORF part (so the overlay can find it). */
export const DOWNSTREAM_ORF_ID = 'downstream-orf'

/** The downstream ORF is schematic (NOT to scale): a constant fraction of the leader axis placed
 *  3′ of the whole leader, past a `//` break the overlay draws. Fractions keep it a roughly
 *  constant share of the figure width at any span; the minimums protect tiny spans. */
const ORF_GAP_FRAC = 0.04
const ORF_SPAN_FRAC = 0.18
const ORF_GAP_MIN = 8
const ORF_SPAN_MIN = 40
const AXIS_PAD_FRAC = 0.02
const AXIS_PAD_MIN = 4

/** Pure mirror of the vendored LinearMap's internal `bpToX` (same margins, same divide-by-zero
 *  guard). The glyph overlay projects with THIS so it stays pixel-aligned to the strip. */
export function linearMapBpToX(bp: number, size: number, width: number): number {
  if (size <= 0) return LINEAR_MARGIN_LEFT
  const backboneWidth = width - LINEAR_MARGIN_LEFT - LINEAR_MARGIN_RIGHT
  return LINEAR_MARGIN_LEFT + (bp / size) * backboneWidth
}

/**
 * Architecture model → LinearMap props: one feature arrow per T-box element body (tinted by its
 * own specifier), plus a trailing schematic downstream-gene arrow. All on a single forward lane
 * (the strip is rendered with `noStack`), bio-axis bp passed through unchanged.
 */
export function toLinearMapProps(
  model: ArchitectureModel,
  funcClass: FuncClass,
  downstreamGene: string | null,
): { size: number; parts: Part[] } {
  const span = Math.max(model.span, 1)

  const parts: Part[] = model.elements.map((el) => ({
    id: el.member.member_id,
    name: el.aa ?? 'T-box',
    type: 'tbox',
    start: el.bodyStart,
    end: el.bodyEnd,
    strand: 1,
    color: aaColor(el.aa), // the specifier hue IS the data-colour oracle (chrome⟂data)
    label: el.aa ?? undefined,
  }))

  // Downstream ORF: 3′ of the whole leader (anchor at the leader 3′ end = `span`, always ≥ any body end).
  const orfStart = span + Math.max(ORF_GAP_MIN, Math.round(span * ORF_GAP_FRAC))
  const orfEnd = orfStart + Math.max(ORF_SPAN_MIN, Math.round(span * ORF_SPAN_FRAC))
  parts.push({
    id: DOWNSTREAM_ORF_ID,
    name: downstreamGene ?? funcClass,
    type: 'gene',
    start: orfStart,
    end: orfEnd,
    strand: 1,
    color: FUNC_CLASS_SHADE[funcClass], // chrome, never a specifier hue
    label: downstreamGene ?? funcClass,
  })

  const size = orfEnd + Math.max(AXIS_PAD_MIN, Math.round(span * AXIS_PAD_FRAC))
  return { size, parts }
}

/** Palette for the per-feature annotation arrows in the sequence view (codon handled separately). */
const FEATURE_SEQ_COLOR: Record<Exclude<HighlightFeature, 'codon'>, string> = {
  s1: STEM_COLORS.i, // Stem I
  antiterm: STEM_COLORS.at, // antiterminator helix
  term: TERMINATOR_COLOR, // terminator hairpin
  discrim: STEM_COLORS.at, // discriminator sits in the antiterminator region
}

/** Three-letter → one-letter amino-acid code, for the specifier-codon translation track. */
const AA_THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H',
  ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S', THR: 'T', TRP: 'W',
  TYR: 'Y', VAL: 'V',
}

/**
 * Member → SequenceViewer data: the gap-free leader (shown as RNA) with one annotation arrow per
 * present feature window, and — when the specifier amino acid is a known single residue — a
 * one-codon translation over the specifier codon. Offsets are converted 1-based→0-based here.
 */
export function toSequenceData(member: Member): SequenceData {
  const spans = featureSpans(member) // Partial<Record<HighlightFeature, [lo, hi]>>, 1-based inclusive
  const parts: Part[] = []
  for (const name of HIGHLIGHT_FEATURES) {
    const span = spans[name]
    if (!span) continue
    const [lo, hi] = span
    parts.push({
      id: `${member.member_id}:${name}`,
      name: FEATURE_LABEL[name],
      type: name,
      start: lo - 1, // 1-based inclusive → 0-based inclusive
      end: hi, // 0-based exclusive (== 1-based inclusive hi)
      strand: 1,
      color: name === 'codon' ? aaColor(member.specifier.aa) : FEATURE_SEQ_COLOR[name],
      label: FEATURE_LABEL[name],
    })
  }

  const translations: Translation[] = []
  const codon = spans.codon
  const one = member.specifier.aa ? AA_THREE_TO_ONE[member.specifier.aa.trim().toUpperCase()] : undefined
  if (codon && one) {
    translations.push({ start: codon[0] - 1, end: codon[1], strand: 1, aminoAcids: one })
  }

  return {
    seq: member.fasta_sequence,
    parts,
    cutSites: [],
    translations,
    alphabet: 'rna',
    topology: 'linear',
  }
}
