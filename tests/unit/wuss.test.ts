// Unit: the WUSS → dot-bracket converter + balance check, asserted to PARITY with
// the Python build (PLAN §10.2, §3.1, §5.4 #7).
//
// `src/lib/wuss.ts` is the frontend mirror of `data-pipeline/wuss.py`; the build
// converts the Stem-I `Structure` column once with the Python and bakes the result
// into `members.json`, so the two implementations must agree byte-for-byte. The
// GOLDEN TABLE below is the contract shared (by copy) with
// `data-pipeline/tests/test_wuss.py`: identical inputs and expected outputs. pytest
// pins wuss.py to these; this suite pins wuss.ts to the SAME expectations →
// transitively the two converters agree on every golden structure. (A live Python
// subprocess can't be used: the CI `web` job is Node-only.) Keep the two golden
// tables in sync if either changes.
import { describe, expect, test } from 'vitest'
import { isBalanced, wussToDotbracket } from '../../src/lib/wuss'

// The six WUSS unpaired marks that actually appear in the Stem-I column
// (test_wuss.py WUSS_MARKS).
const WUSS_MARKS = ['-', '.', '_', ',', ':', '~']

// Real Stem-I structures pulled verbatim from Master_tboxes.csv — the exact pairs
// test_wuss.py asserts wuss.py against (REAL_STEMI). (input WUSS, expected
// dot-bracket); each is a properly nested Stem-I, so the converted string balances.
const REAL_STEMI: [string, string][] = [
  [
    '<<------<<<<-------<<<<<<-------<<<--------<<<<<<___________.>>>>>>>>>----->>>>>>-------->>>>--->>',
    '((......((((.......((((((.......(((........((((((............))))))))).....))))))........))))...))',
  ],
  ['<<<-------<<<<<______>>>>>>>>', '(((.......(((((......))))))))'],
  [
    ',,,,,,<<<<<<<___.............._____>>>>>>>.,,,.,<<<<-------<<<<<_____._>>>>>>>>>',
    '......(((((((......................)))))))......((((.......(((((.......)))))))))',
  ],
]

describe('wussToDotbracket (parity with wuss.py)', () => {
  test('empty / simple / nested pairs', () => {
    expect(wussToDotbracket('')).toBe('')
    expect(wussToDotbracket('<>')).toBe('()')
    expect(wussToDotbracket('<<<>>>')).toBe('((()))')
  })

  test.each(WUSS_MARKS)('the unpaired mark %s collapses to a dot', (mark) => {
    expect(wussToDotbracket(mark)).toBe('.')
    expect(wussToDotbracket(`<${mark}>`)).toBe('(.)')
  })

  test('all marks together → all dots inside the pair', () => {
    expect(wussToDotbracket('<<-_,:~.>>')).toBe('((......))')
  })

  test('length is preserved 1:1', () => {
    const s = '<<--<<__>>-->>'
    expect(wussToDotbracket(s)).toHaveLength(s.length)
  })

  test('output alphabet is dot-bracket only', () => {
    const out = wussToDotbracket('<<-_,:~.>>')
    expect(new Set(out)).toEqual(new Set(['(', ')', '.']))
  })

  test('the full bracket-family superset collapses to () / .', () => {
    // Canonical WUSS→shorthand (not in the real Stem-I column, but the rule is general).
    expect(wussToDotbracket('([{<...>}])')).toBe('((((...))))')
  })

  test.each(REAL_STEMI)('real Stem-I structure converts exactly', (wuss, expected) => {
    expect(wussToDotbracket(wuss)).toBe(expected)
  })

  test.each(REAL_STEMI)('real Stem-I conversion preserves length + bracket counts', (wuss, expected) => {
    const out = wussToDotbracket(wuss)
    expect(out).toHaveLength(wuss.length)
    expect([...out].filter((c) => c === '(').length).toBe([...wuss].filter((c) => c === '<').length)
    expect([...out].filter((c) => c === ')').length).toBe([...wuss].filter((c) => c === '>').length)
    expect(out).toBe(expected)
  })

  test('non-ASCII characters collapse to dots without desyncing length (S0.2 note)', () => {
    // A code-point iterator must treat an astral char as one unpaired mark, keeping
    // length aligned with the structure — the surrogate-safety guard the S0.2
    // carry-forward called for.
    expect(wussToDotbracket('<🧬>')).toBe('(.)')
    expect([...wussToDotbracket('<🧬>')]).toHaveLength(3)
  })
})

describe('isBalanced (parity with wuss.py)', () => {
  test.each(['', '()', '(())', '(.)', '....', '(((...)))', '()()()'])(
    'balanced: %s',
    (s) => expect(isBalanced(s)).toBe(true),
  )

  test.each(['(', ')', '(()', '())', '((.)', '(.))'])('unbalanced: %s', (s) =>
    expect(isBalanced(s)).toBe(false),
  )

  test('a close before an open is rejected even when the tally is zero', () => {
    expect(isBalanced(')(')).toBe(false)
  })

  test('every real converted Stem-I structure is balanced', () => {
    for (const [wuss] of REAL_STEMI) expect(isBalanced(wussToDotbracket(wuss))).toBe(true)
  })
})

describe('gate #7 fallback contract (PLAN §5.4 #7)', () => {
  test('malformed WUSS converts to unbalanced → flagged for the VARNA-only fallback', () => {
    const out = wussToDotbracket('<<<__>') // 3 opens, 1 close
    expect(out).toBe('(((..)')
    expect(isBalanced(out)).toBe(false)
  })

  test('pass-through dot-bracket columns validate directly (never converted)', () => {
    // whole_antiterm_structure / term_structure are already dot-bracket.
    expect(isBalanced('...(((...)))...')).toBe(true)
    expect(isBalanced('...(((...))...')).toBe(false)
  })

  test('isBalanced treats raw `<`/`>` as unpaired — callers MUST convert first', () => {
    // The S0.2 MAJOR-finding contract: validating raw WUSS would wrongly read balanced.
    expect(isBalanced('<<<__>')).toBe(true) // raw WUSS: `<`/`>` are unpaired → "balanced"
    expect(isBalanced(wussToDotbracket('<<<__>'))).toBe(false) // converted → correctly unbalanced
  })
})
