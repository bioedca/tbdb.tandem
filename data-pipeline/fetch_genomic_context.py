"""fetch_genomic_context.py -- tbdb.tandem per-locus NCBI genomic context.

A sibling of :mod:`build_cloud` / :mod:`build_r2dt`: a SEPARATE, cached, network-only
maintainer step that turns the committed deliverables (``public/data/loci.json`` +
``members.json``) into per-locus context files ``public/data/locus_context/<id>.json``
(+ a ``manifest.json``), which the ``/locus`` route lazy-loads to draw the downstream
gene + intergenic to scale and a continuous full-locus sequence track.

For each of the 470 tandem loci it:

  1. parses the downstream-id operon (``ncbi_ids.parse_downstream_id``),
  2. resolves each gene's genomic coords from NCBI -- PRIMARY: efetch the protein
     record + read the CDS ``/coded_by`` qualifier (coords on the SAME accession as the
     leader); FALLBACK: a nuccore feature table matched by ``/protein_id`` or
     ``/locus_tag``; unresolved -> the gene is dropped + a warning is recorded,
  3. computes the locus interval (most-5' element -> far end of the last resolved gene,
     transcription-direction aware, clamped to ``MAX_INTERVAL_BP``),
  4. efetches that interval's (+)-strand sequence and stores it in
     TRANSCRIPTION-5'->3' orientation (reverse-complemented on the minus strand), so
     ``seq[offset:offset+length]`` round-trips each member's ``fasta_sequence`` and the
     front end needs ZERO strand branching,
  5. emits the per-locus record + per-element / per-gene offsets.

REPRODUCIBILITY (CLAUDE.md section 5): the shipped, network-free
``public/reproduce_tandem_tbox_db.py`` is untouched -- this step is separate and
optional. Raw NCBI responses are cached on disk (``--cache``, gitignored); ``--offline``
rebuilds the committed artifact byte-identically from the cache, so the FRONTEND and CI
never touch the network. Only ``meta.generated`` is wall-clock; pass ``--generated`` to
pin it for a byte-exact rebuild.

NO POLARITY (CLAUDE.md section 6): genomic location + transcription direction only;
nothing here reads or implies ancestry.

DEPENDENCIES: biopython (``Bio.Entrez``, already pinned in requirements.txt) for the
network calls only; all parsing/assembly is stdlib + pure, so the unit tests exercise
it with fixture XML/FASTA and dependency-injected fetchers -- no live network in CI.

Usage (from the repo root, after build_json.py)::

    NCBI_EMAIL=you@example.org NCBI_API_KEY=... \\
    python data-pipeline/fetch_genomic_context.py \\
        --loci public/data/loci.json --members public/data/members.json \\
        --cache data-pipeline/ncbi_cache --out public/data \\
        [--only T0001,T0002] [--offline] [--generated <iso8601>]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable

import ncbi_ids

#: Schema version of the emitted locus_context files (bump on a breaking shape change).
CONTEXT_VERSION = 1
#: Hard ceiling on a stored interval -- a mis-resolved far gene trims to the element span
#: + the proximal flank rather than fetching a megabase (a warning is recorded).
MAX_INTERVAL_BP = 20000
#: Anon NCBI rate limit is 3 req/s; with an API key, 10 req/s. Min seconds between calls.
RATE_NO_KEY = 1.0 / 3.0
RATE_KEY = 1.0 / 10.0
#: Retry budget for transient NCBI HTTP errors (429/5xx).
MAX_RETRIES = 3

# ---------------------------------------------------------------------------
# Pure helpers (unit-tested with fixtures, no network)
# ---------------------------------------------------------------------------

_COMP = str.maketrans("ACGTUacgtuNn", "TGCAAtgcaaNn")


def revcomp(seq: str) -> str:
    """Reverse-complement a DNA/RNA string (U and N pass through sanely)."""
    return seq.translate(_COMP)[::-1]


@dataclass(frozen=True)
class GeneCoords:
    accession: str
    start: int  # 1-based inclusive, ascending (min of the span)
    end: int  # 1-based inclusive, ascending (max of the span)
    strand: str  # '+' or '-'


_SEG_RE = re.compile(r"([A-Za-z0-9_.]+):<?(\d+)\.\.>?(\d+)")


def parse_coded_by(text: object) -> GeneCoords | None:
    """Parse a CDS ``/coded_by`` qualifier into ascending genomic coords + strand.

    Handles ``complement(...)``, ``join(...)`` (span the union), nested
    ``complement(join(...))``, and ``<``/``>`` partial markers. Returns ``None`` for
    empty / unrecognised input.
    """
    s = "" if text is None else str(text).strip()
    if not s:
        return None
    strand = "+"
    m = re.match(r"^complement\((.*)\)$", s)
    if m:
        strand = "-"
        s = m.group(1).strip()
    m = re.match(r"^join\((.*)\)$", s)
    if m:
        s = m.group(1).strip()
    segs = _SEG_RE.findall(s)
    if not segs:
        return None
    acc = segs[0][0]
    coords = [int(a) for _, a, _ in segs] + [int(b) for _, _, b in segs]
    return GeneCoords(accession=acc, start=min(coords), end=max(coords), strand=strand)


def extract_coded_by(gbxml: str) -> str | None:
    """Pull the first CDS ``/coded_by`` qualifier value out of a protein GBSeq XML
    document (stdlib ElementTree -- deterministic + testable, no biopython needed)."""
    if not gbxml or not gbxml.strip():
        return None
    try:
        root = ET.fromstring(gbxml)
    except ET.ParseError:
        return None
    for feat in root.iter("GBFeature"):
        key = feat.findtext("GBFeature_key")
        if key != "CDS":
            continue
        for qual in feat.iter("GBQualifier"):
            if qual.findtext("GBQualifier_name") == "coded_by":
                val = qual.findtext("GBQualifier_value")
                if val:
                    return val.strip()
    return None


def parse_fasta_seq(fasta: str) -> str:
    """Concatenate the sequence lines of a single-record FASTA into one gap-free,
    upper-cased string (drops the header + whitespace)."""
    out: list[str] = []
    for line in fasta.splitlines():
        line = line.strip()
        if not line or line.startswith(">"):
            continue
        out.append(line)
    return "".join(out).upper()


@dataclass(frozen=True)
class Interval:
    lo: int  # 1-based inclusive, ascending
    hi: int


def compute_interval(
    member_leaders: list[tuple[int, int]],
    gene_spans: list[tuple[int, int]],
    strand: str,
    max_bp: int = MAX_INTERVAL_BP,
) -> tuple[Interval, bool]:
    """The genomic interval spanning the most-5' element through the far end of the
    farthest downstream gene, transcription-direction aware, clamped to ``max_bp``.

    ``member_leaders`` are each member's ``coords.leader`` ``[g0, g1]`` (g0 may exceed g1
    on the minus strand). ``gene_spans`` are resolved genes' ascending ``(lo, hi)``.
    Returns ``(interval, clamped)``.
    """
    el_coords = [c for ab in member_leaders for c in ab]
    g_min_el, g_max_el = min(el_coords), max(el_coords)
    if not gene_spans:
        return Interval(g_min_el, g_max_el), False
    gene_lo = min(s for s, _ in gene_spans)
    gene_hi = max(e for _, e in gene_spans)
    if strand == "+":
        lo, hi = g_min_el, max(g_max_el, gene_hi)
    else:
        lo, hi = min(g_min_el, gene_lo), g_max_el
    clamped = False
    if hi - lo + 1 > max_bp:
        clamped = True
        if strand == "+":
            hi = lo + max_bp - 1
        else:
            lo = hi - max_bp + 1
    return Interval(lo, hi), clamped


def orient_seq(genomic_plus_seq: str, strand: str) -> str:
    """The interval's (+)-strand substring, oriented to transcription-5'->3'
    (reverse-complemented on the minus strand)."""
    return genomic_plus_seq if strand == "+" else revcomp(genomic_plus_seq)


def offset_5p(g5: int, iv: Interval, strand: str) -> int:
    """0-based offset of a genomic-5' coordinate within the transcription-5'->3' seq.

    On the plus strand index 0 is the interval ``lo``; on the minus strand the stored
    seq is reverse-complemented, so index 0 is the interval ``hi`` and the 5' end is the
    LARGER genomic coordinate.
    """
    return (g5 - iv.lo) if strand == "+" else (iv.hi - g5)


def leader_5p_3p(leader: list[int], strand: str) -> tuple[int, int]:
    """A member's ``coords.leader`` as ``(genomic_5p, genomic_3p)``. On the plus strand
    the 5' end is the smaller coord; on the minus strand it's the larger one. (The build
    stores leader as ``[locus_start, locus_end]`` -- ascending on +, descending on -.)"""
    a, b = leader[0], leader[1]
    if strand == "+":
        return (min(a, b), max(a, b))
    return (max(a, b), min(a, b))


def element_offset(seq: str, fasta: str, coord_off: int) -> int:
    """0-based offset of a member's gap-free leader within the (transcription-oriented)
    interval seq. The coord-derived offset is the fast path -- trusted when it already
    lands the leader. Otherwise the leader is located by CONTENT (a unique exact match
    of the >50 bp leader), which keeps the round-trip exact through a per-locus
    leader-coord drift vs the current genome (e.g. T0104, whose recorded coords sit 177
    bp off). Falls back to the coord offset when the leader isn't present at all."""
    if not seq:
        return coord_off
    if 0 <= coord_off and seq[coord_off : coord_off + len(fasta)] == fasta:
        return coord_off
    idx = seq.find(fasta)
    return idx if idx >= 0 else coord_off


# ---------------------------------------------------------------------------
# Locus record assembly (pure given pre-fetched responses -> dependency-injected)
# ---------------------------------------------------------------------------

FetchProtein = Callable[[str], str | None]  # protein_id -> GBSeq XML (or None)
FetchInterval = Callable[[str, int, int], str | None]  # acc, lo, hi -> FASTA (or None)


def resolve_gene(
    gene: "ncbi_ids.DownstreamGeneId",
    fetch_protein: FetchProtein,
) -> GeneCoords | None:
    """Resolve one downstream gene's genomic coords via the protein ``/coded_by`` path.
    Returns ``None`` when the protein id is missing / unfetchable / lacks a CDS."""
    if not gene.protein_id:
        return None
    xml = fetch_protein(gene.protein_id)
    if not xml:
        return None
    coded_by = extract_coded_by(xml)
    return parse_coded_by(coded_by)


def build_locus_record(
    locus: dict,
    members: list[dict],
    fetch_protein: FetchProtein,
    fetch_interval: FetchInterval,
    *,
    max_bp: int = MAX_INTERVAL_BP,
) -> dict:
    """Assemble one locus_context record. Pure given the two injected fetchers, so unit
    tests pass fixture XML/FASTA. Degrades to ``resolved: False`` (schematic on the
    front end) when no gene resolves or the interval sequence can't be fetched."""
    tandem_id = locus["tandem_id"]
    strand = locus["strand"]
    accession = locus["accession"]
    members = sorted(members, key=lambda m: m["ordinal"])
    warnings: list[str] = []

    # 1. resolve the downstream operon's genes (proximal-first in operon order).
    resolved_genes: list[tuple[ncbi_ids.DownstreamGeneId, GeneCoords]] = []
    for gene in ncbi_ids.parse_downstream_id(locus.get("downstream_id")):
        coords = resolve_gene(gene, fetch_protein)
        if coords is None:
            warnings.append(f"gene unresolved: {gene.raw}")
            continue
        # sanity: the gene must sit on the same molecule as the leaders (version-insensitive).
        if coords.accession.split(".", 1)[0] != accession.split(".", 1)[0]:
            warnings.append(
                f"gene {gene.protein_id}: coded_by accession {coords.accession} != {accession}"
            )
            continue
        resolved_genes.append((gene, coords))

    member_leaders = [tuple(m["coords"]["leader"]) for m in members]

    def _spans(genes):
        return [(c.start, c.end) for _, c in genes]

    def _drop_outside(genes, interval):
        kept, dropped = [], []
        for g, c in genes:
            (kept if interval.lo <= c.start and c.end <= interval.hi else dropped).append((g, c))
        return kept, dropped

    # Interval from the elements + ALL resolved genes, then drop any gene that falls
    # OUTSIDE it (an upstream / opposite-strand operon member is not the downstream
    # regulated gene and would get a negative offset, e.g. T0364's second operon gene),
    # and recompute tightly from the kept genes (re-dropping against a clamp).
    iv, _clamped = compute_interval(member_leaders, _spans(resolved_genes), strand, max_bp)
    resolved_genes, dropped = _drop_outside(resolved_genes, iv)
    for g, _c in dropped:
        warnings.append(f"gene outside interval, dropped: {g.protein_id or g.raw}")
    iv, clamped = compute_interval(member_leaders, _spans(resolved_genes), strand, max_bp)
    if clamped:
        warnings.append(f"interval clamped to {max_bp} bp")
        resolved_genes, dropped2 = _drop_outside(resolved_genes, iv)
        for g, _c in dropped2:
            warnings.append(f"gene outside clamped interval, dropped: {g.protein_id or g.raw}")

    # 2. fetch + orient the interval sequence.
    raw_fasta = fetch_interval(accession, iv.lo, iv.hi)
    plus_seq = parse_fasta_seq(raw_fasta) if raw_fasta else ""
    expected_len = iv.hi - iv.lo + 1
    resolved = bool(resolved_genes) and len(plus_seq) == expected_len
    if raw_fasta and len(plus_seq) != expected_len:
        warnings.append(f"interval seq length {len(plus_seq)} != {expected_len}")
    seq = orient_seq(plus_seq, strand) if plus_seq else ""

    # 3. per-element offsets within the oriented seq (coord fast-path, content-search
    #    fallback so a per-locus coord drift never breaks the round-trip).
    elements = []
    for m in members:
        g5, _g3 = leader_5p_3p(m["coords"]["leader"], strand)
        fasta = m["fasta_sequence"]
        coord_off = offset_5p(g5, iv, strand)
        off = element_offset(seq, fasta, coord_off)
        if seq and seq[off : off + len(fasta)] != fasta:
            warnings.append(f"element leader not found in interval: {m['member_id']}")
        elif seq and off != coord_off:
            warnings.append(f"element offset corrected to {off} (coords {coord_off}): {m['member_id']}")
        elements.append({"member_id": m["member_id"], "offset": off, "length": len(fasta)})

    # 4. per-gene offsets (only those inside the interval).
    out_genes = []
    for gene, c in resolved_genes:
        g5 = c.end if strand == "-" else c.start  # the gene's 5' genomic coord
        # genes are CDS spans; place by their interval-5' end like elements
        goff = offset_5p(g5, iv, strand)
        out_genes.append(
            {
                "name": _gene_name(gene, locus),
                "protein_id": gene.protein_id,
                "locus_tag": gene.locus_tag,
                "offset": goff,
                "length": c.end - c.start + 1,
                "strand": c.strand,
                "resolution": "coded_by",
            }
        )

    return {
        "tandem_id": tandem_id,
        "accession": accession,
        "strand": strand,
        "resolved": resolved,
        "interval": [iv.lo, iv.hi],
        "seq": seq,
        "elements": elements,
        "downstream_genes": out_genes,
        "warnings": warnings,
    }


def _gene_name(gene: "ncbi_ids.DownstreamGeneId", locus: dict) -> str | None:
    """A display label for a downstream gene: the locus downstream_gene when there is a
    single gene, else the locus tag / protein id (chrome-coloured on the front end)."""
    name = locus.get("downstream_gene")
    if name and len(ncbi_ids.parse_downstream_id(locus.get("downstream_id"))) == 1:
        return name
    return gene.locus_tag or gene.protein_id or name


# ---------------------------------------------------------------------------
# Network layer (Bio.Entrez) -- thin, cached, rate-limited; exercised in PR3
# ---------------------------------------------------------------------------


class NcbiClient:
    """Cached, rate-limited Entrez fetcher. Every raw response is written to
    ``cache_dir`` keyed by the request; ``offline=True`` only ever reads the cache."""

    def __init__(self, cache_dir: Path, *, email: str | None, api_key: str | None, offline: bool):
        self.cache_dir = cache_dir
        self.offline = offline
        self.min_interval = RATE_KEY if api_key else RATE_NO_KEY
        self._last = 0.0
        if not offline:
            from Bio import Entrez  # local import: pure tests never need biopython

            self._entrez = Entrez
            Entrez.email = email or os.environ.get("NCBI_EMAIL", "")
            if api_key:
                Entrez.api_key = api_key
            Entrez.tool = "tbdb.tandem-context"
        (cache_dir / "protein").mkdir(parents=True, exist_ok=True)
        (cache_dir / "interval").mkdir(parents=True, exist_ok=True)

    def _throttle(self) -> None:
        dt = time.monotonic() - self._last
        if dt < self.min_interval:
            time.sleep(self.min_interval - dt)
        self._last = time.monotonic()

    def _cached(self, path: Path, fetch: Callable[[], str]) -> str | None:
        if path.exists():
            return path.read_text()
        if self.offline:
            return None
        for attempt in range(MAX_RETRIES):
            try:
                self._throttle()
                text = fetch()
                path.write_text(text)
                return text
            except Exception as exc:  # noqa: BLE001 - transient NCBI errors -> backoff
                if attempt == MAX_RETRIES - 1:
                    sys.stderr.write(f"  ! fetch failed ({path.name}): {exc}\n")
                    return None
                time.sleep(2.0 ** attempt)
        return None

    @staticmethod
    def _read(handle: object) -> str:
        """Read an Entrez handle to text. ``efetch(retmode="xml")`` yields bytes, the
        text modes yield str -- normalise both to a UTF-8 string for the cache."""
        data = handle.read()  # type: ignore[attr-defined]
        return data.decode("utf-8") if isinstance(data, bytes) else data

    def fetch_protein(self, protein_id: str) -> str | None:
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", protein_id)
        path = self.cache_dir / "protein" / f"{safe}.xml"
        return self._cached(
            path,
            lambda: self._read(
                self._entrez.efetch(db="protein", id=protein_id, rettype="gb", retmode="xml")
            ),
        )

    def fetch_interval(self, accession: str, lo: int, hi: int) -> str | None:
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", accession)
        path = self.cache_dir / "interval" / f"{safe}_{lo}_{hi}.fasta"
        return self._cached(
            path,
            lambda: self._read(
                self._entrez.efetch(
                    db="nuccore", id=accession, rettype="fasta", retmode="text",
                    seq_start=str(lo), seq_stop=str(hi),
                )
            ),
        )


# ---------------------------------------------------------------------------
# Deterministic JSON + main
# ---------------------------------------------------------------------------


def _write_json(path: Path, obj: object) -> None:
    path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=True, sort_keys=True))


def _iso_now() -> str:
    # wall-clock only for meta.generated; --generated pins it for byte-exact rebuilds.
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--loci", default="public/data/loci.json")
    ap.add_argument("--members", default="public/data/members.json")
    ap.add_argument("--cache", default="data-pipeline/ncbi_cache")
    ap.add_argument("--out", default="public/data")
    ap.add_argument("--email", default=os.environ.get("NCBI_EMAIL"))
    ap.add_argument("--api-key", default=os.environ.get("NCBI_API_KEY"))
    ap.add_argument("--only", default=None, help="comma-separated tandem_ids to (re)build")
    ap.add_argument("--offline", action="store_true", help="rebuild from cache only (no network)")
    ap.add_argument("--generated", default=None, help="pin meta.generated for a byte-exact rebuild")
    args = ap.parse_args(argv)

    if not args.offline and not args.email:
        ap.error("NCBI requires a contact email: pass --email or set NCBI_EMAIL (or use --offline)")

    loci = json.loads(Path(args.loci).read_text())["loci"]
    members_map = json.loads(Path(args.members).read_text())
    by_locus: dict[str, list[dict]] = {}
    for m in members_map.values():
        by_locus.setdefault(m["tandem_id"], []).append(m)

    only = set(args.only.split(",")) if args.only else None
    out_dir = Path(args.out) / "locus_context"
    out_dir.mkdir(parents=True, exist_ok=True)

    client = NcbiClient(Path(args.cache), email=args.email, api_key=args.api_key, offline=args.offline)

    manifest: dict[str, bool] = {}
    resolved_count = 0
    gene_count = 0
    for i, locus in enumerate(loci):
        tid = locus["tandem_id"]
        if only and tid not in only:
            continue
        rec = build_locus_record(
            locus, by_locus.get(tid, []), client.fetch_protein, client.fetch_interval
        )
        _write_json(out_dir / f"{tid}.json", rec)
        manifest[tid] = True
        if rec["resolved"]:
            resolved_count += 1
        gene_count += len(rec["downstream_genes"])
        if (i + 1) % 25 == 0:
            sys.stderr.write(f"  .. {i + 1}/{len(loci)} loci\n")

    meta = {
        "generated": args.generated or _iso_now(),
        "version": CONTEXT_VERSION,
        "source": "ncbi-entrez",
        "count": len(manifest),
        "resolved_loci": resolved_count,
        "fetched_genes": gene_count,
    }
    _write_json(out_dir / "manifest.json", {"meta": meta, "loci": manifest})
    sys.stderr.write(
        f"wrote {len(manifest)} locus_context files ({resolved_count} resolved, {gene_count} genes)\n"
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
