"""Gates 1-10 + golden values for build_json.py (PLAN section 5.4, 10.1; S0.7).

Runs the whole build pipeline on the committed fixture subset
(``fixtures/master_subset.csv`` + ``fixtures/tandem_subset.tsv``, four loci
covering every resolution path; see ``fixtures/make_fixtures.py``) so the suite is
deterministic and needs neither the 92 MB Master CSV nor a network (PLAN section
10.1). The fixture is small, so the **count** gates are exercised in their
scale-free relational form -- ``members == Sum n_cores`` (#2), ``identity ==
Sum C(n_cores, 2)`` (#9) -- which is exactly what :func:`build_json.validate_gates`
asserts; the **absolute** 470 / 949 / 488 (gates #1/#2/#9) and gate #10 over the
real artifacts live in ``test_artifacts.py``.

The fixture loci (``make_fixtures.py``): T0342 (CP045927, - strand, the gate #8
collapse-recovered golden), T0001 (+ pair), T0062 (+ triple, with a null-specifier
core), T0124 (- triple).
"""

from __future__ import annotations

import copy
import math
from pathlib import Path

import pandas as pd
import pytest

import build_json as bj
from wuss import is_balanced

FIX = Path(__file__).parent / "fixtures"
MASTER = FIX / "master_subset.csv"
TANDEM = FIX / "tandem_subset.tsv"
FIXTURE_LOCI = ["T0001", "T0062", "T0124", "T0342"]


# --- the full fixture build (shared) ----------------------------------------

@pytest.fixture(scope="module")
def built(tmp_path_factory):
    """Run resolve -> assemble -> identity -> summary -> tree FASTAs on the fixture.

    Mirrors :func:`build_json.main` so every gate sees products built exactly the
    way the real build makes them. ``validate_gates`` is called here (it must not
    raise on a clean build) and its warnings + the gate #10 verification are
    exposed for the gate tests.
    """
    tandem, master = bj.load_sources(MASTER, TANDEM)
    tandem = tandem.copy()
    tandem["_ntok"] = tandem["member_names"].str.split(";").map(len)

    loci = bj.resolve_members(tandem, master)
    for locus, ntok in zip(loci, tandem["_ntok"]):
        locus["member_names_count"] = int(ntok)
    bj._assert_golden_ordinal(loci)

    pool = bj._build_pool(tandem, master)
    locus_objs, members_map = bj.assemble(loci, pool, tandem)
    facets = bj.build_facets(locus_objs)

    pairs, means = bj.compute_identity(locus_objs, members_map)
    for locus in locus_objs:
        locus["mean_pairwise_identity"] = means[locus["tandem_id"]]
    summary = bj.build_summary(locus_objs, members_map, pairs)

    warnings = bj.validate_gates(locus_objs, members_map, pairs)

    out = tmp_path_factory.mktemp("treefasta")
    main_count, fallback_count = bj.write_tree_fastas(members_map, out)
    verified = bj.verify_tree_fasta(out, members_map)

    return {
        "loci": loci,
        "locus_objs": locus_objs,
        "members_map": members_map,
        "facets": facets,
        "pairs": pairs,
        "means": means,
        "summary": summary,
        "warnings": warnings,
        "pool": pool,
        "out": out,
        "main_count": main_count,
        "fallback_count": fallback_count,
        "verified": verified,
    }


# --- Gate #1 : locus count --------------------------------------------------

def test_gate1_locus_count(built):
    assert len(built["locus_objs"]) == len(FIXTURE_LOCI)
    assert [lo["tandem_id"] for lo in built["locus_objs"]] == FIXTURE_LOCI


# --- Gate #2 : members == Sum n_cores (relational) --------------------------

def test_gate2_member_count_equals_sum_n_cores(built):
    locus_objs, members_map = built["locus_objs"], built["members_map"]
    assert len(members_map) == sum(lo["n_cores"] for lo in locus_objs) == 10
    for lo in locus_objs:
        assert len(lo["member_ids"]) == lo["n_cores"]
    referenced = [mid for lo in locus_objs for mid in lo["member_ids"]]
    assert len(referenced) == len(members_map)
    assert set(referenced) == set(members_map)


def test_collapse_recovers_two_cores_from_one_token(built):
    # T0342 holds two cores in one member_names window: recovered by the 60-bp
    # collapse, NOT by splitting member_names (PLAN section 5.1, 3.2).
    t0342 = next(lo for lo in built["locus_objs"] if lo["tandem_id"] == "T0342")
    assert t0342["n_cores"] == 2
    tandem = pd.read_csv(TANDEM, sep="\t", dtype=str)
    n_tokens = len(tandem.set_index("tandem_id").loc["T0342", "member_names"].split(";"))
    assert n_tokens == 1 and t0342["n_cores"] > n_tokens


# --- Gate #3 : every member resolves to a tbdb OR ncbi URL ------------------

def test_gate3_url_resolution(built):
    for m in built["members_map"].values():
        assert m["tbdb_url"] or m["ncbi_url"]


def test_ncbi_fallback_branch(built):
    # No real member is missing unique_name, so exercise the fallback explicitly:
    # blank a real pool row's unique_name -> tbdb_url None, ncbi_url present (gate #3).
    pool = built["pool"]
    row = pool.loc[pool.index[0]].copy()
    row["unique_name"] = pd.NA
    obj = bj._assemble_member(row, {"member_id": "X.m1", "tandem_id": "X", "ordinal": 1},
                              "CP045927", "-")
    assert obj["unique_name"] is None
    assert obj["tbdb_url"] is None
    assert obj["ncbi_url"].startswith(
        "https://www.ncbi.nlm.nih.gov/nuccore/CP045927?report=genbank&from="
    )


def test_tbdb_url_pattern(built):
    # tbdb deep-link is case-sensitive (PLAN section 9): /tboxes/<unique_name>.html.
    m = built["members_map"]["T0342.m1"]
    assert m["unique_name"] == "GYROCCC"
    assert m["tbdb_url"] == "https://tbdb.io/tboxes/GYROCCC.html"


# --- Gate #4 : non-empty fasta_sequence + structure -------------------------

def test_gate4_nonempty_fasta_and_structure(built):
    for m in built["members_map"].values():
        assert m["fasta_sequence"]
        assert m["structure"]


# --- Gate #5 : len(fasta) == |locus_end - locus_start| + 1 ------------------

def test_gate5_leader_length(built):
    for m in built["members_map"].values():
        a, b = m["coords"]["leader"]
        assert len(m["fasta_sequence"]) == abs(b - a) + 1


# --- Gate #6 : codon back-check is WARN, never fail --------------------------

def test_gate6_codon_backcheck_warns_not_fails(built):
    # validate_gates returned a warning list (it did not raise on the clean build).
    assert isinstance(built["warnings"], list) and len(built["warnings"]) == 1
    assert "gate#6" in built["warnings"][0]
    # The tally function itself never raises and reports the shape.
    cb = bj._codon_backcheck(built["members_map"])
    assert set(cb) >= {"checked", "match", "mismatch", "skipped"}
    assert cb["match"] + cb["mismatch"] == cb["checked"]


# --- Gate #7 : structures balanced (Stem-I converted; antiterm/term passthrough)

def test_gate7_structures_balanced(built):
    for m in built["members_map"].values():
        assert is_balanced(m["structure"])
        for col in ("whole_antiterm_structure", "term_structure"):
            if m[col] is not None:
                assert is_balanced(m[col])


def test_structure_is_converted_dotbracket_not_wuss(built):
    # The Stem-I structure column is converted WUSS -> dot-bracket: no WUSS marks.
    s = built["members_map"]["T0342.m1"]["structure"]
    assert s and not (set(s) & set("<>-_,:~"))
    assert set(s) <= set("().")


# --- Gate #8 : golden CP045927 + transcript-5' order ------------------------

def test_gate8_golden_cp045927(built):
    golden = next(lo for lo in built["locus_objs"] if lo["accession"] == "CP045927")
    members = [built["members_map"][mid] for mid in golden["member_ids"]]
    aas = [m["specifier"]["aa"] for m in members]
    names = [m["unique_name"] for m in members]
    assert set(aas) == {"VAL", "TRP"}            # gate #8 set check
    assert aas == ["TRP", "VAL"]                  # transcript-5' order pin (m1=TRP, m2=VAL)
    assert names == ["GYROCCC", "AWVAOC5"]        # distinct unique_names
    assert len(set(names)) == 2
    assert golden["member_ids"] == ["T0342.m1", "T0342.m2"]


def test_assert_golden_ordinal_catches_a_flip(built):
    # The build-time ordinal pin must FIRE if the minus-strand order is flipped.
    flipped = copy.deepcopy(built["loci"])
    g = next(lo for lo in flipped if lo["tandem_id"] == "T0342")
    g["members"].reverse()
    with pytest.raises(ValueError, match="ordinal pin failed"):
        bj._assert_golden_ordinal(flipped)


# --- Gate #9 : identity == Sum C(n_cores, 2) (relational) -------------------

def test_gate9_identity_pair_count(built):
    locus_objs, pairs = built["locus_objs"], built["pairs"]
    expected = sum(math.comb(lo["n_cores"], 2) for lo in locus_objs)
    assert len(pairs) == expected == 8
    for p in pairs:
        assert p["a"].split(".")[0] == p["b"].split(".")[0]   # intra-locus
        assert p["a"] in built["members_map"] and p["b"] in built["members_map"]


def test_mean_pairwise_identity_backfilled(built):
    for lo in built["locus_objs"]:
        assert lo["mean_pairwise_identity"] is not None
    # T0342 cores share one leader window -> 100.0 (PLAN S0.5 note; collapse case).
    t0342 = next(lo for lo in built["locus_objs"] if lo["tandem_id"] == "T0342")
    assert t0342["mean_pairwise_identity"] == 100.0
    # A 2-core locus's mean equals its single pair value.
    pid = {(p["a"], p["b"]): p["identity"] for p in built["pairs"]}
    assert t0342["mean_pairwise_identity"] == pid[("T0342.m1", "T0342.m2")]


# --- Gate #10 : tree_input.fasta over the gate definition -------------------

def test_gate10_tree_fasta(built):
    main_ids, fallback_ids = bj.partition_for_tree(built["members_map"])
    # Every fixture member has a long Stem-I -> all main, none fallback.
    assert len(main_ids) == 10 and fallback_ids == []
    assert built["verified"] == built["main_count"] == 10
    headers = [h for h, _ in bj._read_fasta(built["out"] / "tree_input.fasta")]
    assert headers == [built["members_map"][mid]["unique_name"] for mid in main_ids]


# --- Stem-I length-gate partition logic (PLAN section 6) ---------------------

def test_native_stemI_span():
    assert bj._native_stemI_span({"coords": {"window": {"s1": [10, 80]}}}) == 71
    assert bj._native_stemI_span({"coords": {"window": {"s1": [80, 10]}}}) == 71  # order-free
    assert bj._native_stemI_span({"coords": {"window": {"s1": [10, 0]}}}) is None   # Stem-I-less
    assert bj._native_stemI_span({"coords": {"window": {"s1": [None, 5]}}}) is None


def test_partition_main_vs_fallback():
    members = {
        "A": {"coords": {"window": {"s1": [10, 80]}}},      # span 71  -> main
        "B": {"coords": {"window": {"s1": [10, 40]}}},      # span 31  -> fallback
        "C": {"coords": {"window": {"s1": [10, 0]}}},       # s1_end 0 -> fallback
        "D": {"coords": {"window": {"s1": [None, None]}}},  # no Stem-I-> fallback
        "E": {"coords": {"window": {"s1": [10, 59]}}},      # span 50 == gate -> main
    }
    main_ids, fallback_ids = bj.partition_for_tree(members)
    assert main_ids == ["A", "E"]
    assert fallback_ids == ["B", "C", "D"]


# --- Coordinate projection (PLAN section 5.1) -------------------------------

def test_project_plus_strand():
    assert bj.project(1, 1000, "+") == 1000
    assert bj.project(10, 1000, "+") == 1009


def test_project_minus_strand():
    assert bj.project(1, 1000, "-") == 1000
    assert bj.project(10, 1000, "-") == 991


def test_project_na_offset_returns_none():
    assert bj.project(None, 1000, "+") is None
    assert bj.project(pd.NA, 1000, "-") is None
    assert bj.project(float("nan"), 1000, "+") is None


# --- Two-tier function classifier (PLAN section 5.3) ------------------------

@pytest.mark.parametrize("ec,protein,expected", [
    # Tier 1 -- EC prefixes.
    ("6.1.1.5", "isoleucine--tRNA ligase", ("aaRS", "EC")),
    ("2.4.2.18", "anthranilate phosphoribosyltransferase", ("biosynthesis", "EC")),
    ("4.2.1.20", "tryptophan synthase", ("biosynthesis", "EC")),
    ("1.1.1.25", "shikimate dehydrogenase", ("oxidoreductase", "EC")),
    # An EC present but matching no known prefix falls THROUGH to tier 2.
    ("3.5.1.2", "branched-chain amino acid ABC transporter", ("transporter", "text")),
    # Tier 2 -- ordered regex over downstream_protein text.
    (None, "tryptophan--tRNA ligase", ("aaRS", "text")),
    (None, "histidine ABC transporter permease", ("transporter", "text")),
    (None, "chorismate synthase", ("biosynthesis", "text")),
    (None, "hypothetical protein", ("unknown", "text")),
    # No signal at all.
    (None, None, ("unknown", "none")),
    (None, "membrane protein of unknown role", ("unknown", "none")),
])
def test_classify_func(ec, protein, expected):
    assert bj.classify_func(ec, protein) == expected


def test_classify_func_aars_precedes_transporter(built):
    # aaRS is matched before transporter even when both words appear.
    assert bj.classify_func(None, "tRNA ligase associated transporter") == ("aaRS", "text")


# --- Contaminant lineage drop before the join (PLAN section 5.3) ------------

def test_contaminant_phyla_locked_set():
    assert bj.CONTAMINANT_PHYLA == {"Arthropoda", "Ascomycota", "Nematoda", "Streptophyta"}


def test_load_sources_drops_contaminant_rows(tmp_path):
    master = pd.read_csv(MASTER, dtype=str)
    poison = master.iloc[[0]].copy()
    poison["phylum"] = "Ascomycota"
    poison["Name"] = "CONTAM.1:1-2"
    augmented = pd.concat([master, poison], ignore_index=True)
    mpath = tmp_path / "master_with_contaminant.csv"
    augmented.to_csv(mpath, index=False)

    _tandem, filtered = bj.load_sources(mpath, TANDEM)
    assert "CONTAM.1:1-2" not in set(filtered["Name"])
    assert not (set(filtered["phylum"].dropna()) & bj.CONTAMINANT_PHYLA)


# --- validate_gates actually FAILS on bad products (not vacuous) ------------

def _corrupt(built):
    """A deep copy of the build products safe to mutate in a negative test."""
    return (copy.deepcopy(built["locus_objs"]),
            copy.deepcopy(built["members_map"]),
            copy.deepcopy(built["pairs"]))


def test_validate_gates_passes_clean_build(built):
    # No raise on the clean fixture build; returns the gate #6 warning list.
    warnings = bj.validate_gates(built["locus_objs"], built["members_map"], built["pairs"])
    assert len(warnings) == 1 and "gate#6" in warnings[0]


def test_validate_gates_raises_on_unbalanced_structure(built):
    locus_objs, members_map, pairs = _corrupt(built)
    members_map["T0342.m1"]["structure"] = "((("       # unbalanced
    with pytest.raises(ValueError, match="gate#7"):
        bj.validate_gates(locus_objs, members_map, pairs)


def test_validate_gates_raises_on_member_count_mismatch(built):
    locus_objs, members_map, pairs = _corrupt(built)
    locus_objs[0]["member_ids"].append("BOGUS.m9")     # n_cores no longer matches
    with pytest.raises(ValueError, match="gate#2"):
        bj.validate_gates(locus_objs, members_map, pairs)


def test_validate_gates_raises_on_missing_urls(built):
    locus_objs, members_map, pairs = _corrupt(built)
    members_map["T0001.m1"]["tbdb_url"] = None
    members_map["T0001.m1"]["ncbi_url"] = None
    with pytest.raises(ValueError, match="gate#3"):
        bj.validate_gates(locus_objs, members_map, pairs)


def test_validate_gates_raises_on_cross_locus_pair(built):
    locus_objs, members_map, pairs = _corrupt(built)
    pairs[0] = {"a": "T0001.m1", "b": "T0062.m1", "identity": 50.0}
    with pytest.raises(ValueError, match="gate#9"):
        bj.validate_gates(locus_objs, members_map, pairs)


def test_verify_tree_fasta_raises_on_tampered_fasta(built, tmp_path):
    # A header that is not the gated unique_name must fail gate #10.
    bad = tmp_path / "tree_input.fasta"
    bad.write_text(">NOT_A_REAL_NAME\nACGT\n", encoding="utf-8")
    with pytest.raises(ValueError, match="gate#10"):
        bj.verify_tree_fasta(tmp_path, built["members_map"])
