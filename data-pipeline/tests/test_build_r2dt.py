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
    # the unanchored single strands flow apart. (The corpus-wide guarantee -- 0 hard clashes,
    # median helix-rail deviation ~0.1 of a step -- is enforced by the build over all 792
    # members; this test pins the mechanism end to end on one element.)
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


def test_aspect_matches_bounding_box():
    # points (0,0), (40,0), (40,10) -> a 40x10 bounding box -> aspect 4.0
    xs = [0.0, 0.0, 40.0, 40.0]  # 1-based [1..3]
    ys = [0.0, 0.0, 0.0, 10.0]
    assert br._aspect(xs, ys, 3) == pytest.approx(4.0)


def test_fill_is_disc_coverage_of_bbox():
    # 3 residues, 10u backbone step, in a 10x10 box -> three r=0.44*10 discs over area 100.
    # _fill is the wasteful-layout signal that routes a sprawled diagram to NAView.
    xs = [0.0, 0.0, 10.0, 10.0]  # 1-based [1..3]; steps 10,10 -> median 10
    ys = [0.0, 0.0, 0.0, 10.0]
    assert br._fill(xs, ys, 3) == pytest.approx(3 * math.pi * (0.44 * 10) ** 2 / (10 * 10), rel=1e-6)


def test_place_tail_preserves_curve_shape():
    # A tail keeps R2DT's curve (its per-step headings), it is NOT flattened into a
    # straight ray: an L-bend in the original stays a right angle after reattachment.
    xs = [0.0, 0.0, 10.0, 20.0, 20.0, 20.0]  # 1-based; idx 1 = anchor, idx 2..5 = tail
    ys = [0.0, 0.0, 0.0, 0.0, 10.0, 20.0]
    br._place_tail(xs, ys, 2, 5, 1, med=10.0, n=5, partner={})
    v1 = (xs[3] - xs[2], ys[3] - ys[2])  # first tail segment
    v2 = (xs[5] - xs[4], ys[5] - ys[4])  # last tail segment (was ⟂ to the first)
    assert abs(v1[0] * v2[0] + v1[1] * v2[1]) < 1e-6  # right angle preserved (shape kept)


def test_place_tail_closes_interior_break():
    # If R2DT's tail carries an interior jump (here a 3x-median step between idx 3 and
    # 4), retracing its headings at an even median step removes the discontinuity --
    # the reflow exists to make the backbone continuous, so no interior break may
    # survive in the served run (PR A review finding).
    xs = [0.0, 0.0, 10.0, 20.0, 50.0, 60.0]  # 1-based; anchor idx 1; tail 2..5; jump 3→4
    ys = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    br._place_tail(xs, ys, 2, 5, 1, med=10.0, n=5, partner={})
    steps = [math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(2, 6)]
    assert max(steps) <= 1.2 * 10.0  # every tail step ~one median apart (no 3x jump left)


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


def test_antiterm_graft_declashes_stems_terminator_keeps_raw():
    # The antiterminator graft now DECLASHES (relaxes overlaps), so its kept Stem I/II/III
    # coordinates move OFF the raw R2DT layout. The terminator graft still keeps the raw stems
    # verbatim. The two conformations therefore NO LONGER share byte-identical stems -- toggling
    # antiterm<->term shifts the stems by the declash amount; co-declashing the terminator onto
    # a shared declashed base (to re-pin them) is a tracked follow-up. Both grafts must ACTUALLY
    # fold their hairpin (non-degenerate) for this to be a real test, not a passthrough.
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
    for r in (2, 9):  # 1-based; the kept upstream stem pair
        # antiterminator graft DECLASHES it off the raw coords ...
        assert (a["x"][r - 1], a["y"][r - 1]) != (raw["x"][r - 1], raw["y"][r - 1])
        # ... while the terminator graft keeps it at the raw R2DT coords (the co-declash follow-up).
        assert (t["x"][r - 1], t["y"][r - 1]) == (raw["x"][r - 1], raw["y"][r - 1])


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
