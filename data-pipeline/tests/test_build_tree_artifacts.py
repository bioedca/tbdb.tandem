"""Unit tests for build_tree_artifacts.py (PLAN section 5.2, 6; Track B / SB.4).

Cluster-free: build_tree_artifacts.py runs at SB.4 over real cluster Newicks, but
its Newick-tip parsing and tip-metadata assembly are pure and are exercised here on
synthetic inputs. Mirrors the test_slice_stemI.py / test_wuss.py precedent.
"""

from build_tree_artifacts import assemble_tip_metadata, parse_newick_tips


# --- parse_newick_tips: leaf labels only (support values excluded) -----------

def test_parse_newick_tips_basic():
    assert parse_newick_tips("(A:0.1,B:0.2,C:0.3);") == {"A", "B", "C"}


def test_parse_newick_tips_ignores_internal_support_labels():
    # The "0.98" support label follows a ")" and must not be read as a tip.
    nwk = "((A:0.1,B:0.2)0.98:0.05,C:0.3);"
    assert parse_newick_tips(nwk) == {"A", "B", "C"}


def test_parse_newick_tips_alphanumeric_unique_names():
    # Real unique_name labels are alphanumeric (e.g. 4LYU1SRI, FYGA5EM).
    nwk = "((4LYU1SRI:0.12,FYGA5EM:0.30)0.9:0.04,GYROCCC:0.2);"
    assert parse_newick_tips(nwk) == {"4LYU1SRI", "FYGA5EM", "GYROCCC"}


# --- assemble_tip_metadata --------------------------------------------------

def _members():
    """Three members across two loci, shaped like members.json."""
    return {
        "T1.m1": {"unique_name": "UA", "tandem_id": "T1", "ordinal": 1,
                  "specifier": {"aa": "TRP"}},
        "T1.m2": {"unique_name": "UB", "tandem_id": "T1", "ordinal": 2,
                  "specifier": {"aa": "VAL"}},
        "T2.m1": {"unique_name": "UC", "tandem_id": "T2", "ordinal": 1,
                  "specifier": {"aa": "ILE"}},
    }


def test_assemble_tip_metadata_assigns_trees_and_locus_map():
    members = _members()
    locus_phylum = {"T1": "Firmicutes", "T2": None}
    tips, locus_map, counts = assemble_tip_metadata(
        members, locus_phylum, main_tips={"UA", "UB"}, fallback_tips={"UC"}
    )
    assert tips["UA"] == {
        "member_id": "T1.m1", "tandem_id": "T1", "ordinal": 1,
        "specifier": "TRP", "phylum": "Firmicutes", "tree": "main",
    }
    assert tips["UB"]["tree"] == "main"
    assert tips["UC"]["tree"] == "fallback"
    assert tips["UC"]["phylum"] is None  # unassigned-phylum locus passes through
    assert locus_map == {"T1": ["UA", "UB"], "T2": ["UC"]}
    assert counts == {"main": 2, "fallback": 1, "absent": 0}


def test_assemble_tip_metadata_flags_absent_tip():
    # A member in neither Newick is "flagged-absent" (PLAN section 6) and is kept out
    # of the locus->tips map.
    members = _members()
    locus_phylum = {"T1": "Firmicutes", "T2": None}
    tips, locus_map, counts = assemble_tip_metadata(
        members, locus_phylum, main_tips={"UA"}, fallback_tips={"UC"}
    )
    assert tips["UB"]["tree"] == "absent"
    assert "UB" not in locus_map["T1"]
    assert locus_map["T1"] == ["UA"]
    assert counts == {"main": 1, "fallback": 1, "absent": 1}
