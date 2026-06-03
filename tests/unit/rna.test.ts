// Unit: the in-app RNA render prep (PLAN §10.2, §9 detail flow, §3.1). Pure, no DOM.
// Pins the render basis (whole-leader antiterminator structure over the gap-free
// leader), the defensive null-outs, the VARNA-or-NCBI deep-link choice, and a real-
// artifact drift guard that all 949 members yield a renderable model (the S2.3
// empirical "0 null / 0 length-mismatch / 0 unbalanced").
import { describe, expect, test } from 'vitest'
import { isBalancedDotBracket, leaderRnaModel, toRna, varnaLink } from '../../src/lib/rna'
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
})
