"""Tests for the committed per-locus genomic context (public/data/locus_context/).

Pure, no network -- validates the artifact fetch_genomic_context.py emitted, so CI
guards it without ever touching NCBI. The load-bearing check is the round-trip: each
element's fasta_sequence is a substring of the locus interval seq at its stored offset
(so the front end's continuous track + per-element annotations land correctly).
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "public" / "data"
CTX_DIR = DATA / "locus_context"

pytestmark = pytest.mark.skipif(
    not (CTX_DIR / "manifest.json").exists(),
    reason="locus_context artifact not generated",
)


def _loci() -> list[dict]:
    return json.loads((DATA / "loci.json").read_text())["loci"]


def _members() -> dict:
    return json.loads((DATA / "members.json").read_text())


def _ctx(tid: str) -> dict:
    return json.loads((CTX_DIR / f"{tid}.json").read_text())


def test_every_locus_has_a_context_file() -> None:
    ids = {o["tandem_id"] for o in _loci()}
    files = {p.stem for p in CTX_DIR.glob("*.json") if p.name != "manifest.json"}
    assert ids == files, f"missing {ids - files}, extra {files - ids}"


def test_manifest_matches_files() -> None:
    manifest = json.loads((CTX_DIR / "manifest.json").read_text())
    files = {p.stem for p in CTX_DIR.glob("*.json") if p.name != "manifest.json"}
    assert set(manifest["loci"]) == files
    assert manifest["meta"]["count"] == len(files)
    assert manifest["meta"]["version"] >= 1


def test_interval_and_seq_lengths() -> None:
    for o in _loci():
        rec = _ctx(o["tandem_id"])
        lo, hi = rec["interval"]
        assert 1 <= lo <= hi, f"{o['tandem_id']}: bad interval {rec['interval']}"
        if rec["seq"]:
            assert len(rec["seq"]) == hi - lo + 1, f"{o['tandem_id']}: seq != interval span"
        assert rec["strand"] in ("+", "-")


def test_element_round_trip() -> None:
    """Each element's fasta_sequence lands at its offset in the interval seq (the
    transcription-5'->3' orientation invariant), on BOTH strands."""
    members = _members()
    checked = 0
    for o in _loci():
        rec = _ctx(o["tandem_id"])
        if not rec["seq"]:
            continue
        for el in rec["elements"]:
            fa = members[el["member_id"]]["fasta_sequence"]
            sub = rec["seq"][el["offset"] : el["offset"] + el["length"]]
            assert el["length"] == len(fa), f"{el['member_id']}: length != fasta len"
            assert sub == fa, f"{el['member_id']}: round-trip mismatch at offset {el['offset']}"
            assert 0 <= el["offset"] and el["offset"] + el["length"] <= len(rec["seq"])
            checked += 1
    assert checked > 0


def test_gene_offsets_in_range_and_resolved_has_gene() -> None:
    for o in _loci():
        rec = _ctx(o["tandem_id"])
        for g in rec["downstream_genes"]:
            assert g["strand"] in ("+", "-")
            assert g["offset"] >= 0
            if rec["seq"]:
                assert g["offset"] + g["length"] <= len(rec["seq"])
        if rec["resolved"]:
            assert rec["downstream_genes"], f"{o['tandem_id']}: resolved but no genes"


def test_no_polarity_language_in_keys() -> None:
    """Schema keys describe genomic location + transcription direction only -- never
    ancestry (CLAUDE.md section 6)."""
    forbidden = {"ancestral", "derived", "gained", "lost", "first", "then"}
    sample = _ctx(_loci()[0]["tandem_id"])
    keys = set(sample) | {k for g in sample["downstream_genes"] for k in g}
    assert not (keys & forbidden)
