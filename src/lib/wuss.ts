// WUSS → dot-bracket conversion for T-box Stem-I structure strings.
//
// The byte-for-byte mirror of `data-pipeline/wuss.py` (the single Python source of
// the rule). The build converts the Stem-I `Structure` column once with `wuss.py`
// and bakes the result into `members.json`; this module exists so the frontend can
// re-derive / validate the same notation with IDENTICAL behaviour, and is asserted
// to parity against the Python golden structures at S2.7 (`tests/unit/wuss.test.ts`,
// PLAN §10.2). Keep the two implementations behaviourally identical.
//
// Per PLAN §3.1, the Stem-I `Structure` column is WUSS notation. Across the full
// TBDB Master table (all 23,535 rows) its alphabet is exactly `< > - . _ , : ~`
// — no parentheses. The locked conversion rule, applied to THAT column only, is:
//
//     <  →  (        (opening pair bracket)
//     >  →  )        (closing pair bracket)
//     every other mark ( - . _ , : ~ )  →  .
//
// The `whole_antiterm_structure` / `term_structure` columns are ALREADY dot-bracket
// (alphabet `( ) .`) and pass through unchanged — never run them through
// `wussToDotbracket`; validate them with `isBalanced` directly.

// WUSS pair brackets. The real Stem-I column only uses `<`/`>`; the other bracket
// families are included so this is the canonical WUSS→shorthand mapping and stays
// correct if any other column is ever routed through it. All nested-pair opens
// collapse to `(` and closes to `)` — dot-bracket cannot encode pseudoknots, and
// the Stem-I column contains none. (Mirrors `_OPEN`/`_CLOSE` in `wuss.py`.)
const OPEN = new Set('<([{')
const CLOSE = new Set('>)]}')

/**
 * Convert a WUSS structure string to dot-bracket notation.
 *
 * Opening pair brackets become `(`, closing pair brackets become `)`, and every
 * other character (the WUSS unpaired marks `- . _ , : ~` and anything else, e.g.
 * whitespace) becomes `.`. Length is preserved 1:1.
 *
 * Iterates by code point (`for…of`) rather than a C-style index loop so a stray
 * astral character can't desync the output length (UTF-16 surrogate safety, per
 * the S0.2 carry-forward note); on the real ASCII WUSS alphabet the two are
 * identical.
 */
export function wussToDotbracket(wuss: string): string {
  let out = ''
  for (const ch of wuss) {
    if (OPEN.has(ch)) out += '('
    else if (CLOSE.has(ch)) out += ')'
    else out += '.'
  }
  return out
}

/**
 * Return `true` iff parentheses in `dotbracket` are balanced and nested.
 *
 * Every non-paren character (`.` and anything else) is treated as unpaired. A
 * string is balanced when the running open/close depth never goes negative and
 * returns to zero. The empty string is balanced.
 *
 * Contract (mirrors `is_balanced` in `wuss.py`): this validates DOT-BRACKET shape
 * only. Callers validating a Stem-I WUSS string must convert first —
 * `isBalanced(wussToDotbracket(s))` — because raw `<`/`>` are treated as unpaired
 * here and would wrongly report balanced. The pass-through
 * `whole_antiterm_structure` / `term_structure` columns are already dot-bracket, so
 * pass them in directly.
 */
export function isBalanced(dotbracket: string): boolean {
  let depth = 0
  for (const ch of dotbracket) {
    if (ch === '(') depth += 1
    else if (ch === ')') {
      depth -= 1
      if (depth < 0) return false
    }
  }
  return depth === 0
}
