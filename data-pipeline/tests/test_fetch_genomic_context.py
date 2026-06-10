"""Tests for fetch_genomic_context.py -- the PURE parsing/assembly logic (no network).

The Entrez network layer (NcbiClient) is exercised only when the maintainer runs the
script with credentials (its output -- the committed locus_context files -- is checked
by test_genomic_context.py). Here we pin the coded_by parser, the FASTA/XML extractors,
the interval + orientation + offset math, and the full `build_locus_record` assembly
via dependency-injected fixture fetchers -- including the load-bearing round-trip that
each member's fasta_sequence lands at its computed offset on BOTH strands.
"""

from __future__ import annotations

import fetch_genomic_context as fc


# --- coded_by parser -------------------------------------------------------
class TestParseCodedBy:
    def test_plus(self) -> None:
        assert fc.parse_coded_by("MNJJ01000215.1:16766..17890") == fc.GeneCoords(
            "MNJJ01000215.1", 16766, 17890, "+"
        )

    def test_minus_complement(self) -> None:
        assert fc.parse_coded_by("complement(KI535340.1:970013..970302)") == fc.GeneCoords(
            "KI535340.1", 970013, 970302, "-"
        )

    def test_join_spans_union(self) -> None:
        assert fc.parse_coded_by("join(ACC.1:1..100,ACC.1:200..300)") == fc.GeneCoords(
            "ACC.1", 1, 300, "+"
        )

    def test_complement_join_and_partials(self) -> None:
        assert fc.parse_coded_by("complement(join(ACC.2:50..100,ACC.2:200..250))") == fc.GeneCoords(
            "ACC.2", 50, 250, "-"
        )
        assert fc.parse_coded_by("ACC.1:<1..>200") == fc.GeneCoords("ACC.1", 1, 200, "+")

    def test_empty(self) -> None:
        assert fc.parse_coded_by("") is None
        assert fc.parse_coded_by(None) is None
        assert fc.parse_coded_by("garbage") is None


# --- XML / FASTA extractors ------------------------------------------------
GBXML = """<?xml version="1.0"?>
<GBSet><GBSeq>
  <GBSeq_feature-table>
    <GBFeature>
      <GBFeature_key>Protein</GBFeature_key>
      <GBFeature_quals><GBQualifier>
        <GBQualifier_name>product</GBQualifier_name>
        <GBQualifier_value>some protein</GBQualifier_value>
      </GBQualifier></GBFeature_quals>
    </GBFeature>
    <GBFeature>
      <GBFeature_key>CDS</GBFeature_key>
      <GBFeature_quals><GBQualifier>
        <GBQualifier_name>coded_by</GBQualifier_name>
        <GBQualifier_value>ACC1.1:155..160</GBQualifier_value>
      </GBQualifier></GBFeature_quals>
    </GBFeature>
  </GBSeq_feature-table>
</GBSeq></GBSet>"""


class TestExtractors:
    def test_extract_coded_by_picks_cds(self) -> None:
        assert fc.extract_coded_by(GBXML) == "ACC1.1:155..160"

    def test_extract_coded_by_none(self) -> None:
        assert fc.extract_coded_by("") is None
        assert fc.extract_coded_by("<GBSet></GBSet>") is None
        assert fc.extract_coded_by("not xml <<<") is None

    def test_parse_fasta_seq(self) -> None:
        fasta = ">ACC1.1:101-160 something\nAAAAACCCCC\nGGGGGTTTTT\n"
        assert fc.parse_fasta_seq(fasta) == "AAAAACCCCCGGGGGTTTTT"
        assert fc.parse_fasta_seq("") == ""


# --- interval / orientation / offset --------------------------------------
class TestIntervalMath:
    def test_plus_spans_to_gene_end(self) -> None:
        iv, clamped = fc.compute_interval([(16451, 16734), (16781, 17065)], [(17120, 17890)], "+")
        assert (iv.lo, iv.hi) == (16451, 17890) and not clamped

    def test_minus_spans_down_to_gene(self) -> None:
        iv, clamped = fc.compute_interval([(970302, 970013), (970580, 970294)], [(969100, 970000)], "-")
        assert (iv.lo, iv.hi) == (969100, 970580) and not clamped

    def test_no_gene_is_element_span(self) -> None:
        iv, clamped = fc.compute_interval([(100, 200), (300, 400)], [], "+")
        assert (iv.lo, iv.hi) == (100, 400) and not clamped

    def test_clamp(self) -> None:
        iv, clamped = fc.compute_interval([(1, 100)], [(50000, 50100)], "+", max_bp=5000)
        assert clamped and (iv.lo, iv.hi) == (1, 5000)

    def test_orient_and_offset_plus(self) -> None:
        plus = "AAAAACCCCCGGGGGTTTTT"
        iv = fc.Interval(1001, 1020)
        seq = fc.orient_seq(plus, "+")
        off = fc.offset_5p(1006, iv, "+")  # feature 5' at genomic 1006
        assert off == 5 and seq[off : off + 5] == "CCCCC"

    def test_leader_5p_3p(self) -> None:
        assert fc.leader_5p_3p([100, 200], "+") == (100, 200)
        assert fc.leader_5p_3p([200, 100], "-") == (200, 100)  # 5' is the larger coord on minus


# --- full record assembly (dependency-injected fetchers) -------------------
def _gbxml(coded_by: str) -> str:
    return (
        "<GBSet><GBSeq><GBSeq_feature-table><GBFeature>"
        "<GBFeature_key>CDS</GBFeature_key><GBFeature_quals><GBQualifier>"
        f"<GBQualifier_name>coded_by</GBQualifier_name><GBQualifier_value>{coded_by}</GBQualifier_value>"
        "</GBQualifier></GBFeature_quals></GBFeature></GBSeq_feature-table></GBSeq></GBSet>"
    )


class TestBuildLocusRecordPlus:
    def _fixture(self):
        # genomic (+)-strand interval [101..160] (60 bp)
        plus = ("ACGT" * 15)[:60]
        locus = {
            "tandem_id": "TT01",
            "accession": "ACC1",
            "strand": "+",
            "downstream_id": "gb|PROT1.1|",
            "downstream_gene": "geneX",
        }
        members = [
            {"member_id": "TT01.m1", "ordinal": 1, "coords": {"leader": [101, 120]},
             "fasta_sequence": plus[0:20]},   # plus strand: fasta == genomic slice
            {"member_id": "TT01.m2", "ordinal": 2, "coords": {"leader": [131, 150]},
             "fasta_sequence": plus[30:50]},
        ]
        proteins = {"PROT1.1": _gbxml("ACC1.1:155..160")}  # gene at [155..160], 6 bp
        fasta = f">ACC1.1:101-160\n{plus}\n"
        return plus, locus, members, proteins, fasta

    def test_record(self) -> None:
        plus, locus, members, proteins, fasta = self._fixture()
        rec = fc.build_locus_record(
            locus, members,
            fetch_protein=lambda pid: proteins.get(pid),
            fetch_interval=lambda acc, lo, hi: fasta,
        )
        assert rec["resolved"] is True
        assert rec["interval"] == [101, 160]
        assert rec["seq"] == plus  # plus strand: stored as-is
        # each element's fasta_sequence lands at its offset (the round-trip invariant)
        for m, el in zip(members, rec["elements"]):
            assert rec["seq"][el["offset"] : el["offset"] + el["length"]] == m["fasta_sequence"]
        assert [el["offset"] for el in rec["elements"]] == [0, 30]
        g = rec["downstream_genes"][0]
        assert g == {
            "name": "geneX", "protein_id": "PROT1.1", "locus_tag": None,
            "offset": 54, "length": 6, "strand": "+", "resolution": "coded_by",
        }
        assert rec["warnings"] == []


class TestBuildLocusRecordMinus:
    def test_minus_round_trip(self) -> None:
        # genomic (+)-strand interval [201..260] (60 bp); locus is MINUS.
        plus = ("GGTTCAAC" * 8)[:60]
        # stored seq must be transcription-5'->3' == revcomp(plus)
        expected_seq = fc.revcomp(plus)
        # element leaders on the minus strand: 5' end is the LARGER coord (descending).
        # m1 (most-5') leader [260..241]; m2 leader [240..221].
        m1_fasta = fc.revcomp(plus[40:60])  # genomic [241..260] -> 5'->3'
        m2_fasta = fc.revcomp(plus[20:40])  # genomic [221..240]
        locus = {
            "tandem_id": "TT02", "accession": "ACC2", "strand": "-",
            "downstream_id": "gb|PROT2.1|", "downstream_gene": "geneY",
        }
        members = [
            {"member_id": "TT02.m1", "ordinal": 1, "coords": {"leader": [260, 241]},
             "fasta_sequence": m1_fasta},
            {"member_id": "TT02.m2", "ordinal": 2, "coords": {"leader": [240, 221]},
             "fasta_sequence": m2_fasta},
        ]
        proteins = {"PROT2.1": _gbxml("complement(ACC2.1:201..210)")}  # gene at smaller coords
        fasta = f">ACC2.1:201-260\n{plus}\n"
        rec = fc.build_locus_record(
            locus, members,
            fetch_protein=lambda pid: proteins.get(pid),
            fetch_interval=lambda acc, lo, hi: fasta,
        )
        assert rec["resolved"] is True
        assert rec["interval"] == [201, 260]
        assert rec["seq"] == expected_seq  # reverse-complemented for the minus strand
        # the round-trip holds on the minus strand too: ordinal-1 lands at offset 0
        assert rec["elements"][0]["offset"] == 0
        assert rec["elements"][1]["offset"] == 20
        for m, el in zip(members, rec["elements"]):
            assert rec["seq"][el["offset"] : el["offset"] + el["length"]] == m["fasta_sequence"]
        g = rec["downstream_genes"][0]
        assert g["strand"] == "-" and g["length"] == 10
        # gene 5' (minus) = 210 -> offset = hi(260) - 210 = 50
        assert g["offset"] == 50


class TestBuildLocusRecordDegrades:
    def test_unresolved_gene_falls_back_to_schematic(self) -> None:
        locus = {
            "tandem_id": "TT03", "accession": "ACC3", "strand": "+",
            "downstream_id": "gb|MISSING.1|", "downstream_gene": "geneZ",
        }
        members = [{"member_id": "TT03.m1", "ordinal": 1, "coords": {"leader": [10, 29]},
                    "fasta_sequence": "A" * 20}]
        rec = fc.build_locus_record(
            locus, members,
            fetch_protein=lambda pid: None,            # protein never resolves
            fetch_interval=lambda acc, lo, hi: None,   # no interval seq either
        )
        assert rec["resolved"] is False
        assert rec["downstream_genes"] == []
        assert rec["seq"] == ""
        assert any("unresolved" in w for w in rec["warnings"])
        # element offsets are still computed (the interval falls back to the element span)
        assert rec["interval"] == [10, 29]
        assert rec["elements"][0] == {"member_id": "TT03.m1", "offset": 0, "length": 20}

    def test_gene_on_wrong_accession_is_distrusted(self) -> None:
        locus = {
            "tandem_id": "TT04", "accession": "ACC4", "strand": "+",
            "downstream_id": "gb|PROT4.1|", "downstream_gene": "geneW",
        }
        members = [{"member_id": "TT04.m1", "ordinal": 1, "coords": {"leader": [10, 29]},
                    "fasta_sequence": "C" * 20}]
        proteins = {"PROT4.1": _gbxml("OTHER9.1:1..30")}  # different molecule
        rec = fc.build_locus_record(
            locus, members,
            fetch_protein=lambda pid: proteins.get(pid),
            fetch_interval=lambda acc, lo, hi: ">x\n" + "C" * 20 + "\n",
        )
        assert rec["downstream_genes"] == []
        assert any("!= ACC4" in w for w in rec["warnings"])
