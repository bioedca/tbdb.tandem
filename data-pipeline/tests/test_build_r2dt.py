"""Unit tests for build_r2dt.py (PLAN section 9): the R2DT input FASTA + the
ingest that turns R2DT's RNA-2D-JSON output into the committed compact assets.

These run on tiny hand-built R2DT documents (no R2DT install needed) and lock the
two correctness invariants the colour overlay depends on: nucleotides are taken
in the contiguous 1-based ``residueIndex`` frame (5'/3' markers dropped), and a
diagram whose sequence does not equal its member's ``fasta_sequence`` (T->U) is
rejected -- never written -- because it would silently misalign the stem colours.
"""

from __future__ import annotations

import json
from pathlib import Path

import build_r2dt as br


def _raw(seq: str, coords: list[tuple[float, float]], pairs: list[tuple[int, int]]) -> dict:
    """A minimal R2DT RNA-2D-JSON: 5' marker, the nucleotides (1-based), 3' marker."""
    residues = [{"residueName": "5'", "residueIndex": 0, "x": 0.0, "y": 0.0}]
    for i, (ch, (x, y)) in enumerate(zip(seq, coords), start=1):
        residues.append({"residueName": ch, "residueIndex": i, "x": x, "y": y})
    residues.append({"residueName": "3'", "residueIndex": len(seq) + 1, "x": 0.0, "y": 0.0})
    return {
        "rnaComplexes": [
            {
                "rnaMolecules": [
                    {
                        "sequence": residues,
                        "basePairs": [
                            {"residueIndex1": a, "residueIndex2": b, "basePairType": "canonical"}
                            for a, b in pairs
                        ],
                    }
                ]
            }
        ]
    }


def test_compact_drops_end_markers_and_keeps_pairs():
    raw = _raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [(4, 1)])
    c = br.compact_from_r2dt_json(raw)
    assert c is not None
    assert c["seq"] == "ACGU"          # 5'/3' markers dropped
    assert c["x"] == [1.0, 2.0, 3.0, 4.0]
    assert c["y"] == [1.0, 2.0, 3.0, 4.0]
    assert c["pairs"] == [[1, 4]]       # ordered lo<=hi, deduped


def test_compact_rejects_noncontiguous_index():
    raw = _raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [])
    # punch a hole in the 1..N frame (the overlay relies on it)
    raw["rnaComplexes"][0]["rnaMolecules"][0]["sequence"][3]["residueIndex"] = 99
    assert br.compact_from_r2dt_json(raw) is None


def test_compact_rejects_wrong_shape():
    assert br.compact_from_r2dt_json({"not": "r2dt"}) is None


def test_compact_returns_none_on_malformed_residue():
    # A residue that passes the A/C/G/U filter but is missing residueIndex / x, or
    # carries a non-numeric coordinate, must return None (contract) -- not raise.
    missing_idx = _raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [])
    del missing_idx["rnaComplexes"][0]["rnaMolecules"][0]["sequence"][2]["residueIndex"]
    assert br.compact_from_r2dt_json(missing_idx) is None

    bad_xy = _raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [])
    bad_xy["rnaComplexes"][0]["rnaMolecules"][0]["sequence"][2]["x"] = "notanumber"
    assert br.compact_from_r2dt_json(bad_xy) is None


def test_ingest_skips_malformed_member_without_crashing(tmp_path: Path):
    # One malformed per-member document must be skipped + reported, never abort the
    # whole batch (so the good members + the manifest are still written).
    members = {
        "T0001.m1": {"fasta_sequence": "ACGT", "stems": []},
        "T0001.m2": {"fasta_sequence": "ACGT", "stems": []},
    }
    results = tmp_path / "results"
    results.mkdir()
    (results / "T0001.m1.json").write_text(json.dumps(_raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [])))
    bad = _raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [])
    del bad["rnaComplexes"][0]["rnaMolecules"][0]["sequence"][2]["residueIndex"]
    (results / "T0001.m2.json").write_text(json.dumps(bad))
    out = tmp_path / "r2dt"

    n, problems = br.ingest(results, members, out, None)

    assert n == 1
    assert (out / "T0001.m1.json").exists()
    assert not (out / "T0001.m2.json").exists()
    assert (out / "manifest.json").exists()  # the run completed, not crashed
    assert any("T0001.m2" in p for p in problems)


def test_write_input_fasta_is_rna(tmp_path: Path):
    members = {"T0001.m1": {"fasta_sequence": "ACGTACGT"}, "T0001.m2": {"fasta_sequence": ""}}
    out = tmp_path / "r2dt_input.fasta"
    n = br.write_input_fasta(members, out)
    assert n == 2
    # T->U, empty sequence skipped (no record)
    assert out.read_text() == ">T0001.m1\nACGUACGU\n"


def test_ingest_writes_assets_manifest_and_skips_mismatch(tmp_path: Path):
    members = {
        "T0001.m1": {"fasta_sequence": "ACGT", "stems": []},   # matches r2dt ACGU
        "T0001.m2": {"fasta_sequence": "GGGG", "stems": []},   # MISMATCH vs r2dt ACGU
        "T0001.m3": {"fasta_sequence": "ACGT", "stems": []},   # no r2dt output at all
    }
    results = tmp_path / "results"
    results.mkdir()
    (results / "T0001.m1.json").write_text(
        json.dumps(_raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], [(1, 4)]))
    )
    (results / "T0001.m2.json").write_text(
        json.dumps(_raw("ACGU", [(1, 1), (2, 2), (3, 3), (4, 4)], []))
    )
    (results / "UNKNOWN.m9.json").write_text(json.dumps(_raw("AC", [(1, 1), (2, 2)], [])))
    metadata = tmp_path / "metadata.tsv"
    metadata.write_text("T0001.m1\tT-box\tRfam\nT0001.m2\tT-box\tRfam\n")
    out = tmp_path / "r2dt"

    n, problems = br.ingest(results, members, out, metadata)

    assert n == 1
    assert (out / "T0001.m1.json").exists()
    assert not (out / "T0001.m2.json").exists()  # sequence mismatch → skipped
    asset = json.loads((out / "T0001.m1.json").read_text())
    assert asset["seq"] == "ACGU" and asset["template"] == "T-box" and asset["source"] == "Rfam"

    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["count"] == 1
    assert list(manifest["diagrams"]) == ["T0001.m1"]
    assert manifest["diagrams"]["T0001.m1"] == {"template": "T-box", "source": "Rfam"}

    joined = " ".join(problems)
    assert "T0001.m2" in joined            # mismatch reported
    assert "UNKNOWN.m9" in joined          # unknown member_id reported


# --- stage 3: graft (antiterminator hairpin + single-strand reflow) ----------

import math  # noqa: E402

import pytest  # noqa: E402


def _max_step_ratio(diagram: dict) -> float:
    xs, ys = diagram["x"], diagram["y"]
    steps = sorted(math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(1, len(xs)))
    med = steps[len(steps) // 2] or 1.0
    return steps[-1] / med if steps else 0.0


def test_pair_table_pairs_and_unpaired():
    pt = br._pair_table("..((..))..")
    assert pt[3] == 8 and pt[8] == 3 and pt[4] == 7 and pt[7] == 4
    assert pt[1] == 0 and pt[5] == 0  # unpaired


def test_place_arc_removes_break_with_even_spacing():
    # A run of 3 residues collapsed at the origin (a "break") between anchors 20
    # apart, median step 10 → the arc branch should spread them ~one step apart.
    xs = [0.0, 0.0, 0.0, 0.0, 0.0, 20.0]  # 1-based; anchors at idx 1 and 5
    ys = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    br._place_arc(xs, ys, 2, 4, 1, 5, med=10.0, cen=(10.0, -100.0))
    steps = [math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(2, 6)]
    assert all(8.0 <= s <= 12.0 for s in steps)  # ~median, no break


def test_graft_member_no_antiterminator_passthrough_is_continuous():
    # No 'at' stem → no hairpin to fold; coords/pairs pass through, reflow keeps the
    # backbone continuous, and ViennaRNA is never imported.
    member = {"whole_antiterm_structure": "..........", "stems": []}
    raw = {
        "seq": "ACGUACGUAC",
        "x": [float(i * 10) for i in range(10)],
        "y": [0.0] * 10,
        "pairs": [[1, 6]],
        "template": "T-box",
        "source": "Rfam",
    }
    out = br.graft_member(raw, member)
    assert out is not None
    assert out["pairs"] == [[1, 6]]
    assert _max_step_ratio(out) < br.GRAFT_MAX_STEP_RATIO
    assert all(math.isfinite(v) for v in out["x"] + out["y"])


def test_graft_member_quality_gate_rejects_distorted_layout():
    # Two paired residues placed far apart make a backbone jump the reflow cannot
    # fix (it only reflows unpaired runs) → the member is rejected (→ fornac).
    member = {"whole_antiterm_structure": "(())", "stems": []}
    raw = {
        "seq": "ACGU",
        "x": [0.0, 10.0, 1000.0, 1010.0],  # huge jump between the two helices
        "y": [0.0, 0.0, 0.0, 0.0],
        "pairs": [[1, 2], [3, 4]],
        "template": None,
        "source": None,
    }
    assert br.graft_member(raw, member) is None


def test_graft_member_folds_antiterminator_and_drops_template_pairs():
    pytest.importorskip("RNA")  # ViennaRNA NAView layout (build-time dependency)
    # whole_antiterm folds a hairpin over residues 8..15; R2DT (the template) leaves
    # that span unpaired and instead carries a spurious pair (10,19) crossing into
    # the 3' tail, plus a real upstream stem (2,5).
    wa = ".......(((..)))....."  # len 20: hairpin 8-15 → pairs (8,15)(9,14)(10,13)
    member = {
        "whole_antiterm_structure": wa,
        "stems": [{"key": "at", "start": 8, "end": 15}],
    }
    raw = {
        "seq": "ACGU" * 5,
        "x": [float(i * 10) for i in range(20)],
        "y": [0.0] * 20,
        "pairs": [[2, 5], [10, 19]],  # upstream stem + spurious AT→tail template pair
        "template": "T-box",
        "source": "Rfam",
    }
    out = br.graft_member(raw, member)
    assert out is not None
    pairs = {tuple(p) for p in out["pairs"]}
    assert (8, 15) in pairs and (9, 14) in pairs and (10, 13) in pairs  # antiterminator folded
    assert (10, 19) not in pairs  # spurious template pair touching the AT span dropped
    assert (2, 5) in pairs  # upstream stem kept
    assert all(math.isfinite(v) for v in out["x"] + out["y"])
    assert _max_step_ratio(out) < br.GRAFT_MAX_STEP_RATIO  # continuous backbone


def test_graft_driver_drops_low_quality_clears_stale_and_writes_manifest(tmp_path: Path):
    members = {
        "T0001.m1": {"fasta_sequence": "ACGTACGTAC", "whole_antiterm_structure": "..........", "stems": []},  # clean
        "T0001.m2": {"fasta_sequence": "ACGT", "whole_antiterm_structure": "(())", "stems": []},  # distorted → drop
        "T0001.m4": {"fasta_sequence": "ACGT", "whole_antiterm_structure": "....", "stems": []},  # raw seq mismatch → drop
        "T0001.m3": {"fasta_sequence": "ACGT", "whole_antiterm_structure": "....", "stems": []},  # not in raw snapshot
    }
    raw_snapshot = {
        "T0001.m1": {
            "seq": "ACGUACGUAC",
            "x": [float(i * 10) for i in range(10)],
            "y": [0.0] * 10,
            "pairs": [[1, 6]],
            "template": "T-box",
            "source": "Rfam",
        },
        "T0001.m2": {
            "seq": "ACGU",
            "x": [0.0, 10.0, 1000.0, 1010.0],
            "y": [0.0, 0.0, 0.0, 0.0],
            "pairs": [[1, 2], [3, 4]],
            "template": "T-box",
            "source": "Rfam",
        },
        "T0001.m4": {
            "seq": "AAAA",  # != member fasta_sequence (ACGT → ACGU) — must be rejected
            "x": [0.0, 10.0, 20.0, 30.0],
            "y": [0.0, 0.0, 0.0, 0.0],
            "pairs": [],
            "template": "T-box",
            "source": "Rfam",
        },
    }
    raw_path = tmp_path / "r2dt_raw.json"
    raw_path.write_text(json.dumps(raw_snapshot))
    out = tmp_path / "r2dt"
    out.mkdir()
    (out / "STALE.m9.json").write_text("{}")  # must be cleared

    n, dropped = br.graft(raw_path, members, out)

    assert n == 1
    assert (out / "T0001.m1.json").exists()
    assert not (out / "T0001.m2.json").exists()  # distorted → fornac fallback
    assert not (out / "T0001.m4.json").exists()  # raw/fasta sequence mismatch → rejected
    assert not (out / "STALE.m9.json").exists()  # stale file cleared
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["count"] == 1 and list(manifest["diagrams"]) == ["T0001.m1"]
    assert any("T0001.m2" in d for d in dropped)
    assert any("T0001.m4" in d and "sequence" in d for d in dropped)
