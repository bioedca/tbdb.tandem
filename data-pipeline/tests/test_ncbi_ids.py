"""Tests for ncbi_ids.py -- the pure parsers for the downstream-id operon strings and
the member_names genomic spans. No network, no I/O; runs in CI.

The fixture strings are the real shapes seen in the committed deliverables / the
read-only tandem_tbox_FINAL.tsv (see ncbi_ids.py docstring), plus a light check
against the committed public/data so the parser keeps matching real data.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

import ncbi_ids as nid

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "public" / "data"


class TestParseDownstreamId:
    def test_protein_accession_plus_wgs_locus_tag(self) -> None:
        genes = nid.parse_downstream_id("gb|OLE31895.1||gnl|WGS:MNJJ|AUG45_11735")
        assert len(genes) == 1
        assert genes[0].protein_id == "OLE31895.1"
        assert genes[0].locus_tag == "AUG45_11735"
        assert genes[0].raw == "gb|OLE31895.1||gnl|WGS:MNJJ|AUG45_11735"

    def test_semicolon_operon_keeps_order(self) -> None:
        genes = nid.parse_downstream_id(
            "gb|OLE31895.1||gnl|WGS:MNJJ|AUG45_11735;gb|OLE31896.1||gnl|WGS:MNJJ|AUG45_11740"
        )
        assert [g.protein_id for g in genes] == ["OLE31895.1", "OLE31896.1"]
        assert [g.locus_tag for g in genes] == ["AUG45_11735", "AUG45_11740"]

    def test_protein_only_tokens(self) -> None:
        assert nid.parse_downstream_id("gb|OIK09050.1|") == [
            nid.DownstreamGeneId(raw="gb|OIK09050.1|", protein_id="OIK09050.1", locus_tag=None)
        ]
        # other db tags resolve identically
        assert nid.parse_downstream_id("dbj|BAM48243.1|")[0].protein_id == "BAM48243.1"
        assert nid.parse_downstream_id("emb|CAB12345.1|")[0].protein_id == "CAB12345.1"
        assert nid.parse_downstream_id("ref|WP_000000.1|")[0].protein_id == "WP_000000.1"

    def test_blank_and_none(self) -> None:
        assert nid.parse_downstream_id("") == []
        assert nid.parse_downstream_id(None) == []
        assert nid.parse_downstream_id("   ") == []
        # stray separators don't create empty genes
        assert nid.parse_downstream_id(";;") == []

    def test_unparseable_token_still_appears_with_none_keys(self) -> None:
        # a token with neither a db tag nor a gnl id is preserved so callers can warn on it
        genes = nid.parse_downstream_id("something-weird")
        assert genes == [
            nid.DownstreamGeneId(raw="something-weird", protein_id=None, locus_tag=None)
        ]

    def test_first_of_each_key_wins(self) -> None:
        # a pathological doubled seqid: take the first protein + first locus tag
        genes = nid.parse_downstream_id("gb|AAA111.1||gb|BBB222.2||gnl|DB|TAG_1|gnl|DB|TAG_2")
        assert genes[0].protein_id == "AAA111.1"
        assert genes[0].locus_tag == "TAG_1"


class TestParseMemberNameSpan:
    def test_plus_strand_span_ascending(self) -> None:
        span = nid.parse_member_name_span("MNJJ01000215.1:16451-16752")
        assert span is not None
        assert span.accession == "MNJJ01000215.1"
        assert span.bare_accession == "MNJJ01000215"
        assert (span.start, span.end) == (16451, 16752)

    def test_minus_strand_span_keeps_start_greater_than_end(self) -> None:
        span = nid.parse_member_name_span("KI535340.1:970302-970013")
        assert span is not None
        assert (span.start, span.end) == (970302, 970013)
        assert span.start > span.end  # minus strand: 5' end is the larger coord, verbatim

    def test_non_matching_returns_none(self) -> None:
        assert nid.parse_member_name_span("not a span") is None
        assert nid.parse_member_name_span("") is None
        assert nid.parse_member_name_span(None) is None
        assert nid.parse_member_name_span("ACC:12-") is None

    def test_parse_member_names_operon(self) -> None:
        spans = nid.parse_member_names(
            "MNJJ01000215.1:16451-16752;MNJJ01000215.1:16781-17090"
        )
        assert len(spans) == 2
        assert spans[0].start == 16451 and spans[1].end == 17090
        assert nid.parse_member_names("") == []
        # a malformed token is dropped, the good one kept
        assert len(nid.parse_member_names("junk;MNJJ01000215.1:1-2")) == 1


class TestAgainstCommittedData:
    """Light contract check: every non-blank downstream id in the committed loci.json
    parses to at least one gene, and ~every gene exposes a protein accession (the
    primary NCBI resolution key) -- so the parser keeps matching the real corpus."""

    def test_loci_downstream_ids_parse(self) -> None:
        loci_path = DATA / "loci.json"
        if not loci_path.exists():  # pragma: no cover - committed artifact always present
            pytest.skip("loci.json not committed")
        loci = json.loads(loci_path.read_text())["loci"]
        with_id = 0
        with_protein = 0
        total_genes = 0
        for locus in loci:
            raw = locus.get("downstream_id")
            if not raw:
                continue
            with_id += 1
            genes = nid.parse_downstream_id(raw)
            assert genes, f"{locus['tandem_id']}: non-blank downstream_id parsed to nothing"
            total_genes += len(genes)
            with_protein += sum(1 for g in genes if g.protein_id)
        assert with_id > 0
        # the overwhelming majority of real operon genes carry a protein accession
        assert with_protein >= 0.9 * total_genes
