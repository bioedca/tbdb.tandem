"""Golden tests for the WUSS -> dot-bracket converter (PLAN section 3.1, 5.4 #7).

Covers every WUSS mark that appears in the TBDB Master ``Structure`` column
(``< > - . _ , : ~`` -- verified across all 23,535 rows), conversion of all
pair-bracket families, balance validation (the gate-#7 contract), and rejection
of unbalanced output. Real Stem-I structures pulled verbatim from the Master
table anchor the conversion against ground truth.
"""

import pytest

from wuss import is_balanced, wuss_to_dotbracket

# The six WUSS unpaired marks that actually appear in the Stem-I column.
WUSS_MARKS = ["-", ".", "_", ",", ":", "~"]


class TestConversion:
    def test_empty(self):
        assert wuss_to_dotbracket("") == ""

    def test_simple_pair(self):
        assert wuss_to_dotbracket("<>") == "()"

    def test_nested_pairs(self):
        assert wuss_to_dotbracket("<<<>>>") == "((()))"

    @pytest.mark.parametrize("mark", WUSS_MARKS)
    def test_each_mark_becomes_dot(self, mark):
        # Every unpaired WUSS mark collapses to '.', in isolation and in context.
        assert wuss_to_dotbracket(mark) == "."
        assert wuss_to_dotbracket(f"<{mark}>") == "(.)"

    def test_all_marks_together(self):
        # <<  - _ , : ~ .  >>   ->   ((  . . . . . .  ))
        assert wuss_to_dotbracket("<<-_,:~.>>") == "((......))"

    def test_length_preserved(self):
        s = "<<--<<__>>-->>"
        assert len(wuss_to_dotbracket(s)) == len(s)

    def test_output_alphabet_is_dotbracket_only(self):
        out = wuss_to_dotbracket("<<-_,:~.>>")
        assert set(out) <= {"(", ")", "."}

    def test_bracket_family_superset(self):
        # Canonical WUSS->shorthand: every nested-pair family collapses to () /.
        # (Not present in the real Stem-I column, but the rule is general.)
        assert wuss_to_dotbracket("([{<...>}])") == "((((...))))"


class TestIsBalanced:
    @pytest.mark.parametrize(
        "s", ["", "()", "(())", "(.)", "....", "(((...)))", "()()()"]
    )
    def test_balanced(self, s):
        assert is_balanced(s) is True

    @pytest.mark.parametrize("s", ["(", ")", "(()", "())", "((.)", "(.))"])
    def test_unbalanced(self, s):
        assert is_balanced(s) is False

    def test_close_before_open_is_rejected(self):
        # Depth must never go negative, even if the final tally is zero.
        assert is_balanced(")(") is False


# Real Stem-I structures pulled verbatim from Master_tboxes.csv (Name shown):
#   row 1-2: CT573213.2:2420974-2420503   row 3: CP001814.1:1988355-1988036
# (input WUSS, expected dot-bracket). Each is a properly nested Stem-I, so the
# converted string must be balanced.
REAL_STEMI = [
    (
        "<<------<<<<-------<<<<<<-------<<<--------<<<<<<___________.>>>>>>>>>----->>>>>>-------->>>>--->>",
        "((......((((.......((((((.......(((........((((((............))))))))).....))))))........))))...))",
    ),
    (
        "<<<-------<<<<<______>>>>>>>>",
        "(((.......(((((......))))))))",
    ),
    (
        ",,,,,,<<<<<<<___.............._____>>>>>>>.,,,.,<<<<-------<<<<<_____._>>>>>>>>>",
        "......(((((((......................)))))))......((((.......(((((.......)))))))))",
    ),
]


class TestRealStemIStructures:
    @pytest.mark.parametrize("wuss,expected", REAL_STEMI)
    def test_exact_conversion(self, wuss, expected):
        assert wuss_to_dotbracket(wuss) == expected

    @pytest.mark.parametrize("wuss,expected", REAL_STEMI)
    def test_length_and_counts_preserved(self, wuss, expected):
        out = wuss_to_dotbracket(wuss)
        assert len(out) == len(wuss)
        assert out.count("(") == wuss.count("<")
        assert out.count(")") == wuss.count(">")

    @pytest.mark.parametrize("wuss,expected", REAL_STEMI)
    def test_converted_is_balanced(self, wuss, expected):
        # Real Stem-I structures are properly nested -> balanced dot-bracket.
        assert is_balanced(wuss_to_dotbracket(wuss)) is True


class TestGate7Fallback:
    """Malformed WUSS converts to unbalanced dot-bracket; is_balanced flags it,
    so the build routes that element to the VARNA deep-link-only fallback."""

    def test_unbalanced_wuss_detected(self):
        out = wuss_to_dotbracket("<<<__>")  # 3 opens, 1 close
        assert out == "(((..)"
        assert is_balanced(out) is False

    def test_passthrough_dotbracket_validated(self):
        # whole_antiterm_structure / term_structure are already dot-bracket and
        # are validated with is_balanced directly (never converted).
        assert is_balanced("...(((...)))...") is True
        assert is_balanced("...(((...))...") is False
