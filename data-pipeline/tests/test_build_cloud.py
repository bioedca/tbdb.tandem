"""Tests for build_cloud.py (the /cloud 3D similarity embedding) + the committed
public/data/cloud.json integrity (PLAN /cloud spec section 7.3).

Two layers, mirroring test_build.py (fixture) + test_artifacts.py (committed):
  * fixture: a tiny 6-leaf tree with known branch lengths exercises the pure
    parser / patristic matrix / PCoA / k-NN, and pins the load-bearing invariants
    -- PCoA preserves the gross patristic ordering, the sign convention is
    byte-deterministic across runs, variance ratios are a descending fraction of
    the positive eigenmass, and the k-NN edge list is undirected + deduplicated.
  * committed: cloud.json exists, has both tree blocks at the right tip counts,
    coordinates within the canvas range, and in-range deduplicated edges.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

import build_cloud as bc

DATA = Path(__file__).resolve().parents[2] / "public" / "data"

# Load-bearing committed counts (match test_artifacts.py).
N_MAIN_TIPS, N_FALLBACK = 847, 102


# --- fixture: a 6-leaf tree with known branch lengths -----------------------
#
#            ┌─ A:1   ┌─ C:1        ┌─ E:1
#   ((  (A,B):2 , (C,D):2 ):1 , (E,F):1 );   F has a long 3.0 branch (an outlier)
#
FIXTURE_NWK = "(((A:1.0,B:1.0)0.9:2.0,(C:1.0,D:1.0)0.8:2.0)0.7:1.0,(E:1.0,F:3.0)0.6:1.0);"

# Minimal metadata so build_points can join the 6 leaves.
FIXTURE_TIPS = {
    name: {
        "member_id": f"T{i}.m1",
        "tandem_id": f"T{i}",
        "ordinal": 1,
        "specifier": ("TRP" if name != "F" else None),
        "phylum": ("Firmicutes" if name != "E" else None),
    }
    for i, name in enumerate("ABCDEF")
}
FIXTURE_LOCI = {
    "loci": [
        {
            "tandem_id": f"T{i}",
            "func_class": "aaRS",
            "type": "Transcriptional",
            "confidence": "high",
            "same_specifier": (name != "C"),  # T2 is "mixed"
            "mean_pairwise_identity": 80.0,
            "n_cores": 2,
        }
        for i, name in enumerate("ABCDEF")
    ]
}
FIXTURE_MEMBERS = {
    f"T{i}.m1": {"deltadelta_g": (-10.0 if name != "D" else None)}
    for i, name in enumerate("ABCDEF")
}


def _patristic():
    root = bc.parse_newick(FIXTURE_NWK)
    return bc.patristic_matrix(root)


# --- parser + patristic -----------------------------------------------------

def test_parse_recovers_six_leaves_in_document_order():
    names, _ = _patristic()
    assert names == list("ABCDEF")


def test_patristic_matches_hand_computed_distances():
    names, D = _patristic()
    idx = {n: i for i, n in enumerate(names)}

    def d(a, b):
        return D[idx[a], idx[b]]

    assert np.allclose(np.diag(D), 0.0)
    assert np.allclose(D, D.T)  # symmetric
    assert d("A", "B") == pytest.approx(2.0)   # 1 + 1
    assert d("C", "D") == pytest.approx(2.0)
    assert d("E", "F") == pytest.approx(4.0)   # 1 + 3
    assert d("A", "C") == pytest.approx(6.0)   # 1 + 2 + 2 + 1
    assert d("A", "E") == pytest.approx(6.0)   # 1 + 2 + 1 + 1 + 1
    assert d("A", "F") == pytest.approx(8.0)   # 1 + 2 + 1 + 1 + 3


# --- PCoA -------------------------------------------------------------------

def test_pcoa_preserves_gross_patristic_ordering():
    names, D = _patristic()
    coords, _ = bc.pcoa(D)
    idx = {n: i for i, n in enumerate(names)}

    def emb(a, b):
        return float(np.linalg.norm(coords[idx[a]] - coords[idx[b]]))

    # A sister (A,B) must embed closer than the long-branch outlier pair (A,F).
    assert emb("A", "B") < emb("A", "F")
    # And the embedded distances correlate strongly with the patristic ones.
    iu = np.triu_indices(len(names), k=1)
    patr = D[iu]
    embd = np.array(
        [np.linalg.norm(coords[i] - coords[j]) for i, j in zip(*iu)]
    )
    corr = float(np.corrcoef(patr, embd)[0, 1])
    assert corr > 0.8


def test_pcoa_scales_to_canvas_and_fixes_axis_signs():
    _, D = _patristic()
    coords, _ = bc.pcoa(D)
    assert coords.shape == (6, 3)
    assert np.max(np.abs(coords)) == pytest.approx(bc.SCALE)
    # Sign convention: the largest-|.| coordinate on each axis is positive.
    for axis in range(3):
        col = coords[:, axis]
        assert col[int(np.argmax(np.abs(col)))] > 0


def test_variance_ratios_descending_fraction_of_positive_mass():
    _, D = _patristic()
    _, var = bc.pcoa(D)
    assert len(var) == bc.N_VAR
    assert var[0] > 0
    assert var == sorted(var, reverse=True)  # non-increasing
    assert sum(v for v in var if v > 0) <= 1.0 + 1e-9


# --- determinism (sign convention -> byte-stable embedding) -----------------

def test_build_tree_block_is_byte_deterministic():
    a = bc.build_tree_block(FIXTURE_NWK, FIXTURE_TIPS, _loci_by_id(), FIXTURE_MEMBERS)
    b = bc.build_tree_block(FIXTURE_NWK, FIXTURE_TIPS, _loci_by_id(), FIXTURE_MEMBERS)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def _loci_by_id():
    return {l["tandem_id"]: l for l in FIXTURE_LOCI["loci"]}


# --- k-NN edges -------------------------------------------------------------

def test_knn_edges_are_undirected_and_deduplicated():
    _, D = _patristic()
    edges = bc.knn_edges(D, k=2)
    # every pair ordered i < j, and unique
    assert all(i < j for i, j in edges)
    assert len(edges) == len({tuple(e) for e in edges})
    # the two mutual-nearest sisters must be linked
    names, _ = _patristic()
    idx = {n: i for i, n in enumerate(names)}
    assert sorted([idx["A"], idx["B"]]) in [list(e) for e in edges]
    assert sorted([idx["C"], idx["D"]]) in [list(e) for e in edges]


# --- per-point join ---------------------------------------------------------

def test_build_points_joins_element_and_locus_metadata():
    names, D = _patristic()
    coords, _ = bc.pcoa(D)
    pts = bc.build_points(names, coords, FIXTURE_TIPS, _loci_by_id(), FIXTURE_MEMBERS)
    assert len(pts) == 6
    by_id = {p["id"]: p for p in pts}
    a = by_id["A"]
    assert a["tandem_id"] == "T0" and a["member_id"] == "T0.m1"
    assert a["func"] == "aaRS" and a["conf"] == "high"
    assert by_id["C"]["mixed"] is True       # same_specifier False -> mixed
    assert by_id["A"]["mixed"] is False
    assert by_id["F"]["spec"] is None         # nullable specifier preserved
    assert by_id["D"]["ddg"] is None          # nullable delta-delta-G preserved
    # coordinates rounded + within the canvas range
    for p in pts:
        for ax in ("x", "y", "z"):
            assert abs(p[ax]) <= bc.SCALE + 1e-9
            assert round(p[ax], bc.COORD_DP) == p[ax]


def test_build_points_raises_on_unknown_leaf():
    names = ["A", "ZZZ"]
    coords = np.zeros((2, 3))
    with pytest.raises(ValueError, match="absent from tree_tips"):
        bc.build_points(names, coords, FIXTURE_TIPS, _loci_by_id(), FIXTURE_MEMBERS)


# --- committed public/data/cloud.json integrity -----------------------------

@pytest.fixture(scope="module")
def cloud():
    return json.loads((DATA / "cloud.json").read_text())


def test_cloud_json_present_and_versioned(cloud):
    assert (DATA / "cloud.json").exists()
    meta = cloud["meta"]
    assert meta["method"] == "pcoa"
    assert meta["scale"] == int(bc.SCALE)
    assert meta["k_nn"] == bc.K_NN
    assert meta["version"] == bc.CLOUD_VERSION


@pytest.mark.parametrize("tree,n", [("main", N_MAIN_TIPS), ("fallback", N_FALLBACK)])
def test_cloud_block_shape(cloud, tree, n):
    block = cloud[tree]
    assert len(block["var"]) == bc.N_VAR
    assert len(block["points"]) == n
    # coordinates in the canvas range
    for p in block["points"]:
        for ax in ("x", "y", "z"):
            assert -bc.SCALE - 1e-6 <= p[ax] <= bc.SCALE + 1e-6
        # required keys present
        for key in ("id", "tandem_id", "member_id", "ord", "spec", "phylum",
                    "func", "type", "conf", "mixed", "ddg", "ident", "ncores"):
            assert key in p
    # edges: in range, ordered, deduplicated
    edges = block["edges"]
    assert all(0 <= i < n and 0 <= j < n and i < j for i, j in edges)
    assert len(edges) == len({tuple(e) for e in edges})


def test_cloud_main_variance_matches_documented_caveat(cloud):
    # The honest readout: 3 PCoA axes capture ~41% of pairwise distance (flat 2D ~32%).
    var = cloud["main"]["var"]
    assert round(100 * sum(var[:2])) == 32
    assert round(100 * sum(var[:3])) == 41
