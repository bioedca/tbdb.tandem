"""Unit tests for slice_stemI_columns.py (PLAN section 6, 6.1).

Deterministic and cluster-free: the slicer runs on the cluster at SB.3 over real
cmalign output, but its Stem-I-from-SS_cons logic is pure and is exercised here on
small synthetic Stockholm / aligned-FASTA inputs. Mirrors the S0.2 test_wuss.py
precedent of unit-testing a build helper in isolation.
"""

import pytest

from slice_stemI_columns import (
    parse_fasta,
    parse_stockholm,
    slice_alignment,
    slice_columns,
    stem_i_columns,
    stem_i_span,
)

# A two-stem SS_cons (width 20): Stem-I = cols 0..9, an insert gap 10..11, then a
# second stem 12..17, single-stranded tail 18..19.
SS_TWO_STEM = "<<<<__>>>>..<<__>>::"


# --- stem_i_span: first (5'-most) hairpin only ------------------------------

def test_stem_i_span_picks_first_stem():
    assert stem_i_span(SS_TWO_STEM) == (0, 9)


def test_stem_i_span_handles_nested_helices():
    # A hairpin with a nested inner helix closes only when combined depth hits 0.
    assert stem_i_span("<<<<>><<<>>>>>") == (0, 13)


def test_stem_i_span_mixed_bracket_families():
    # Combined depth across families; the first opener delimits the stem.
    assert stem_i_span("(((___)))") == (0, 8)


def test_stem_i_span_skips_leading_unpaired():
    assert stem_i_span(":::<<__>>") == (3, 8)


def test_stem_i_span_no_basepair_raises():
    with pytest.raises(ValueError):
        stem_i_span("::....::")


def test_stem_i_span_unbalanced_raises():
    with pytest.raises(ValueError):
        stem_i_span("<<<___")


# --- stem_i_columns: consensus columns within the span ----------------------

def test_stem_i_columns_two_stem():
    assert stem_i_columns(SS_TWO_STEM) == list(range(10))


def test_stem_i_columns_drops_inserts_within_span():
    # Insert marks ('.' / '~') inside the Stem-I span are dropped; consensus
    # unpaired marks (':', '-', '_', ',') are kept.
    assert stem_i_columns("<<.~_>>") == [0, 1, 4, 5, 6]


# --- parsers ----------------------------------------------------------------

STOCKHOLM_INTERLEAVED = """# STOCKHOLM 1.0

seqA ACGTACGTAC
seqB TTTTTTTTTT
#=GC SS_cons <<<<__>>>>
#=GC RF      xxxxxxxxxx

seqA GTACGTACGT
seqB GGGGGGGGGG
#=GC SS_cons ..<<__>>::
#=GC RF      ..xxxxxx..
//
"""


def test_parse_stockholm_concatenates_blocks():
    seqs, ss_cons, rf = parse_stockholm(STOCKHOLM_INTERLEAVED)
    assert seqs == {
        "seqA": "ACGTACGTACGTACGTACGT",
        "seqB": "TTTTTTTTTTGGGGGGGGGG",
    }
    assert ss_cons == SS_TWO_STEM
    assert rf == "xxxxxxxxxx..xxxxxx.."


def test_parse_stockholm_strips_gc_trailing_whitespace():
    # Trailing whitespace on a #=GC line must not lengthen SS_cons past the width.
    text = "# STOCKHOLM 1.0\nseqA AC\n#=GC SS_cons <>   \n//\n"
    seqs, ss_cons, _ = parse_stockholm(text)
    assert seqs == {"seqA": "AC"}
    assert ss_cons == "<>"


def test_parse_stockholm_skips_name_only_row():
    # A degenerate name-only row must be skipped, not turned into {name: name}.
    text = "# STOCKHOLM 1.0\nseqA AC\nseqB\n#=GC SS_cons <>\n//\n"
    seqs, ss_cons, _ = parse_stockholm(text)
    assert seqs == {"seqA": "AC"}
    assert ss_cons == "<>"


def test_parse_fasta_multiline():
    text = ">seqA\nACGT\nACGT\n>seqB\nTTTT\nGGGG\n"
    assert parse_fasta(text) == {"seqA": "ACGTACGT", "seqB": "TTTTGGGG"}


def test_slice_columns_preserves_order():
    seqs = {"x": "ABCDEF", "y": "uvwxyz"}
    assert slice_columns(seqs, [0, 2, 4]) == {"x": "ACE", "y": "uwy"}


# --- end-to-end slice_alignment --------------------------------------------

def test_slice_alignment_stockholm(tmp_path):
    sto = tmp_path / "leaders.sto"
    sto.write_text(STOCKHOLM_INTERLEAVED, encoding="utf-8")
    sliced = slice_alignment(sto)
    assert sliced == {"seqA": "ACGTACGTAC", "seqB": "TTTTTTTTTT"}


def test_slice_alignment_afa_needs_ss_cons(tmp_path):
    afa = tmp_path / "leaders.afa"
    afa.write_text(
        ">seqA\nACGTACGTACGTACGTACGT\n>seqB\nTTTTTTTTTTGGGGGGGGGG\n", encoding="utf-8"
    )
    # No SS_cons in an afa, and none supplied -> hard error.
    with pytest.raises(SystemExit):
        slice_alignment(afa)
    # Supplying the SS_cons (first line of a sidecar file) makes the slice work.
    ss = tmp_path / "ss.txt"
    ss.write_text(SS_TWO_STEM + "\n", encoding="utf-8")
    sliced = slice_alignment(afa, ss_cons_path=ss)
    assert sliced == {"seqA": "ACGTACGTAC", "seqB": "TTTTTTTTTT"}


def test_slice_alignment_ss_cons_width_mismatch(tmp_path):
    afa = tmp_path / "leaders.afa"
    afa.write_text(">seqA\nACGTACGTACGTACGTACGT\n", encoding="utf-8")
    ss = tmp_path / "ss.txt"
    ss.write_text("<<__>>\n", encoding="utf-8")  # width 6 != 20
    with pytest.raises(SystemExit):
        slice_alignment(afa, ss_cons_path=ss)
