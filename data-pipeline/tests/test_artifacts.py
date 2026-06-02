"""Integrity checks over the committed public/data/*.json (PLAN section 10.1; S0.7).

Independent of any rebuild: these guard against a stale or corrupt **committed**
artifact set (the files GitHub Pages serves directly, PLAN section 2.3/11.4). They
assert the absolute load-bearing counts (470 / 949 / 488, CLAUDE.md section 2),
re-derive gate #10 from the committed ``members.json`` with the build's own
:func:`build_json.partition_for_tree`, and re-check the URL / balance / golden gates
over the real data -- the full-scale complement to ``test_build.py``'s fixture run.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import build_json as bj
from wuss import is_balanced

DATA = Path(__file__).resolve().parents[2] / "public" / "data"

# Load-bearing counts (PLAN section 3.1, 5.4; CLAUDE.md section 2). The main-tree
# tip count is the value the S0.6 build emitted and PROGRESS.md recorded -- never
# assumed (CLAUDE.md section 2). A legitimate source change that moves it must
# update this constant consciously.
N_LOCI, N_MEMBERS, N_PAIRS = 470, 949, 488
N_MAIN_TIPS, N_FALLBACK = 847, 102


# --- fixtures: the committed artifacts --------------------------------------

@pytest.fixture(scope="module")
def loci():
    return json.loads((DATA / "loci.json").read_text())


@pytest.fixture(scope="module")
def members():
    return json.loads((DATA / "members.json").read_text())


@pytest.fixture(scope="module")
def identity():
    return json.loads((DATA / "identity.json").read_text())


@pytest.fixture(scope="module")
def summary():
    return json.loads((DATA / "summary.json").read_text())


# --- presence ---------------------------------------------------------------

def test_all_artifacts_present():
    for name in ("summary.json", "loci.json", "members.json", "identity.json",
                 "tree_input.fasta", "antiterm_fallback.fasta"):
        assert (DATA / name).exists(), f"missing committed artifact: {name}"


# --- Gate #1 / #2 / #9 : absolute counts ------------------------------------

def test_counts(loci, members, identity):
    assert len(loci["loci"]) == N_LOCI
    assert len(members) == N_MEMBERS
    assert len(identity) == N_PAIRS


def test_gate2_member_reconciliation(loci, members):
    referenced = [mid for lo in loci["loci"] for mid in lo["member_ids"]]
    assert len(referenced) == N_MEMBERS
    assert set(referenced) == set(members)
    assert sum(lo["n_cores"] for lo in loci["loci"]) == N_MEMBERS
    for lo in loci["loci"]:
        assert len(lo["member_ids"]) == lo["n_cores"]


def test_pairs_and_triples(loci):
    n2 = sum(1 for lo in loci["loci"] if lo["n_cores"] == 2)
    n3 = sum(1 for lo in loci["loci"] if lo["n_cores"] == 3)
    assert (n2, n3) == (461, 9)


# --- Gate #3 : URL resolution -----------------------------------------------

def test_gate3_url_resolution(members):
    for mid, m in members.items():
        assert m["tbdb_url"] or m["ncbi_url"], f"{mid} resolves to no URL"
    # On the real data every member has a unique_name -> a tbdb_url.
    assert all(m["tbdb_url"] for m in members.values())


# --- Gate #4 / #5 : sequence presence + leader length -----------------------

def test_gate4_nonempty(members):
    for mid, m in members.items():
        assert m["fasta_sequence"], f"{mid} empty fasta_sequence"
        assert m["structure"], f"{mid} empty structure"


def test_gate5_leader_length(members):
    for mid, m in members.items():
        a, b = m["coords"]["leader"]
        assert len(m["fasta_sequence"]) == abs(b - a) + 1, mid


# --- Gate #7 : every structure balanced -------------------------------------

def test_gate7_balanced_structures(members):
    for mid, m in members.items():
        assert is_balanced(m["structure"]), f"{mid} structure not balanced"
        for col in ("whole_antiterm_structure", "term_structure"):
            if m[col] is not None:
                assert is_balanced(m[col]), f"{mid} {col} not balanced"


def test_structure_has_no_wuss_marks(members):
    # The Stem-I structure was converted WUSS -> dot-bracket in the build.
    for mid, m in members.items():
        assert set(m["structure"]) <= set("()."), f"{mid} has un-converted WUSS"


# --- Gate #8 : golden CP045927 ----------------------------------------------

def test_gate8_golden(loci, members):
    golden = next(lo for lo in loci["loci"] if lo["accession"] == "CP045927")
    assert golden["tandem_id"] == "T0342"
    ms = [members[mid] for mid in golden["member_ids"]]
    aas = [m["specifier"]["aa"] for m in ms]
    names = [m["unique_name"] for m in ms]
    assert set(aas) == {"VAL", "TRP"}
    assert aas == ["TRP", "VAL"]                # transcript-5' order
    assert names == ["GYROCCC", "AWVAOC5"]      # distinct
    assert len(set(names)) == 2


# --- Gate #9 : identity pairs ------------------------------------------------

def test_gate9_identity_pairs(loci, identity, members):
    import math
    expected = sum(math.comb(lo["n_cores"], 2) for lo in loci["loci"])
    assert len(identity) == expected == N_PAIRS
    for p in identity:
        assert p["a"].split(".")[0] == p["b"].split(".")[0]   # intra-locus
        assert p["a"] in members and p["b"] in members
        assert 0.0 <= p["identity"] <= 100.0


def test_mean_pairwise_identity_backfilled(loci):
    # The S0.4 null placeholder must be backfilled (non-null) in every locus.
    assert all(lo["mean_pairwise_identity"] is not None for lo in loci["loci"])


def test_collapse_recovered_pairs_saturate_at_100(identity):
    # Exactly the 44 collapse-recovered loci have leaders that share one window ->
    # their single pair is 100.0 (PLAN S0.5 note; drift guard). A change here means
    # the collapse set drifted.
    assert sum(1 for p in identity if p["identity"] == 100.0) == 44


# --- Gate #10 : tree_input.fasta == the gate over members.json --------------

def test_gate10_tree_input_matches_partition(members):
    main_ids, fallback_ids = bj.partition_for_tree(members)
    assert len(main_ids) == N_MAIN_TIPS
    assert len(fallback_ids) == N_FALLBACK
    headers = [h for h, _ in bj._read_fasta(DATA / "tree_input.fasta")]
    # Every header is the gated member's unique_name, in order (gate #10).
    assert headers == [members[mid]["unique_name"] for mid in main_ids]
    # Every header is a known unique_name.
    known = {m["unique_name"] for m in members.values() if m["unique_name"]}
    assert set(headers) <= known
    # Every main-tree record meets the native Stem-I length gate.
    for mid in main_ids:
        span = bj._native_stemI_span(members[mid])
        assert span is not None and span >= bj.STEMI_MIN_SPAN


def test_fallback_fasta_count(members):
    records = bj._read_fasta(DATA / "antiterm_fallback.fasta")
    assert len(records) == N_FALLBACK


def test_tree_input_record_count(members):
    records = bj._read_fasta(DATA / "tree_input.fasta")
    assert len(records) == N_MAIN_TIPS
    # No duplicate headers (unique_name keys the tree tips, PLAN section 6).
    headers = [h for h, _ in records]
    assert len(headers) == len(set(headers))


# --- summary.json reconciles with PLAN section 3.1 facts --------------------

def test_summary_counts(summary):
    c = summary["counts"]
    assert c["loci"] == N_LOCI
    assert c["members"] == N_MEMBERS
    assert c["intra_locus_pairs"] == N_PAIRS
    assert (c["pairs"], c["triples"]) == (461, 9)
    assert c["non_firmicutes"] == 16


def test_summary_confidence_and_agreement(summary):
    assert summary["confidence"] == {"high": 394, "low": 76}
    assert summary["specifier_agreement"] == {"same": 428, "mixed": 42}


def test_summary_specifier_bar_order(summary):
    # PLAN section 9 (2) bar order: TRP, THR, MET, LEU, HIS, TYR, ILE, ?, ARG, ...
    spec = [d["value"] for d in summary["distributions"]["specifier"]]
    assert spec[:7] == ["TRP", "THR", "MET", "LEU", "HIS", "TYR", "ILE"]


def test_loci_facets_specifier_frequency_order(loci):
    # facets.specifier is frequency-descending, == the summary bar order.
    spec = loci["facets"]["specifier"]
    assert spec[:5] == ["TRP", "THR", "MET", "LEU", "HIS"]
