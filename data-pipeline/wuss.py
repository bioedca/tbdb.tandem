"""WUSS -> dot-bracket conversion for T-box Stem-I structure strings.

This module is the single Python source of the WUSS->dot-bracket rule. It is
mirrored verbatim into ``src/lib/wuss.ts`` and asserted to byte-parity on golden
structures at S2.7 (PLAN section 10.2), so the two implementations must stay
behaviourally identical.

Per PLAN section 3.1, the Stem-I ``Structure`` column is WUSS notation. Across
the full TBDB Master table (all 23,535 rows) its alphabet is exactly
``< > - . _ , : ~`` -- no parentheses. The locked conversion rule, applied to
**that column only**, is::

    <  ->  (        (opening pair bracket)
    >  ->  )        (closing pair bracket)
    every other mark ( - . _ , : ~ )  ->  .

The ``whole_antiterm_structure`` / ``term_structure`` columns are *already*
dot-bracket (alphabet ``( ) .``) and are passed through unchanged -- do NOT run
them through :func:`wuss_to_dotbracket`; validate them with :func:`is_balanced`
directly.

Validation (PLAN section 5.4, gate #7): every converted Stem-I string and both
pass-through columns must be balanced. An unbalanced result is *not* raised
here -- the build flags that element for the tbdb.io VARNA deep-link-only
fallback.
"""

# WUSS pair brackets. The real Stem-I column only uses ``<``/``>``; the other
# bracket families are included so this is the canonical WUSS->shorthand mapping
# and stays correct if any other column is ever routed through it. All
# nested-pair opens collapse to ``(`` and closes to ``)`` -- dot-bracket cannot
# encode pseudoknots, and the Stem-I column contains none.
_OPEN = frozenset("<([{")
_CLOSE = frozenset(">)]}")


def wuss_to_dotbracket(wuss: str) -> str:
    """Convert a WUSS structure string to dot-bracket notation.

    Opening pair brackets become ``(``, closing pair brackets become ``)``, and
    every other character (the WUSS unpaired marks ``- . _ , : ~`` and anything
    else, e.g. whitespace) becomes ``.``. Length is preserved 1:1.
    """
    out = []
    for ch in wuss:
        if ch in _OPEN:
            out.append("(")
        elif ch in _CLOSE:
            out.append(")")
        else:
            out.append(".")
    return "".join(out)


def is_balanced(dotbracket: str) -> bool:
    """Return ``True`` iff parentheses in ``dotbracket`` are balanced and nested.

    Every non-paren character (``.`` and anything else) is treated as unpaired.
    A string is balanced when the running open/close depth never goes negative
    and returns to zero. The empty string is balanced.

    Contract: this validates *dot-bracket* shape only. Callers validating a
    Stem-I WUSS string must convert first -- ``is_balanced(wuss_to_dotbracket(s))``
    -- because raw ``<``/``>`` are treated as unpaired here and would wrongly
    report balanced. The pass-through ``whole_antiterm_structure`` /
    ``term_structure`` columns are already dot-bracket, so pass them in directly.
    """
    depth = 0
    for ch in dotbracket:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0
