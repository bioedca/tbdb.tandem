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

import type { Member, StemKey } from './data/types'
import { validSpan } from './architecture'

/** The leader features carried in `coords.window` (the `tbox` body and the Stem-I
 *  terminal loop are diagram-only glyphs, not sequence highlights). `featureSpans`
 *  below exposes these for the architecture↔sequence drift guard; the RENDERER
 *  segments by `stems` + the codon/terminator/discriminator MARKERS instead. */
export const HIGHLIGHT_FEATURES = ['s1', 'codon', 'antiterm', 'term', 'discrim'] as const
export type HighlightFeature = (typeof HIGHLIGHT_FEATURES)[number]

/** The point/marker features overlaid ON the stem fill: the specifier codon (bold)
 *  and the two 3′ regulatory rules. Stem-I and the antiterminator are NOT here — they
 *  are stems, so they belong to the FILL channel (see `stemByPosition`), shared with
 *  the in-app RNA so the sequence and the 2D structure read the SAME stem colors. */
export const MARKER_FEATURES = ['codon', 'term', 'discrim'] as const
export type MarkerFeature = (typeof MARKER_FEATURES)[number]

/** Bottom-rule channel (neutral chrome) for the 3′ regulatory features. */
export type SeqRule = 'term' | 'discrim' | null

/**
 * One maximal run of the leader with constant styling across the two channels the
 * renderer paints: the STEM fill (a `STEM_COLORS` tint, matching the in-app RNA) and
 * the codon/3′-rule markers.
 */
export interface SeqSegment {
  /** 1-based inclusive offsets into the gap-free leader. */
  start: number
  end: number
  text: string
  /** Stem this run sits in → background tint via `STEM_COLORS` (null = linker, no fill). */
  stem: StemKey | null
  /** True over the specifier codon (sits inside Stem-I) → bold + an ink ring marker. */
  codon: boolean
  /** 3′ regulatory bottom-rule (terminator wins over discriminator). */
  rule: SeqRule
}

/**
 * The present, in-range highlight spans of a member as 1-based inclusive `[lo, hi]`.
 * Each window is coerced to ascending order (via `validSpan`) and a window that runs
 * off the end of the leader is DROPPED, not clamped — matching the build's
 * `seq[lo-1:hi]` guard, which returns None when `hi > len` (e.g. T0299.m2's corrupt
 * `term = [153, 143]` over a 143 bp leader). So an out-of-range/corrupt window never
 * produces a phantom highlight; a feature with no valid window (a codon-less
 * partial's `codon`, a Stem-I-less member's `s1`) is likewise simply absent.
 */
export function featureSpans(member: Member): Partial<Record<HighlightFeature, [number, number]>> {
  const length = member.fasta_sequence.length
  const out: Partial<Record<HighlightFeature, [number, number]>> = {}
  for (const name of HIGHLIGHT_FEATURES) {
    const span = validSpan(member.coords.window[name])
    if (!span) continue
    const [lo, hi] = span // validSpan guarantees 1 <= lo <= hi; guard only the high end.
    if (lo >= 1 && hi <= length) out[name] = [lo, hi]
  }
  return out
}

/** The `coords.window` features a member carries, in canonical order — the oracle
 *  the architecture↔sequence drift guard (architecture.test.ts) checks against. The
 *  renderer's own legend is built from the stems + `presentMarkers`, not this. */
export function presentFeatures(member: Member): HighlightFeature[] {
  const spans = featureSpans(member)
  return HIGHLIGHT_FEATURES.filter((name) => name in spans)
}

/**
 * Per-position stem key over the gap-free leader (1-based: element `i` is position
 * `i + 1`, so a length-N leader yields an N-element array). Mirrors `buildStemColorMap`
 * (color.ts) — the single source the fornac overlay and the R2DT diagram both color
 * from — applying the SAME `member.stems` and last-wins overlap rule (a later stem in
 * the array wins), but keyed by `StemKey` (with linkers `null`) instead of hex, because
 * the sequence renderer needs the key for the codon tint + legend. Sharing the rule is
 * what makes the sequence and the 2D structure agree base-for-base on the stem coloring.
 */
export function stemByPosition(member: Member): (StemKey | null)[] {
  const length = member.fasta_sequence.length
  const out: (StemKey | null)[] = new Array(length).fill(null)
  for (const s of member.stems ?? []) {
    const lo = Math.max(1, s.start)
    const hi = Math.min(length, s.end)
    for (let p = lo; p <= hi; p++) out[p - 1] = s.key
  }
  return out
}

/** The codon/3′ marker spans of a member as 1-based inclusive `[lo, hi]`, dropping
 *  any window that runs off the leader 3′ end (same guard as `featureSpans`). */
export function markerSpans(member: Member): Partial<Record<MarkerFeature, [number, number]>> {
  const length = member.fasta_sequence.length
  const out: Partial<Record<MarkerFeature, [number, number]>> = {}
  for (const name of MARKER_FEATURES) {
    const span = validSpan(member.coords.window[name])
    if (!span) continue
    const [lo, hi] = span
    if (lo >= 1 && hi <= length) out[name] = [lo, hi]
  }
  return out
}

/** The codon/3′ markers a member actually carries, in canonical order (legend). */
export function presentMarkers(member: Member): MarkerFeature[] {
  const spans = markerSpans(member)
  return MARKER_FEATURES.filter((name) => name in spans)
}

/**
 * Segment a member's leader into maximal runs of constant styling across the two
 * rendered channels (PLAN §9): the STEM fill (from `stemByPosition`, matching the
 * in-app RNA) and the codon/3′-rule markers. Precedence within the rule channel:
 * `term > discrim`. Returns `[]` only for an empty sequence (never on real data —
 * gate #4 guarantees a non-empty leader).
 */
export function buildSequenceSegments(member: Member): SeqSegment[] {
  const seq = member.fasta_sequence
  const length = seq.length
  if (length === 0) return []
  const stems = stemByPosition(member)
  const markers = markerSpans(member)

  const covers = (name: MarkerFeature, pos: number): boolean => {
    const s = markers[name]
    return s !== undefined && pos >= s[0] && pos <= s[1]
  }
  const codonAt = (pos: number): boolean => covers('codon', pos)
  const ruleAt = (pos: number): SeqRule =>
    covers('term', pos) ? 'term' : covers('discrim', pos) ? 'discrim' : null

  const segments: SeqSegment[] = []
  let start = 1
  let stem = stems[0]
  let codon = codonAt(1)
  let rule = ruleAt(1)
  for (let pos = 2; pos <= length; pos++) {
    const st = stems[pos - 1]
    const c = codonAt(pos)
    const r = ruleAt(pos)
    if (st !== stem || c !== codon || r !== rule) {
      segments.push({ start, end: pos - 1, text: seq.slice(start - 1, pos - 1), stem, codon, rule })
      start = pos
      stem = st
      codon = c
      rule = r
    }
  }
  segments.push({ start, end: length, text: seq.slice(start - 1, length), stem, codon, rule })
  return segments
}

/** Human label for a highlight feature (architecture legend + tooltips). The stem
 *  labels live in `STEM_META` (color.ts) — reused for the sequence's stem key. */
export const FEATURE_LABEL: Record<HighlightFeature, string> = {
  s1: 'Stem-I',
  codon: 'specifier codon',
  antiterm: 'antiterminator',
  term: 'terminator',
  discrim: 'discriminator',
}
