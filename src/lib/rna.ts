// RNA secondary-structure prep for the in-app fornac render (PLAN §9 detail flow,
// §7.1, §3.1). Pure + framework-agnostic so it unit-tests without a DOM (the
// component test lands at S2.7, §10.3). The single non-obvious decision lives here:
// WHICH of the three structure columns feeds fornac.
//
// ── Render basis (PROGRESS S2.3, empirical over all 949 members) ───────────────
// The build emits three dot-bracket structures per member (PLAN §3.1):
//   • `structure`            — Stem-I, WUSS→dot-bracket, paired with the GAPPED
//                              `aligned_sequence`;
//   • `whole_antiterm_structure` — the whole-leader antiterminator conformation;
//   • `term_structure`       — the terminator hairpin.
// The Stem-I pair is unusable for fornac: the Master alignment column
// (`aligned_sequence`) carries non-nucleotide annotation — spaces, `[` `]`, digits,
// `*`, lower-case insert states — that fornac would draw as bogus nodes, and
// gap-stripping a column that may bracket over a gap is fragile. `term_structure`
// is null for 13 members and its length does NOT match its window, so it can't be
// paired with a sub-sequence. Only `whole_antiterm_structure` + `fasta_sequence`
// (the gap-free leader) is clean for ALL 949: 0 null, 0 length-mismatch, 0
// unbalanced, sequence alphabet {A,C,G,N,T}. It is also the same leader fold
// tbdb.io's VARNA shows, so the in-app render mirrors the guaranteed deep-link.
// This is a best-effort render choice, not a locked PLAN decision (PLAN §9 only
// mandates "in-app fornac RNA (best-effort)" + the guaranteed VARNA deep-link).

import type { Member } from './data/types'

/** DNA → RNA for display: upper-case + T→U. IUPAC `N` (and any other code) passes
 *  through unchanged so the base count stays aligned with the structure length. */
export function toRna(seq: string): string {
  return seq.toUpperCase().replace(/T/g, 'U')
}

/** Dot-bracket balance check — fornac mis-pairs (or throws) on an unbalanced
 *  string. Mirrors the build's gate #7 `is_balanced` (round-bracket only; the
 *  build already converted/validated all three structures, PLAN §3.1/§5.4). */
export function isBalancedDotBracket(s: string): boolean {
  let depth = 0
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth < 0) return false
    }
  }
  return depth === 0
}

/** A renderable RNA: a clean sequence + an equal-length dot-bracket structure. */
export interface RnaModel {
  /** RNA sequence (T→U), same length as `structure`. */
  sequence: string
  /** Dot-bracket secondary structure. */
  structure: string
  /** Human label for which conformation this is (caption). */
  source: string
  /** Number of base pairs (0 = unstructured single strand). */
  pairs: number
}

/** Build the in-app render model for a member — the whole-leader antiterminator
 *  conformation over the gap-free leader. Returns null when the structure is
 *  missing, length-mismatched, or unbalanced (→ the component shows the VARNA
 *  deep-link only). Defensive even though all 949 members pass on the real data. */
export function leaderRnaModel(member: Member): RnaModel | null {
  const dot = member.whole_antiterm_structure
  const seq = member.fasta_sequence
  if (!dot || !seq) return null
  if (dot.length !== seq.length) return null
  if (!isBalancedDotBracket(dot)) return null
  let pairs = 0
  for (const ch of dot) if (ch === '(') pairs++
  return {
    sequence: toRna(seq),
    structure: dot,
    source: 'Antiterminator conformation · whole leader',
    pairs,
  }
}

/** The guaranteed structure deep-link (PLAN §9): tbdb.io renders each element's
 *  secondary structure with VARNA on its `tboxes/<unique_name>.html` page. Falls
 *  back to the NCBI coordinate record when the member has no `unique_name`/
 *  `tbdb_url` (the resilient path — `ncbi_url` is always present). */
export function varnaLink(member: Member): { href: string; varna: boolean } {
  if (member.tbdb_url) return { href: member.tbdb_url, varna: true }
  return { href: member.ncbi_url, varna: false }
}
