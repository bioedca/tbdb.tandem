"""Pure parsers for the NCBI identifier strings the tandem pipeline carries, shared
by the genomic-context fetch step (``fetch_genomic_context.py``) and unit-tested here
with no network and no I/O.

Two string shapes, both already present in the committed deliverables / read-only
sources:

* **downstream_id** (loci.json / members.json ``downstream.id``) -- a ``;``-joined
  *operon* of NCBI pipe-delimited seqid concatenations, e.g.::

      gb|OLE31895.1||gnl|WGS:MNJJ|AUG45_11735;gb|OLE31896.1||gnl|WGS:MNJJ|AUG45_11740

  Each token concatenates a GenBank/EMBL/DDBJ protein seqid (``gb|ACCESSION.ver|``)
  with, when present, a ``gnl|DB|LOCUS_TAG`` general id. Some tokens carry only the
  protein accession (``gb|OIK09050.1|``, ``dbj|BAM48243.1|``). Both the protein
  accession and the locus tag are usable NCBI match keys for resolving the gene's
  genomic coordinates (the protein accession is the primary key; the locus tag is a
  feature-table fallback).

* **member_names span** (the read-only ``tandem_tbox_FINAL.tsv`` ``member_names``
  column, ``;``-joined per core) -- ``ACCESSION.version:start-end``, e.g.
  ``MNJJ01000215.1:16451-16752``. ``start`` may be GREATER than ``end`` on the minus
  strand (the 5' end is the larger coordinate); both are returned verbatim so the
  caller decides orientation.

NO POLARITY (CLAUDE.md section 6): these parsers describe genomic location +
transcription direction only; nothing here reads or implies ancestry.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: NCBI seqid database tags whose *next* pipe field is a sequence accession. Lower-cased
#: before lookup. Covers the tags that appear on T-box downstream protein ids plus the
#: common GenBank/EMBL/DDBJ/RefSeq/third-party/Swiss-Prot/PDB family for robustness.
DB_TAGS = frozenset(
    {"gb", "emb", "dbj", "ref", "tpg", "tpe", "tpd", "pdb", "sp", "pir", "prf", "gi"}
)


@dataclass(frozen=True)
class DownstreamGeneId:
    """One downstream gene parsed out of a ``downstream_id`` operon token."""

    raw: str
    protein_id: str | None
    locus_tag: str | None


@dataclass(frozen=True)
class MemberNameSpan:
    """One ``member_names`` token: an accession + a genomic span (start may be > end)."""

    accession: str
    start: int
    end: int

    @property
    def bare_accession(self) -> str:
        """The accession without its ``.version`` suffix (e.g. ``MNJJ01000215``)."""
        return self.accession.split(".", 1)[0]


def parse_downstream_id(value: object) -> list[DownstreamGeneId]:
    """Parse a ``;``-joined ``downstream_id`` operon string into ordered per-gene ids.

    Walks each token's pipe fields, reading the field after a known :data:`DB_TAGS`
    tag as the protein accession and the field after a ``gnl|DB|`` pair as the locus
    tag (first of each wins, so a concatenated seqid yields one gene). Returns the
    genes in operon order; blank / unparseable input yields ``[]``. A token with
    neither key still appears (both ``None``) so callers can count + warn on it.
    """
    text = "" if value is None else str(value).strip()
    if not text:
        return []
    out: list[DownstreamGeneId] = []
    for raw in (part.strip() for part in text.split(";")):
        if not raw:
            continue
        fields = raw.split("|")
        protein_id: str | None = None
        locus_tag: str | None = None
        i = 0
        n = len(fields)
        while i < n:
            tag = fields[i].strip().lower()
            if tag in DB_TAGS and i + 1 < n:
                acc = fields[i + 1].strip()
                if acc and protein_id is None:
                    protein_id = acc
                i += 2
                continue
            if tag == "gnl" and i + 2 < n:
                lt = fields[i + 2].strip()
                if lt and locus_tag is None:
                    locus_tag = lt
                i += 3
                continue
            i += 1
        out.append(DownstreamGeneId(raw=raw, protein_id=protein_id, locus_tag=locus_tag))
    return out


_SPAN_RE = re.compile(r"^(?P<acc>.+?):(?P<start>\d+)-(?P<end>\d+)$")


def parse_member_name_span(token: object) -> MemberNameSpan | None:
    """Parse one ``ACCESSION.version:start-end`` member-name token.

    Returns a :class:`MemberNameSpan` (``start``/``end`` as written -- ``start`` may be
    > ``end`` on the minus strand), or ``None`` if the token doesn't match the shape.
    """
    text = "" if token is None else str(token).strip()
    m = _SPAN_RE.match(text)
    if not m:
        return None
    return MemberNameSpan(
        accession=m.group("acc"),
        start=int(m.group("start")),
        end=int(m.group("end")),
    )


def parse_member_names(value: object) -> list[MemberNameSpan]:
    """Parse a ``;``-joined ``member_names`` cell into its per-core spans (dropping any
    token that doesn't match the ``ACCESSION:start-end`` shape)."""
    text = "" if value is None else str(value).strip()
    if not text:
        return []
    out: list[MemberNameSpan] = []
    for tok in (part.strip() for part in text.split(";")):
        span = parse_member_name_span(tok)
        if span is not None:
            out.append(span)
    return out
