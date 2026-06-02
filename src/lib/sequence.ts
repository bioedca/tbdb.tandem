// Feature-highlighted member sequences (PLAN §9 detail flow) — the pure geometry
// behind the leader-sequence highlighter. Framework-agnostic so it is unit-tested
// at S2.7; `MemberSequence.svelte` renders the segments as styled mono spans.
//
// COORDINATE CONTRACT (load-bearing — verified against the build).
// A member's `coords.window[feature]` offsets are 1-based positions into the
// gap-free leader `fasta_sequence` (NOT the gapped `aligned_sequence`). The build
// itself slices the leader this way — `_antiterm_core` does `seq[lo-1:hi]` over
// `coords.window.antiterm`, and gate #6's codon back-check translates
// `fasta[codon_start-1:codon_end]` straight to `amino_acid_top` (765/841 members
// match, the rest being the known-corrupt codon regions). So slicing
// `fasta_sequence.slice(lo-1, hi)` over a `validSpan` window yields the feature's
// nucleotides in the same biological-5′→3′ orientation as the sequence. The gapped
// Stem-I `aligned_sequence`/`structure` are NOT genome-indexable and feed the
// in-app RNA at S2.3 — they are deliberately not used here.

import type { Member } from './data/types'
import { validSpan } from './architecture'

/** The leader features highlighted in the sequence view (the `tbox` body and the
 *  Stem-I terminal loop are diagram-only glyphs, not sequence highlights). */
export const HIGHLIGHT_FEATURES = ['s1', 'codon', 'antiterm', 'term', 'discrim'] as const
export type HighlightFeature = (typeof HIGHLIGHT_FEATURES)[number]

/** Background-tint channel (the element's own specifier hue — data colour). The
 *  specifier codon sits inside Stem-I, so both share this channel and `codon` wins. */
export type SeqFill = 'codon' | 's1' | null
/** Bottom-rule channel (neutral chrome) for the 3′ regulatory features. */
export type SeqRule = 'term' | 'discrim' | null
/** Dashed-underline channel (neutral chrome). Split from `term` so the
 *  antiterminator and terminator — alternative structures that share sequence —
 *  can both show where they overlap. */
export type SeqUnderline = 'antiterm' | null

/** One maximal run of the leader with a constant (fill, rule, underline) styling. */
export interface SeqSegment {
  /** 1-based inclusive offsets into the gap-free leader. */
  start: number
  end: number
  text: string
  fill: SeqFill
  rule: SeqRule
  underline: SeqUnderline
}

/**
 * The present, in-range highlight spans of a member as 1-based inclusive `[lo, hi]`.
 * Each window is coerced to ascending order and clamped to the leader so an
 * off-the-end offset never produces a phantom highlight; a feature with no valid
 * window (e.g. a codon-less partial's `codon`, or a Stem-I-less member's `s1`) is
 * simply absent.
 */
export function featureSpans(member: Member): Partial<Record<HighlightFeature, [number, number]>> {
  const length = member.fasta_sequence.length
  const out: Partial<Record<HighlightFeature, [number, number]>> = {}
  for (const name of HIGHLIGHT_FEATURES) {
    const span = validSpan(member.coords.window[name])
    if (!span) continue
    const lo = Math.max(1, span[0])
    const hi = Math.min(length, span[1])
    if (lo <= hi) out[name] = [lo, hi]
  }
  return out
}

/** The highlight features a member actually carries, in canonical order (legend). */
export function presentFeatures(member: Member): HighlightFeature[] {
  const spans = featureSpans(member)
  return HIGHLIGHT_FEATURES.filter((name) => name in spans)
}

/**
 * Segment a member's leader into maximal runs of constant styling across the three
 * visual channels (PLAN §9). Precedence within a channel: `codon > s1` (fill),
 * `term > discrim` (rule). Returns `[]` only for an empty sequence (never on real
 * data — gate #4 guarantees a non-empty leader).
 */
export function buildSequenceSegments(member: Member): SeqSegment[] {
  const seq = member.fasta_sequence
  const length = seq.length
  if (length === 0) return []
  const spans = featureSpans(member)

  const covers = (name: HighlightFeature, pos: number): boolean => {
    const s = spans[name]
    return s !== undefined && pos >= s[0] && pos <= s[1]
  }
  const fillAt = (pos: number): SeqFill =>
    covers('codon', pos) ? 'codon' : covers('s1', pos) ? 's1' : null
  const ruleAt = (pos: number): SeqRule =>
    covers('term', pos) ? 'term' : covers('discrim', pos) ? 'discrim' : null
  const underlineAt = (pos: number): SeqUnderline => (covers('antiterm', pos) ? 'antiterm' : null)

  const segments: SeqSegment[] = []
  let start = 1
  let fill = fillAt(1)
  let rule = ruleAt(1)
  let underline = underlineAt(1)
  for (let pos = 2; pos <= length; pos++) {
    const f = fillAt(pos)
    const r = ruleAt(pos)
    const u = underlineAt(pos)
    if (f !== fill || r !== rule || u !== underline) {
      segments.push({ start, end: pos - 1, text: seq.slice(start - 1, pos - 1), fill, rule, underline })
      start = pos
      fill = f
      rule = r
      underline = u
    }
  }
  segments.push({ start, end: length, text: seq.slice(start - 1, length), fill, rule, underline })
  return segments
}

/** Human label for a highlight feature (legend + tooltips). */
export const FEATURE_LABEL: Record<HighlightFeature, string> = {
  s1: 'Stem-I',
  codon: 'specifier codon',
  antiterm: 'antiterminator',
  term: 'terminator',
  discrim: 'discriminator',
}
