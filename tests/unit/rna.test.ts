// Unit: the in-app RNA render prep (PLAN §10.2, §9 detail flow, §3.1). Pure, no DOM.
// Pins the render basis (whole-leader antiterminator structure over the gap-free
// leader), the defensive null-outs, the VARNA-or-NCBI deep-link choice, and a real-
// artifact drift guard that all 949 members yield a renderable model (the S2.3
// empirical "0 null / 0 length-mismatch / 0 unbalanced").
import { describe, expect, test } from 'vitest'
import {
  dotBracketPairs,
  isBalancedDotBracket,
  leaderRnaModel,
  terminatorHairpinPairs,
  terminatorRnaModel,
  toRna,
  varnaLink,
} from '../../src/lib/rna'
import type { Member, MembersMap } from '../../src/lib/data/types'
import { makeMember } from '../fixtures'
import membersJson from '../../public/data/members.json'

describe('toRna', () => {
  test('upper-cases and maps T→U; other IUPAC codes pass through', () => {
    expect(toRna('ACGT')).toBe('ACGU')
    expect(toRna('acgt')).toBe('ACGU')
    expect(toRna('ATGCN')).toBe('AUGCN')
  })
})

describe('isBalancedDotBracket', () => {
  test('balanced / unbalanced / close-before-open', () => {
    expect(isBalancedDotBracket('((....))')).toBe(true)
    expect(isBalancedDotBracket('...')).toBe(true)
    expect(isBalancedDotBracket('(((..)')).toBe(false)
    expect(isBalancedDotBracket(')(')).toBe(false)
  })
})

describe('leaderRnaModel', () => {
  test('builds a renderable model from whole_antiterm_structure + fasta (T→U)', () => {
    const m = makeMember({
      member_id: 'X.m1', tandem_id: 'X',
      fasta_sequence: 'ACGTACGT',
      whole_antiterm_structure: '((....))',
    })
    const model = leaderRnaModel(m)!
    expect(model).not.toBeNull()
    expect(model.sequence).toBe('ACGUACGU')
    expect(model.structure).toBe('((....))')
    expect(model.pairs).toBe(2)
    expect(model.source).toMatch(/antiterminator/i)
  })

  test('returns null when the structure is missing, length-mismatched, or unbalanced', () => {
    const base = { member_id: 'X.m1', tandem_id: 'X', fasta_sequence: 'ACGTACGT' }
    expect(leaderRnaModel(makeMember({ ...base, whole_antiterm_structure: null }))).toBeNull()
    expect(leaderRnaModel(makeMember({ ...base, whole_antiterm_structure: '((..))' }))).toBeNull() // len 6 ≠ 8
    expect(leaderRnaModel(makeMember({ ...base, whole_antiterm_structure: '(((...))' }))).toBeNull() // unbalanced
  })
})

describe('terminatorRnaModel (the gene-OFF conformation, full-length)', () => {
  test('builds a full-leader model from whole_term_structure + fasta (T→U)', () => {
    const m = makeMember({
      member_id: 'X.m1', tandem_id: 'X',
      fasta_sequence: 'ACGTACGTACGT', // 12 nt whole leader
      whole_term_structure: '((......))..', // Stem + terminator folded over the whole leader
    })
    const model = terminatorRnaModel(m)!
    expect(model).not.toBeNull()
    expect(model.sequence).toBe('ACGUACGUACGU') // the WHOLE leader, not the hairpin
    expect(model.structure).toBe('((......))..')
    expect(model.pairs).toBe(2)
    expect(model.source).toMatch(/terminator/i)
  })

  test('returns null when whole_term_structure is missing, length-mismatched, unbalanced, or pairless', () => {
    const base = { member_id: 'X.m1', tandem_id: 'X', fasta_sequence: 'ACGTACGT' }
    expect(terminatorRnaModel(makeMember({ ...base, whole_term_structure: null }))).toBeNull()
    expect(terminatorRnaModel(makeMember({ ...base, whole_term_structure: '((..))' }))).toBeNull() // len 6 ≠ 8
    expect(terminatorRnaModel(makeMember({ ...base, whole_term_structure: '(((...))' }))).toBeNull() // unbalanced
    // pairless (all dots): a terminator is a hairpin, so 0 bp ⇒ null (matches the build gate)
    expect(terminatorRnaModel(makeMember({ ...base, whole_term_structure: '........' }))).toBeNull()
  })
})

describe('dotBracketPairs', () => {
  test('extracts ordered 1-based [lo, hi] pairs (nested + sequential)', () => {
    expect(dotBracketPairs('((..))')).toEqual([[2, 5], [1, 6]]) // innermost closes first
    expect(dotBracketPairs('(())(())')).toEqual([[2, 3], [1, 4], [6, 7], [5, 8]])
    expect(dotBracketPairs('......')).toEqual([])
  })
})

describe('terminatorHairpinPairs (the pairs new to the terminator fold)', () => {
  test('returns whole_term pairs absent from whole_antiterm (drops shared Stem I/II/III)', () => {
    // 12-nt leader. Both folds share the Stem I pairs (1,4)(2,3); the antiterminator has its own
    // helix (5,10)(6,9), the terminator its own hairpin (9,12)(10,11). Only the terminator's own
    // pairs come back (the shared Stem I is excluded).
    const m = makeMember({
      member_id: 'Y.m1', tandem_id: 'Y',
      whole_antiterm_structure: '(())((..))..',
      whole_term_structure: '(())....(())',
    })
    expect(terminatorHairpinPairs(m)).toEqual([[10, 11], [9, 12]]) // only the NEW terminator pairs
  })

  test('empty when the member has no terminator', () => {
    const m = makeMember({ member_id: 'X.m1', tandem_id: 'X', whole_term_structure: null })
    expect(terminatorHairpinPairs(m)).toEqual([])
  })
})

describe('varnaLink', () => {
  test('prefers the tbdb VARNA page when a unique_name exists', () => {
    const m = makeMember({ member_id: 'X.m1', tandem_id: 'X', unique_name: 'ABCDEF' })
    expect(varnaLink(m)).toEqual({ href: 'https://tbdb.io/tboxes/ABCDEF.html', varna: true })
  })

  test('falls back to the NCBI coordinate record when unique_name is null', () => {
    const m = makeMember({ member_id: 'X.m1', tandem_id: 'X', unique_name: null })
    expect(m.tbdb_url).toBeNull()
    expect(varnaLink(m)).toEqual({ href: m.ncbi_url, varna: false })
  })
})

// ── Real-artifact drift guard (the S2.3 empirical claim over all 949 members) ─────
describe('committed members.json', () => {
  const members = Object.values(membersJson as unknown as MembersMap) as Member[]

  test('all 949 members produce a renderable leader RNA model', () => {
    expect(members).toHaveLength(949)
    const unrenderable = members.filter((m) => leaderRnaModel(m) === null)
    expect(unrenderable).toHaveLength(0)
  })

  test('922 members produce a full-length TERMINATOR model (the conformation toggle set)', () => {
    const withTerm = members.filter((m) => terminatorRnaModel(m) !== null)
    // == the non-null whole_term_structure set the build derives (949 − 14 no term_sequence
    // − 13 balanced-but-pairless = 922); the toggle enables exactly these.
    expect(withTerm).toHaveLength(922)
    for (const m of withTerm) {
      const model = terminatorRnaModel(m)!
      expect(model.sequence.length).toBe(model.structure.length) // sequence threads the structure
      expect(model.sequence.length).toBe(m.fasta_sequence.length) // FULL leader, not the hairpin
      expect(model.pairs).toBeGreaterThan(0) // every renderable terminator has a hairpin
    }
  })
})
