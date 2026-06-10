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

import numpy as np  # noqa: E402
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
    # The straight ladder folds every simple hairpin with no ViennaRNA dependency.
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


# --- stage 3: the deterministic straight-ladder antiterminator hairpin ---------
#
# The canonical antiterminator: an outer 4 bp helix, the conserved 7-nt 5' bulge, an
# inner 5 bp helix, then a 10-nt apical loop. The ladder must keep both helices
# collinear / parallel and spread that bulge -- the two failures of the old NAView
# fold (helices pivoted to a diagonal; bulge crushed to ~0.2x spacing).
_CANONICAL_AT = "((((.......(((((..........)))))))))"


def _rail(coords_xy, idxs):
    """Perpendicular spread + principal angle of a set of 1-based residues' points."""
    pts = [coords_xy[i] for i in idxs]
    mx = sum(p[0] for p in pts) / len(pts)
    my = sum(p[1] for p in pts) / len(pts)
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    syy = sum((p[1] - my) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    ang = 0.5 * math.atan2(2 * sxy, sxx - syy)
    nx, ny = -math.sin(ang), math.cos(ang)
    resid = max(abs((p[0] - mx) * nx + (p[1] - my) * ny) for p in pts)
    return resid, ang


def _parallel_deg(a5: float, a3: float) -> float:
    d = abs((a5 - a3 + math.pi) % math.pi)
    return math.degrees(min(d, math.pi - d))


def test_ladder_hairpin_collinear_helices_and_spread_bulge():
    lx, ly = br._ladder_hairpin(_CANONICAL_AT)
    assert len(lx) == len(_CANONICAL_AT)
    xy = {i: (lx[i - 1], ly[i - 1]) for i in range(1, len(_CANONICAL_AT) + 1)}
    pt = br._pair_table(_CANONICAL_AT)
    five = [i for i in range(1, len(_CANONICAL_AT) + 1) if 0 < i < pt[i]]  # 5' rail
    three = [pt[i] for i in five]  # 3' rail
    step = br._median_step([0.0] + lx, [0.0] + ly)

    r5, a5 = _rail(xy, five)
    r3, a3 = _rail(xy, three)
    assert r5 < 0.05 * step and r3 < 0.05 * step  # each rail is straight (collinear)
    assert _parallel_deg(a5, a3) < 2.0  # the two rails are parallel

    paired = set(five) | set(three)
    bulge = [i for i in range(min(five) + 1, max(three)) if i not in paired]
    bsteps = [math.hypot(lx[i - 1] - lx[i - 2], ly[i - 1] - ly[i - 2]) for i in bulge]
    assert min(bsteps) >= 0.8 * step  # no NAView-style collapse: every base ~1 step apart


def test_ladder_hairpin_rejects_multiloop_and_empty():
    # Two side-by-side hairpin loops (a branch / multiloop) and a pair-less run both
    # decline the ladder so graft_member can fall back to NAView.
    assert br._ladder_hairpin("((..))((..))") is None
    assert br._ladder_hairpin("..........") is None


def test_graft_member_antiterminator_renders_as_straight_overlap_free_ladder():
    # End to end (no ViennaRNA): graft a member whose antiterminator is the canonical
    # hairpin, then assert the FINAL committed coordinates render it as a recognisable,
    # OVERLAP-FREE straight ladder. graft folds the AT into a collinear ladder; the declash
    # pass then resolves any glyph collisions. declash anchors paired (helix) residues hard,
    # so a normal AT (with the structured flanks every real leader has) stays crisp -- only
    # the unanchored single strands flow apart. (Since issue #45 both grafts freeze a shared
    # declashed stems-only base so the stems pin across the antiterm<->term toggle; with the
    # stems frozen the long unfolded-terminator tail of some antiterminator diagrams can no
    # longer fully declash, so corpus-wide overlap-freeness is now traded for stem-pinning --
    # but an AT with structured flanks like this one still renders crisp. This test pins the
    # ladder mechanism + the helix-rail straightness end to end on one element.)
    wa = "..." + _CANONICAL_AT + "..."  # AT with short structured-like flanks (not a long free tail)
    n = len(wa)
    member = {"whole_antiterm_structure": wa, "stems": [{"key": "at", "start": 4, "end": 3 + len(_CANONICAL_AT)}]}
    raw = {
        "seq": ("ACGU" * (n // 4 + 1))[:n],
        "x": [float(i * 12) for i in range(n)],
        "y": [0.0] * n,
        "pairs": [],
        "template": "T-box",
        "source": "Rfam",
    }
    out = br.graft_member(raw, member)
    assert out is not None
    xs, ys = out["x"], out["y"]
    xy = {i: (xs[i - 1], ys[i - 1]) for i in range(1, n + 1)}
    pt = br._pair_table(wa)
    five = [i for i in range(4, 4 + len(_CANONICAL_AT)) if 0 < i < pt[i]]
    three = [pt[i] for i in five]
    step = br._median_step([0.0] + xs, [0.0] + ys)

    r5, a5 = _rail(xy, five)
    r3, a3 = _rail(xy, three)
    assert r5 < 0.15 * step and r3 < 0.15 * step  # rails stay (approximately) straight under declash
    assert _parallel_deg(a5, a3) < 3.0  # and parallel
    # declash leaves NO glyph-on-glyph overlap: every non-adjacent pair is >= ~half a step apart
    mind = min(
        math.hypot(xs[i - 1] - xs[j - 1], ys[i - 1] - ys[j - 1]) / step
        for i in range(1, n + 1)
        for j in range(i + 2, n + 1)
    )
    assert mind >= 0.5
    assert _max_step_ratio(out) < br.GRAFT_MAX_STEP_RATIO  # continuous backbone


def test_declash_separates_overlap_and_keeps_helix_rigid():
    # declash must (a) push apart two non-adjacent residues dropped on top of each other and
    # (b) leave a base-paired helix essentially straight (paired residues are anchored hard).
    n = 12
    xs = [0.0] + [float(i * 10) for i in range(n)]  # 1-based, even 10u backbone
    ys = [0.0] + [0.0] * n
    xs[8], ys[8] = xs[2], ys[2]  # collapse residue 8 onto residue 2 (non-adjacent, unpaired)
    pairs = [(3, 11), (4, 10)]  # a little 2-bp helix
    dx, dy = br._declash(xs, ys, pairs, n)
    step = br._median_step(dx, dy)
    assert math.hypot(dx[2] - dx[8], dy[2] - dy[8]) >= 0.5 * step  # overlap resolved
    assert all(math.isfinite(v) for v in dx[1 : n + 1] + dy[1 : n + 1])
    assert not br._has_hard_clash(dx, dy, n)  # no residual glyph-on-glyph overlap


def test_has_hard_clash_flags_only_real_overlap():
    n = 6
    xs = [0.0] + [float(i * 10) for i in range(n)]
    ys = [0.0] + [0.0] * n
    assert not br._has_hard_clash(xs, ys, n)  # evenly spaced -> no clash
    xs[5], ys[5] = xs[1], ys[1]  # residue 5 onto residue 1 (non-adjacent)
    assert br._has_hard_clash(xs, ys, n)


def test_overlap_count_uses_the_visual_threshold():
    # _overlap_count / _has_visual_overlap flag NON-adjacent glyphs whose centres are closer than
    # 0.88*L (where they visually overlap) -- the real clash threshold, not the old 0.5*L burial.
    n = 5
    xs = [0.0] + [float(i * 10) for i in range(n)]  # L = 10
    ys = [0.0] + [0.0] * n
    assert br._overlap_count(xs, ys, n) == 0 and not br._has_visual_overlap(xs, ys, n)
    xs[5], ys[5] = 0.0, 7.0  # residue 5 (non-adjacent) 0.7*L from residue 1, clear of the rest
    assert br._has_visual_overlap(xs, ys, n)  # overlaps at the 0.88*L visual threshold
    assert br._overlap_count(xs, ys, n, factor=0.5) == 0  # but not buried at the old 0.5*L threshold


def test_helix_clusters_groups_contiguous_helices_and_splits_at_bulges():
    # An outer 2-bp helix (1-2 / 11-12) and an inner 2-bp helix (5-6 / 7-8) separated on BOTH
    # strands by unpaired bulges (3-4 and 9-10) -> two rigid clusters, each carrying both strands.
    pairs = [(1, 12), (2, 11), (5, 8), (6, 7)]
    clusters = sorted(tuple(sorted(c)) for c in br._helix_clusters(pairs, 12))
    assert clusters == [(1, 2, 11, 12), (5, 6, 7, 8)]


def test_separate_stem_clusters_separates_overlapping_helices_rigidly():
    # Two 2-bp ladders dropped overlapping (split by an unpaired spacer at residue 5) -> separation
    # pushes them apart to the visual threshold while each stays RIGID (translation only: intra-
    # cluster distances unchanged, no bending).
    n = 9
    sq = [(0.0, 0.0), (0.0, 10.0), (20.0, 10.0), (20.0, 0.0)]
    xs = [0.0] + [p[0] for p in sq] + [99.0] + [p[0] + 5.0 for p in sq]  # A=1-4, spacer 5, B=6-9
    ys = [0.0] + [p[1] for p in sq] + [50.0] + [p[1] for p in sq]
    pairs = [(1, 4), (2, 3), (6, 9), (7, 8)]
    L = 10.0
    d_intra = math.hypot(xs[1] - xs[2], ys[1] - ys[2])
    br._separate_stem_clusters(xs, ys, pairs, n, L)
    A, B = [1, 2, 3, 4], [6, 7, 8, 9]
    mind = min(math.hypot(xs[i] - xs[j], ys[i] - ys[j]) for i in A for j in B)
    assert mind >= 0.88 * L  # clusters cleared to the visual threshold
    assert math.hypot(xs[1] - xs[2], ys[1] - ys[2]) == pytest.approx(d_intra)  # cluster A stayed rigid


def test_declash_rigid_group_stays_rigid_while_clearing_an_obstacle():
    # A rigid group (3 collinear residues) overlapped by a free obstacle must MOVE as a rigid body
    # to clear it -- its internal geometry preserved EXACTLY (no bending), which the per-residue
    # anchor (pulling toward a fixed orientation) cannot guarantee.
    n = 4
    xs = [0.0, 0.0, 1.0, 2.0, 1.0]  # 1-based; group = residues 1,2,3 collinear; residue 4 obstacle
    ys = [0.0, 0.0, 0.0, 0.0, 0.2]  # obstacle (4) dropped right on residue 2
    pairs: list = []
    group = [[0, 1, 2]]  # 0-based residues 1,2,3
    before = sorted(round(math.hypot(xs[a] - xs[b], ys[a] - ys[b]), 4) for a in (1, 2, 3) for b in (1, 2, 3))
    dx, dy = br._declash(xs, ys, pairs, n, rigid_groups=group, iters=200)
    after = sorted(round(math.hypot(dx[a] - dx[b], dy[a] - dy[b]), 4) for a in (1, 2, 3) for b in (1, 2, 3))
    assert after == before  # internal pairwise geometry preserved exactly -> stayed rigid
    L = br._median_step(dx, dy)
    assert math.hypot(dx[2] - dx[4], dy[2] - dy[4]) >= 0.5 * L  # the obstacle was cleared
    assert all(math.isfinite(v) for v in dx[1 : n + 1] + dy[1 : n + 1])


def test_route_arc_picks_the_clear_side_of_an_obstacle():
    # The collision-aware router bows a connector to whichever side is open: with an obstacle just
    # below the chord, the run (2,3,4) between anchors 1 and 5 must bow UP. (The user's stagger
    # idea: score both even-arc bows against the obstacle field, keep the clear one.) Anchors stay put.
    xs = [0.0, 0.0, 3.3, 5.0, 6.7, 10.0]  # 1-based; lo=1 at (0,0), run 2,3,4, hi=5 at (10,0)
    ys = [0.0, 0.0, -3.0, -3.0, -3.0, 0.0]  # run currently sits low, on top of the obstacle
    obs = np.array([[5.0, -3.0]])  # obstacle just below the chord midpoint
    br._route_arc(xs, ys, 2, 4, 1, 5, med=5.0, cen=(5.0, -1.0), obs=obs)
    assert all(ys[k] > 0 for k in (2, 3, 4))  # bowed UP, away from the obstacle below
    assert (xs[1], ys[1]) == (0.0, 0.0) and (xs[5], ys[5]) == (10.0, 0.0)  # anchors untouched


def test_route_tail_reverse_orders_from_the_anchor_inward():
    # A 5' (reverse) tail's anchor is hi = e+1: the router must seat the residue NEAREST the anchor
    # one step away and walk INWARD to s -- not the far end (the ordering fix that stops a giant
    # backbone jump at the anchor). Re-routed onto a clear ray, every step ~one median (no break).
    n = 5
    xs = [0.0, 9.0, 6.0, 3.0, 0.0, -5.0]  # 1-based; tail = 1,2,3; anchor hi = 4 at (0,0)
    ys = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    obs = np.array([[3.0, 0.0]])  # sits on residue 3's current spot -> forces a re-route
    br._route_tail(xs, ys, 1, 3, 4, med=3.0, n=n, partner={}, cen=(0.0, 10.0), obs=obs,
                   outward=True, reverse=True)
    assert math.hypot(xs[3] - xs[4], ys[3] - ys[4]) <= 1.5 * 3.0  # residue 3 stays adjacent to anchor 4
    steps = [math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(2, 5)]
    assert max(steps) <= 1.5 * 3.0  # no backbone break anywhere along the tail or at the anchor


# --- compact serpentine routing of LONG single strands -----------------------
#
# The user's "dynamic looping / staggering" ask: a long straight tail (a dangling ray of k*L) or a
# slacky wide arc inflates the drawing box. The routers fold those into a compact serpentine/meander
# while leaving short, already-tight, or genuinely TAUT runs exactly as drawn (do no harm).


def test_serpentine_pts_folds_a_long_tail_compact_and_continuous():
    # 20 residues snaked into boustrophedon rows: the block's bbox diagonal is far smaller than the
    # k*L straight ray, every backbone step stays continuous, and no two glyphs overlap themselves.
    med = 10.0
    pts = br._serpentine_pts((0.0, 0.0), (1.0, 0.0), 20, med, 5, 1)
    assert len(pts) == 20
    assert br._run_extent(pts) < 0.5 * 20 * med           # << straight-ray extent (200)
    assert br._run_continuous((0.0, 0.0), pts, med)        # joins the anchor + folds without a break
    assert br._self_clear(pts, med)                        # rows spaced far enough apart


def test_meander_pts_hugs_the_chord_for_a_slacky_run():
    # A mildly-slacky interior run (chord 100, k 20) folds into a tight sawtooth hugging the chord:
    # both ends land on their anchors and the band is far more compact than the wide arc it replaces.
    med = 10.0
    pts = br._meander_pts((0.0, 0.0), (100.0, 0.0), 20, med, 1)
    assert pts is not None and len(pts) == 20 and br._self_clear(pts, med)
    assert br._run_extent(pts) < 1.3 * 100                 # hugs the chord, no big outward bulge
    assert math.hypot(pts[0][0] - 0.0, pts[0][1] - 0.0) <= 2.2 * med   # leaves p0 continuously
    assert math.hypot(pts[-1][0] - 100.0, pts[-1][1] - 0.0) <= 2.2 * med  # lands on p1


def test_meander_pts_returns_none_when_not_slack():
    # When the residues span the chord at ~one step each there is no slack to fold -> None (the
    # caller keeps the even arc), and a too-slack sawtooth is dropped by the caller's self-clear gate.
    assert br._meander_pts((0.0, 0.0), (250.0, 0.0), 20, 10.0, 1) is None  # du >= med, not slack
    very_slack = br._meander_pts((0.0, 0.0), (40.0, 0.0), 20, 10.0, 1)     # du tiny -> sawtooth piles up
    assert very_slack is not None and not br._self_clear(very_slack, 10.0)  # rejected -> arc kept


def test_route_tail_folds_a_long_straight_tail():
    # A long, clear 3' tail drawn as a straight ray (extent ~k*L) is FOLDED into a compact block even
    # though it was already clear -- the bounding-box win the straight ray cannot give. Anchor stays.
    med, n = 10.0, 21
    xs = [0.0] + [float(i * 10) for i in range(n)]  # anchor = 1 at (0,0); tail 2..21 straight along +x
    ys = [0.0] + [0.0] * n
    obs = np.array([[0.0, 500.0]])  # far away: the straight ray is clear, so only compaction moves it
    before = br._run_extent([(xs[i], ys[i]) for i in range(2, 22)])
    br._route_tail(xs, ys, 2, 21, 1, med, n, {}, (-100.0, 0.0), obs, outward=True, reverse=False,
                   compact=True)
    tail = [(xs[i], ys[i]) for i in range(2, 22)]
    assert br._run_extent(tail) < 0.5 * before                       # folded much smaller
    assert br._self_clear(tail, med)                                  # no self-overlap
    assert math.hypot(xs[2] - xs[1], ys[2] - ys[1]) <= 2.2 * med      # residue 2 joins the anchor
    steps = [math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(2, 22)]
    assert max(steps) <= 2.2 * med                                   # no backbone break


def test_route_tail_does_not_fold_in_the_base_reflow():
    # Folding is gated to the final (compact) pass: with compact=False (the stems-only base reflow) a
    # long, clear tail is left as the straight ray, so the rigid-body stem declash settles against the
    # SAME single-strand field as before and the toggle's stem pin is untouched.
    med, n = 10.0, 21
    xs = [0.0] + [float(i * 10) for i in range(n)]
    ys = [0.0] + [0.0] * n
    bx, by = xs[:], ys[:]
    br._route_tail(xs, ys, 2, 21, 1, med, n, {}, (-100.0, 0.0), np.array([[0.0, 500.0]]),
                   outward=True, reverse=False, compact=False)
    assert xs == bx and ys == by  # straight ray kept (already clear) -> base reflow unchanged


def test_route_tail_keeps_a_short_tail_as_a_straight_ray():
    # Do no harm: a short (k < 8) tail that is already clear and continuous is left exactly as drawn,
    # never folded -- folding a 5-nt ray saves no meaningful space and would only add clutter.
    med, n = 10.0, 6
    xs = [0.0] + [float(i * 10) for i in range(n)]  # anchor 1; tail 2..6 straight, clear
    ys = [0.0] + [0.0] * n
    bx, by = xs[:], ys[:]
    br._route_tail(xs, ys, 2, 6, 1, med, n, {}, (-100.0, 0.0), np.array([[0.0, 500.0]]),
                   outward=True, reverse=False, compact=True)
    assert xs == bx and ys == by  # untouched even in the compact pass (k < 8)


def test_route_arc_folds_a_slacky_interior_run():
    # A long interior run whose anchors are close (chord 100, k 20) but which R2DT bowed into a wide
    # arc is folded into the tight sawtooth -- more compact, anchors untouched, every value finite.
    med, n = 10.0, 22
    xs = [0.0] * (n + 1)
    ys = [0.0] * (n + 1)
    xs[1], ys[1] = 0.0, 0.0
    xs[22], ys[22] = 100.0, 0.0
    for t, (px, py) in enumerate(br._turtle_pts((0.0, 0.0), (100.0, 0.0), 20, med, 1), start=1):
        xs[1 + t], ys[1 + t] = px, py  # seed the run on the wide R2DT-like arc
    pre = br._run_extent([(xs[i], ys[i]) for i in range(2, 22)])
    br._route_arc(xs, ys, 2, 21, 1, 22, med, (50.0, 0.0), np.array([[50.0, 1000.0]]), compact=True)
    post = br._run_extent([(xs[i], ys[i]) for i in range(2, 22)])
    assert post < pre                                       # the bulge folded inward
    assert (xs[1], ys[1]) == (0.0, 0.0) and (xs[22], ys[22]) == (100.0, 0.0)  # anchors fixed
    assert all(math.isfinite(v) for v in xs[1:] + ys[1:])


def test_route_arc_leaves_a_taut_run_straight():
    # Do no harm: a TAUT run (anchors genuinely far apart, chord 200 > 0.6*k*L) is not slacky -- a
    # meander cannot shrink that span -- so the clear straight placement is kept exactly as drawn.
    med, n = 10.0, 12
    xs = [0.0] * (n + 1)
    ys = [0.0] * (n + 1)
    xs[1], ys[1] = 0.0, 0.0
    xs[12], ys[12] = 200.0, 0.0
    for t in range(1, 11):
        xs[1 + t] = t * (200.0 / 11.0)  # run 2..11 evenly along the chord (~18 per step, no break)
    bx, by = xs[:], ys[:]
    br._route_arc(xs, ys, 2, 11, 1, 12, med, (100.0, 0.0), np.array([[100.0, 1000.0]]), compact=True)
    assert xs == bx and ys == by  # untouched


def test_best_compact_placement_prefers_compact_over_clearance():
    # Among candidates that clear the structure (>= 1.15*med) the picker takes the SMALLEST extent --
    # so a tight fold beats a sprawling-but-very-clear ray. When the fold is below the clearance
    # floor it loses, and the clearest candidate wins (legacy do-least-harm). Tuples: (clr, extent, pref, pts).
    med = 10.0
    assert br._best_compact_placement([(50.0, 200.0, 0, "ray"), (12.0, 20.0, 0, "fold")], med) == "fold"
    assert br._best_compact_placement([(50.0, 200.0, 0, "ray"), (5.0, 20.0, 0, "fold")], med) == "ray"


def test_serpentine_routing_is_deterministic():
    # No randomness / iteration-dependent relaxation: routing the same long tail twice is byte-
    # identical, which is what pins a shared single strand across the antiterm<->term toggle.
    med, n = 10.0, 21
    base_x = [0.0] + [float(i * 10) for i in range(n)]
    base_y = [0.0] + [0.0] * n
    obs = np.array([[20.0, 40.0], [0.0, 500.0]])
    runs = []
    for _ in range(2):
        xs, ys = base_x[:], base_y[:]
        br._route_tail(xs, ys, 2, 21, 1, med, n, {}, (-100.0, 0.0), obs, outward=True, reverse=False,
                       compact=True)
        runs.append((xs, ys))
    assert runs[0] == runs[1]


# --- stage 4: the full-length terminator graft -------------------------------
#
# graft_terminator_member folds a member's terminator hairpin onto its raw R2DT layout,
# keeping the canonical Stem I/II/III coordinates (so the antiterm<->term toggle pins the
# stems). The synthetic leader below is built so the terminator sequence is a UNIQUE
# substring at a known offset (the alignment the graft relies on), with an upstream stem
# pair kept and template pairs touching the switch region dropped.


def _term_fixture():
    """A synthetic (member, raw) pair: leader = upstream(10) + terminator(10) + tail(2),
    with an upstream stem (3,8), an 'at' span, and a simple terminator hairpin."""
    fasta = "AAGGCCAACC" + "TGCATGCATG" + "AA"  # 22 nt; term is a unique substring at [11,20]
    member = {
        "fasta_sequence": fasta,
        "term_sequence": "TGCATGCATG",  # -> leader positions 11..20
        "term_structure": "(((..))).." ,  # local (1,8)(2,7)(3,6) -> leader (11,18)(12,17)(13,16)
        "stems": [{"key": "i", "start": 2, "end": 9}, {"key": "at", "start": 11, "end": 14}],
    }
    raw = {
        "seq": br.to_rna(fasta),
        "x": [float(i * 10) for i in range(22)],
        "y": [0.0] * 22,
        "pairs": [[3, 8], [12, 21], [15, 19]],  # upstream stem kept; (12,21)(15,19) touch switch
        "template": "T-box",
        "source": "Rfam",
    }
    return member, raw


def test_graft_terminator_member_folds_terminator_keeps_stems_drops_switch():
    member, raw = _term_fixture()
    out = br.graft_terminator_member(raw, member)
    assert out is not None
    assert out["seq"] == raw["seq"] and len(out["x"]) == 22  # FULL leader, not the hairpin
    pairs = {tuple(p) for p in out["pairs"]}
    # terminator hairpin pairs, shifted into leader coordinates
    assert {(11, 18), (12, 17), (13, 16)} <= pairs
    assert (3, 8) in pairs  # upstream stem kept (outside the switch region)
    assert (12, 21) not in pairs and (15, 19) not in pairs  # template pairs touching the switch dropped
    assert all(math.isfinite(v) for v in out["x"] + out["y"])
    assert _max_step_ratio(out) < br.GRAFT_MAX_STEP_RATIO  # reflow keeps the backbone continuous


def test_graft_terminator_member_stem_coords_identical_to_antiterm_graft():
    # The headline invariant (issue #45): both grafts build the SAME declashed stems-only base,
    # so residues OUTSIDE both hairpin spans (the kept Stem) carry byte-identical coordinates
    # whether drawn by the antiterminator graft or the terminator graft -- toggling
    # antiterm<->term pins the stems. The shared base (not the raw coords) is what pins; on this
    # trivially-clean synthetic layout the base declash is a no-op (nothing to separate), so the
    # kept stem legitimately lands back on its raw position -- the corpus-scale guarantee that the
    # declash genuinely runs + moves real members lives in test_artifacts.py. Both grafts must
    # ACTUALLY fold their hairpin (non-degenerate) for this to be a real test, not a passthrough.
    fasta = "AACCGGTTAAGCGCTTAAGCGCTTAAGCAA"  # 30 nt; upstream stem (2,9), AT/term in [16,30]
    rawseq = br.to_rna(fasta)
    raw = {
        "seq": rawseq,
        "x": [float(i * 10) for i in range(30)],
        "y": [0.0] * 30,
        "pairs": [[2, 9]],
        "template": "T-box",
        "source": "Rfam",
    }
    wa = list("." * 30)
    for a_, b_ in [(2, 9), (16, 25), (17, 24), (18, 23)]:  # upstream stem + an AT hairpin
        wa[a_ - 1], wa[b_ - 1] = "(", ")"
    member_at = {
        "whole_antiterm_structure": "".join(wa),
        "stems": [{"key": "i", "start": 2, "end": 9}, {"key": "at", "start": 16, "end": 25}],
    }
    member_term = {
        "fasta_sequence": fasta,
        "term_sequence": rawseq[15:30].replace("U", "T"),  # leader positions 16..30
        "term_structure": "(((.......))).."[:15],
        "stems": [{"key": "i", "start": 2, "end": 9}, {"key": "at", "start": 16, "end": 25}],
    }
    a = br.graft_member(raw, member_at)
    t = br.graft_terminator_member(raw, member_term)
    assert a is not None and t is not None
    # both grafts genuinely fold a hairpin into the switch region (not a no-op passthrough)
    assert any(abs(a["y"][k]) > 1e-6 for k in range(15, 25))
    assert any(abs(t["y"][k]) > 1e-6 for k in range(15, 30))
    for r in (2, 9):  # 1-based; the kept upstream stem pair, on the shared base
        assert abs(a["x"][r - 1] - t["x"][r - 1]) <= 0.1  # the stems PIN across the toggle
        assert abs(a["y"][r - 1] - t["y"][r - 1]) <= 0.1


def test_graft_terminator_member_branched_uses_naview():
    pytest.importorskip("RNA")  # two side-by-side hairpins -> the ladder declines, NAView lays it out
    fasta = "AA" + "GGGAAACCCGGGAAACCC" + "AA"  # 22 nt; branched terminator at [3,20]
    member = {
        "fasta_sequence": fasta,
        "term_sequence": "GGGAAACCCGGGAAACCC",
        "term_structure": "(((...)))(((...)))",  # a multiloop / second hairpin
        "stems": [{"key": "at", "start": 3, "end": 20}],
    }
    raw = {
        "seq": br.to_rna(fasta),
        "x": [float(i * 10) for i in range(22)],
        "y": [0.0] * 22,
        "pairs": [],
        "template": None,
        "source": None,
    }
    out = br.graft_terminator_member(raw, member)
    assert out is not None
    pairs = {tuple(p) for p in out["pairs"]}
    assert {(3, 11), (4, 10), (5, 9), (12, 20), (13, 19), (14, 18)} <= pairs  # both hairpins folded
    assert all(math.isfinite(v) for v in out["x"] + out["y"])


def test_graft_terminator_member_rejects_unaligned_and_pairless():
    _, raw = _term_fixture()
    # term_sequence not a substring of the leader -> cannot place -> None
    assert br.graft_terminator_member(raw, {
        "fasta_sequence": "AAGGCCAACCTGCATGCATGAA", "term_sequence": "ZZZZZZZZZZ",
        "term_structure": "(((..)))..", "stems": [],
    }) is None
    # pairless / unbalanced / length-mismatched terminators -> None
    base = {"fasta_sequence": "AAGGCCAACCTGCATGCATGAA", "stems": []}
    assert br.graft_terminator_member(raw, {**base, "term_sequence": "TGCATGCATG", "term_structure": ".........."}) is None
    assert br.graft_terminator_member(raw, {**base, "term_sequence": "TGCATGCATG", "term_structure": "(((..(((.."}) is None
    assert br.graft_terminator_member(raw, {**base, "term_sequence": "TGCA", "term_structure": "(((..))).."}) is None


def test_terminator_driver_grafts_clears_stale_writes_manifest_and_drops(tmp_path: Path):
    member, raw = _term_fixture()
    members = {
        "T0001.m1": member,  # graftable
        "T0001.m2": {"fasta_sequence": "ACGT", "term_sequence": "ACGT", "term_structure": "(())", "stems": []},  # raw seq mismatch
        "T0001.m3": {"fasta_sequence": br.to_rna(raw["seq"]).replace("U", "T"), "term_sequence": None, "term_structure": None, "stems": []},  # no terminator
    }
    raw_snapshot = {
        "T0001.m1": raw,
        "T0001.m2": {"seq": "AAAA", "x": [0.0, 10, 20, 30], "y": [0.0] * 4, "pairs": [], "template": None, "source": None},
        "T0001.m3": {"seq": raw["seq"], "x": raw["x"], "y": raw["y"], "pairs": [], "template": None, "source": None},
    }
    raw_path = tmp_path / "r2dt_raw.json"
    raw_path.write_text(json.dumps(raw_snapshot))
    out = tmp_path / "term"
    out.mkdir()
    (out / "STALE.json").write_text("{}")  # must be cleared

    n, dropped = br.terminator(raw_path, members, out)

    assert n == 1
    assert (out / "T0001.m1.json").exists()
    assert not (out / "T0001.m2.json").exists()  # raw/fasta sequence mismatch
    assert not (out / "T0001.m3.json").exists()  # no drawable terminator
    assert not (out / "STALE.json").exists()  # stale file cleared
    manifest = json.loads((out / "manifest.json").read_text())
    assert manifest["count"] == 1 and list(manifest["diagrams"]) == ["T0001.m1"]
    assert any("T0001.m2" in d and "sequence" in d for d in dropped)
    assert any("T0001.m3" in d for d in dropped)


def test_spread_coincident_separates_overlapping_residues():
    # two residues dropped onto one coordinate (idx 1 & 3, with 2 between) are pushed
    # at least min_dist apart; the adjacent (idx 1 & 2) coincidence is also resolved.
    cx = [0.0, 10.0, 10.0, 10.0, 20.0]
    cy = [0.0, 0.0, 0.0, 0.0, 5.0]
    br._spread_coincident(cx, cy, min_dist=6.0)
    dists = [
        math.hypot(cx[i] - cx[j], cy[i] - cy[j])
        for i in range(len(cx))
        for j in range(i + 1, len(cx))
    ]
    assert min(dists) >= 6.0 - 0.5  # no two residues share (or nearly share) a point
    assert all(math.isfinite(v) for v in cx + cy)
