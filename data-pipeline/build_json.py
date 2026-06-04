"""build_json.py -- tbdb.tandem offline data build (PLAN section 5).

The deterministic local job that turns the two read-only TBDB source files into
the static JSON the app loads and the ``tree_input.fasta`` the cluster tree build
consumes. It is the single source of truth for member resolution and field
provenance -- get those right here, once (PLAN section 5).

    python3 data-pipeline/build_json.py --master <csv> --tandem <tsv> --out public/data

This file is built up across Phase 0 in document order:

* S0.3 -- member resolution + coordinate projection (PLAN section 5.1):
  reproduce the 470 loci as exactly 949 canonical members held in memory.
* S0.4 -- per-member field assembly + the two-tier function classifier ->
  ``loci.json`` + ``members.json`` (PLAN section 5.2, 5.3). ``loci.json`` emits
  ``mean_pairwise_identity`` as a ``null`` placeholder, backfilled at S0.5.
* S0.5 -- ``summary.json`` + ``identity.json`` (PLAN section 5.2, 3.1, 9 (2)).
  Computes the intra-locus pairwise %-identity (488 = Sum C(n_cores, 2) =
  461*1 + 9*3) with a Biopython global alignment (gaps count against -> flags
  recent vs ancient duplication), writes the flat 488-pair ``identity.json``,
  backfills each locus's ``mean_pairwise_identity`` in ``loci.json``, and writes
  the KPI/distribution ``summary.json`` (~2 KB).
* **S0.6 (this step)** -- the Stem-I length-gate (PLAN section 6) + the two
  tree-build FASTAs. ``tree_input.fasta`` holds one record per *gated* canonical
  member -- header = ``unique_name``, contents = the full per-element leader
  (``fasta_sequence``) -- for the main full-leader cmalign->Stem-I tree.
  ``antiterm_fallback.fasta`` holds the antiterminator-core slice of every
  Stem-I-less / sub-threshold member, for the separate lower-rigor MAFFT fallback
  tree. The main-tree tip count is emitted + printed (legitimately < 949; gate
  #10). The companion column slicer is ``slice_stemI_columns.py``.

------------------------------------------------------------------------------
Member resolution (PLAN section 5.1), the critical algorithm
------------------------------------------------------------------------------
For each locus in ``tandem_tbox_FINAL.tsv``:

1. Take its ``member_names`` tokens; pull all Master rows whose ``Name`` matches,
   restricted to the locus's ``(accession, strand)``.
2. Collapse cores within ``COLLAPSE_BP`` (60 bp) on the genomic 5' coordinate,
   keeping the single best row per physical core. Priority (PLAN section 5.1):
   ``Completeness == 'Full'`` > ``codon_start > 0`` > has ``unique_name`` >
   lowest ``E_value``.
3. Order the surviving cores by genomic 5' and assign 1-based ordinals.

This reproduces the 470 loci and yields exactly 949 representative members. The
member-count model (PLAN section 3.2) reconciles on the real sources as:

    905 distinct member-name tokens  (exact Master ``Name`` matches)
       -> 952 raw Master rows         (47 tokens map to two rows each: 905 + 47)
       -> 949 canonical members       (after the 60-bp physical-core collapse)

The 44 loci that hold two cores in one ``member_names`` window are recovered by
the collapse (a single token resolving to two >60 bp-apart cores), NOT by
splitting ``member_names``. The 952 -> 949 difference is three cross-token
collapses (loci T0434, T0445, T0456), where a duplicate annotation falls within
60 bp of a neighbouring core.

Coordinate projection (PLAN section 5.1) maps a 1-based leader offset ``o`` onto
genome coordinates using the Master row's ``locus_start`` and strand::

    project(o) = locus_start + o - 1   (+ strand)   else   locus_start - o + 1
    core5      = project(Tbox_start)

The upstream 600-bp single-linkage clustering is the *locus-detection* step,
already baked into the 470 loci (PLAN section 14); the resolution here operates
*within* each identified locus and does only the 60-bp collapse.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import re
import sys
from itertools import combinations
from math import comb
from pathlib import Path

import pandas as pd
from Bio.Align import PairwiseAligner
from Bio.Data.IUPACData import protein_letters_1to3
from Bio.Seq import Seq

from wuss import is_balanced, wuss_to_dotbracket

# --- Locked constants (PLAN section 5.1, 5.3) -------------------------------

#: Non-bacterial contaminant phyla. Their Master rows are dropped *before* the
#: join (PLAN section 5.3) -- 24 confirmed-contaminant rows on the real source.
CONTAMINANT_PHYLA = frozenset({"Arthropoda", "Ascomycota", "Nematoda", "Streptophyta"})

#: Two cores closer than this many bp on the genomic 5' coordinate are the same
#: physical core (collapse window, PLAN section 5.1).
COLLAPSE_BP = 60

#: Minimum native Stem-I span (bp) for a member to join the *main* Stem-I tree
#: (PLAN section 6, the "~50-60 bp length-gate"). A member qualifies iff it has a
#: valid Stem-I (``s1_start > 0 AND s1_end > 0``) AND its native span
#: ``|s1_end - s1_start| + 1 >= STEMI_MIN_SPAN``; everything else (Stem-I-less or a
#: degenerate sub-threshold fragment, which would cause long-branch artifacts)
#: routes to the antiterminator-core fallback tree. On the real sources this gate
#: routes exactly 71 sub-threshold fragments -- matching PLAN section 6's "~71
#: degenerate fragments" -- plus 31 Stem-I-less members, leaving 847 main-tree
#: tips (emitted + printed by the build; recorded by gate #10). The exact tip
#: count is whatever the build emits and must never be assumed (CLAUDE.md section 2).
STEMI_MIN_SPAN = 50

#: Master columns S0.3 needs for resolution + coordinate projection. S0.4 extends
#: this set when it assembles the full per-member field list (PLAN section 5.2).
_RESOLUTION_COLS = [
    "Name",            # join key == member_names token (PLAN section 3.2)
    "accession_name",  # locus (accession, strand) filter
    "phylum",          # contaminant drop (PLAN section 5.3)
    "locus_start",     # genomic 5' of the element's leader; coordinate projection
    "locus_end",       # strand sign: locus_start < locus_end  <=>  + strand
    "Tbox_start",      # leader offset of the T-box core -> core5
    "Tbox_end",        # leader offset of the core end    -> core3
    "Completeness",    # collapse priority 1 ('Full')
    "codon_start",     # collapse priority 2 (> 0)
    "unique_name",     # collapse priority 3 (present); also tbdb deep-link key
    "E_value",         # collapse priority 4 (lowest wins)
    "amino_acid_top",  # per-member specifier (PLAN section 3.1) -- golden spot-check
]

#: Additional Master columns S0.4 reads to assemble the full per-member field set
#: (PLAN section 5.2). Loaded as the union with ``_RESOLUTION_COLS``. ``codon_start``
#: lives in the resolution set already; the remaining feature-offset columns are
#: projected onto genome coordinates via :func:`project` (PLAN section 5.1).
_FIELD_COLS = [
    "FASTA_sequence",            # gap-free leader (DNA) -> fasta_sequence; gate #5
    "Sequence",                  # gapped Stem-I aligned RNA -> aligned_sequence
    "Structure",                 # Stem-I WUSS -> structure (convert; PLAN section 3.1)
    "whole_antiterm_structure",  # already dot-bracket -> pass through (PLAN section 3.1)
    "term_structure",            # already dot-bracket -> pass through (nullable)
    "s1_start", "s1_end",        # Stem-I span (window offsets)
    "s1_loop_start", "s1_loop_end",
    "stem2_region_start", "stem2_region_end",  # Stem II region (split via other_stems)
    "stem3_start", "stem3_end",  # Stem III span
    "antiterm_start", "antiterm_end",
    "term_start", "term_end",
    "other_stems",               # per-helix spans -> labelled stem overlay (PLAN section 9)
    "codon_end",                 # codon_start is in _RESOLUTION_COLS
    "discrim_start", "discrim_end",
    "refine_codon_top",          # specifier codon (PLAN section 3.1, never raw `codon`)
    "type",                      # Transcriptional / Translational chip (PLAN section 2.2)
    "trna_family_top",           # tRNA family
    "deltadelta_g",              # element-comparison bar (PLAN section 9 (1))
    "terminator_energy",         # element-comparison bar
    "downstream_protein",        # two-tier func classifier text tier (PLAN section 5.3)
    "downstream_protein_id",
    "downstream_protein_EC",     # two-tier func classifier EC tier
    "protein_desc",              # downstream.desc (display)
]

#: All Master columns the build reads, resolution + fields, de-duplicated in order.
_MASTER_COLS = list(dict.fromkeys(_RESOLUTION_COLS + _FIELD_COLS))

#: Feature-offset column pairs projected to genome coordinates + kept as window
#: offsets in ``members.json`` (PLAN section 5.2 "feature coords (window + genome)").
#: Keyed by the name the JSON uses; values are the (start, end) Master columns.
_FEATURE_SPANS = {
    "tbox": ("Tbox_start", "Tbox_end"),
    "s1": ("s1_start", "s1_end"),
    "s1_loop": ("s1_loop_start", "s1_loop_end"),
    "codon": ("codon_start", "codon_end"),
    "antiterm": ("antiterm_start", "antiterm_end"),
    "term": ("term_start", "term_end"),
    "discrim": ("discrim_start", "discrim_end"),
}

#: Integer feature-offset columns coerced once in :func:`_build_pool` so projection
#: and the window payload read nullable ints (``pd.NA`` for codon-less partials).
_COORD_COLS = [
    "s1_start", "s1_end", "s1_loop_start", "s1_loop_end",
    "stem2_region_start", "stem2_region_end", "stem3_start", "stem3_end",
    "antiterm_start", "antiterm_end", "term_start", "term_end",
    "codon_start", "codon_end", "discrim_start", "discrim_end",
]


# --- Coordinate projection (PLAN section 5.1) -------------------------------

def project(offset: object, locus_start: int, strand: str) -> int | None:
    """Project a 1-based leader ``offset`` onto genome coordinates (PLAN 5.1).

    On the ``+`` strand the leader runs 5'->3' with increasing genome
    coordinate, so ``locus_start + offset - 1``; on ``-`` it runs the other way,
    ``locus_start - offset + 1``. ``offset`` and ``locus_start`` are taken from
    one Master row.

    A missing ``offset`` (``None`` / ``NaN`` / ``pd.NA``) returns ``None`` -- the
    codon-less-partial case for the ``codon`` / ``s1`` / ``antiterm`` / ``term`` /
    ``discrim`` spans projected in field assembly (S0.4). Resolution's ``core5`` /
    ``core3`` always pass present ``Tbox_start`` / ``Tbox_end`` offsets, so the
    guard never fires on that path.
    """
    if pd.isna(offset):
        return None
    offset = int(offset)
    if strand == "+":
        return locus_start + offset - 1
    return locus_start - offset + 1


# --- Source loading (PLAN section 5, 5.3) -----------------------------------

def load_sources(master_path: Path, tandem_path: Path) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Load the two read-only sources, dropping contaminant phyla before any join.

    Returns ``(tandem, master)``. The 92 MB Master is read with only the columns
    resolution needs (PLAN section 5.3: the lineage filter is part of the join).
    Both frames are read as strings; numeric coercion happens at point of use so
    the corrupt/partial values (e.g. ``codon_start == -1``) coerce predictably.
    """
    tandem = pd.read_csv(tandem_path, sep="\t", dtype=str)
    master = pd.read_csv(master_path, usecols=_MASTER_COLS, dtype=str)
    master = master[~master["phylum"].isin(CONTAMINANT_PHYLA)].copy()
    return tandem, master


# --- Member resolution (PLAN section 5.1) -----------------------------------

def _strand_of(locus_start: pd.Series, locus_end: pd.Series) -> pd.Series:
    """``+`` where the leader's genomic start precedes its end, else ``-``."""
    return (locus_start < locus_end).map({True: "+", False: "-"})


def _build_pool(tandem: pd.DataFrame, master: pd.DataFrame) -> pd.DataFrame:
    """Pre-filter Master to just the rows any locus references, with projected
    ``strand_row`` and ``core5`` columns added (vectorised once for all loci)."""
    tokens = {t for names in tandem["member_names"] for t in names.split(";")}
    pool = master[master["Name"].isin(tokens)].copy()
    pool["locus_start"] = pd.to_numeric(pool["locus_start"], errors="coerce").astype("Int64")
    pool["locus_end"] = pd.to_numeric(pool["locus_end"], errors="coerce").astype("Int64")
    pool["Tbox_start"] = pd.to_numeric(pool["Tbox_start"], errors="coerce").astype("Int64")
    pool["Tbox_end"] = pd.to_numeric(pool["Tbox_end"], errors="coerce").astype("Int64")
    pool["E_value"] = pd.to_numeric(pool["E_value"], errors="coerce")
    pool["codon_start_num"] = pd.to_numeric(pool["codon_start"], errors="coerce")
    # Feature-offset columns -> nullable Int64 so field assembly (S0.4) reads
    # genuine ints (pd.NA for codon-less partials), which project() maps to None.
    for col in _COORD_COLS:
        pool[col] = pd.to_numeric(pool[col], errors="coerce").astype("Int64")
    pool["strand_row"] = _strand_of(pool["locus_start"], pool["locus_end"])
    plus = pool["strand_row"] == "+"
    pool["core5"] = (pool["locus_start"] + pool["Tbox_start"] - 1).where(
        plus, pool["locus_start"] - pool["Tbox_start"] + 1
    )
    return pool


def _has_unique_name(value: object) -> bool:
    # Missingness is tested first and short-circuits: bool(pd.NA) raises
    # "ambiguous", so a nullable-NA value must never reach bool().
    return not pd.isna(value) and bool(value)


def _pick_best(rows: pd.DataFrame) -> object:
    """Return the index of the best Master row in a collapsed cluster (PLAN 5.1).

    Priority, highest first: ``Completeness == 'Full'`` > ``codon_start > 0`` >
    has ``unique_name`` > lowest ``E_value`` (NaN E-values sort last).
    """
    ranked = rows.assign(
        _full=(rows["Completeness"] == "Full").astype(int),
        _codon=(rows["codon_start_num"].fillna(-1) > 0).astype(int),
        _uname=rows["unique_name"].map(_has_unique_name).astype(int),
    ).sort_values(
        ["_full", "_codon", "_uname", "E_value"],
        ascending=[False, False, False, True],
        kind="stable",
    )
    return ranked.index[0]


def _collapse_to_cores(sub: pd.DataFrame) -> list[object]:
    """Single-linkage collapse of a locus's rows by 60-bp core5 proximity.

    ``sub`` must be sorted by ``core5`` ascending. Returns the best-row index per
    physical core, in ascending genomic-coordinate order.
    """
    cores: list[object] = []
    cluster: list[object] = []
    prev: int | None = None
    for idx, c5 in sub["core5"].items():
        if prev is not None and (int(c5) - prev) > COLLAPSE_BP:
            cores.append(_pick_best(sub.loc[cluster]))
            cluster = []
        cluster.append(idx)
        prev = int(c5)
    if cluster:
        cores.append(_pick_best(sub.loc[cluster]))
    return cores


def resolve_members(tandem: pd.DataFrame, master: pd.DataFrame) -> list[dict]:
    """Resolve every locus to its ordered canonical members (PLAN section 5.1).

    Returns one dict per locus: ``tandem_id``, ``accession``, ``strand``,
    ``n_cores``, and ``members`` -- a list ordered biological 5'->3' (ordinal 1 =
    most-5' element), each member carrying the resolved Master row index plus the
    projected genome coordinates the later steps build on.
    """
    pool = _build_pool(tandem, master)
    loci: list[dict] = []

    for _, locus in tandem.iterrows():
        tandem_id = locus["tandem_id"]
        accession = locus["accession"]
        strand = locus["strand"]
        n_cores = int(locus["n_cores"])
        tokens = locus["member_names"].split(";")

        # Step 1: pull this locus's Master rows, restricted to (accession, strand).
        sub = pool[
            pool["Name"].isin(tokens)
            & (pool["accession_name"] == accession)
            & (pool["strand_row"] == strand)
        ].sort_values("core5", kind="stable")
        if sub.empty:
            raise ValueError(f"{tandem_id}: no Master rows resolved for {tokens!r}")

        # Step 2: collapse to physical cores (ascending genome coordinate).
        core_indices = _collapse_to_cores(sub)
        if len(core_indices) != n_cores:
            raise ValueError(
                f"{tandem_id}: collapsed to {len(core_indices)} cores, expected "
                f"n_cores={n_cores} (rows pulled: {len(sub)})"
            )

        # Step 3: order by the genomic 5' end and assign 1-based ordinals.
        # "Genomic 5'" (PLAN section 5.1 step 3 / 5.2 "ordinal = genomic-5'") is
        # the *strand-aware* 5' end of the transcript -- i.e. biological 5'->3',
        # which is how PLAN section 9.1 draws the architecture track. So ordinal 1
        # is the most-5' core: ascending core5 on +, descending on -. On the minus
        # strand the 5' end sits at the LARGER genome coordinate, hence the reverse.
        # (NOT alphabetical specifier_aa, and NOT plain ascending-coordinate; the
        # symmetric matrix at S1.5 folds on this ordinal per PLAN section 9.2.)
        if strand == "-":
            core_indices = core_indices[::-1]

        members = []
        for ordinal, idx in enumerate(core_indices, start=1):
            row = pool.loc[idx]
            locus_start = int(row["locus_start"])
            members.append(
                {
                    "member_id": f"{tandem_id}.m{ordinal}",
                    "tandem_id": tandem_id,
                    "ordinal": ordinal,
                    "row_index": idx,
                    "unique_name": row["unique_name"] if _has_unique_name(row["unique_name"]) else None,
                    "aa": None if pd.isna(row["amino_acid_top"]) else row["amino_acid_top"],
                    # Both ends projected via project() with one strand source (the
                    # locus strand, == the per-row strand after the step-1 filter).
                    # pool["core5"] is the internal collapse/sort key and equals
                    # this 5' value by construction.
                    "core5": project(row["Tbox_start"], locus_start, strand),
                    "core3": project(row["Tbox_end"], locus_start, strand),
                }
            )

        loci.append(
            {
                "tandem_id": tandem_id,
                "accession": accession,
                "strand": strand,
                "n_cores": n_cores,
                "members": members,
            }
        )

    return loci


# --- Two-tier function classifier (PLAN section 5.3) ------------------------

# Tier 1 -- EC number prefixes (matched on the leading dotted fields).
_EC_AARS = re.compile(r"^6\.1\.1\.")        # aminoacyl-tRNA ligases -> aaRS
_EC_BIOSYN = re.compile(r"^(?:2|4)\.")      # transferases / lyases  -> biosynthesis
_EC_OXRED = re.compile(r"^1\.")             # oxidoreductases        -> oxidoreductase

# Tier 2 -- ordered regex over `downstream_protein` text (case-insensitive).
# `--?tRNA (ligase|synthetase)` in PLAN section 5.3 is the "...--tRNA ligase"
# naming; searching for the tRNA+role phrase anywhere matches it.
_RE_AARS = re.compile(r"tRNA\s+(?:ligase|synthetase)", re.IGNORECASE)
_RE_TRANS = re.compile(r"transporter|permease|abc|atp-binding", re.IGNORECASE)
_RE_BIOSYN = re.compile(
    r"aminotransferase|dehydratase|synthase|anthranilate|chorismate|"
    r"isopropylmalate|homoserine",
    re.IGNORECASE,
)
_RE_HYPO = re.compile(r"hypothetical", re.IGNORECASE)


def classify_func(ec: str | None, protein: str | None) -> tuple[str, str]:
    """Two-tier ``(func_class, func_source)`` classifier (PLAN section 5.3).

    Tier 1 keys off the EC number (``func_source == 'EC'``). An EC that is present
    but matches no known prefix falls through to tier 2 rather than being lost.
    Tier 2 is an ordered regex over ``downstream_protein`` (``func_source ==
    'text'`` -- the UI marks these with an asterisk). With neither signal the class
    is ``unknown`` / ``none``.
    """
    if ec:
        e = ec.strip()
        if _EC_AARS.match(e):
            return ("aaRS", "EC")
        if _EC_BIOSYN.match(e):
            return ("biosynthesis", "EC")
        if _EC_OXRED.match(e):
            return ("oxidoreductase", "EC")
    if protein:
        if _RE_AARS.search(protein):
            return ("aaRS", "text")
        if _RE_TRANS.search(protein):
            return ("transporter", "text")
        if _RE_BIOSYN.search(protein):
            return ("biosynthesis", "text")
        if _RE_HYPO.search(protein):
            return ("unknown", "text")
    return ("unknown", "none")


# --- Field assembly -> loci.json + members.json (PLAN section 5.2) -----------

def _s(value: object) -> str | None:
    """A trimmed string, or ``None`` for a missing/blank cell."""
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _i(value: object) -> int | None:
    """A nullable int from a coerced Int64 / numeric cell."""
    return None if pd.isna(value) else int(value)


def _f(value: object, ndigits: int = 2) -> float | None:
    """A rounded float, or ``None``. Display-precision energies (PLAN section 9)."""
    if pd.isna(value):
        return None
    try:
        return round(float(value), ndigits)
    except (TypeError, ValueError):
        return None


# --- Labelled stem spans -> the in-app RNA colour overlay (PLAN section 9) ---

#: Internal token -> stem key emitted in members.json. The frontend maps each key
#: to a display label + colour (src/lib/color.ts STEM_*), so the data stays compact.
#: Order is biological 5'->3' through the antiterminator conformation.
_STEM_KEYS = ("i", "ii", "iiab", "iii", "at")


def _parse_other_stems(value: object) -> list[tuple[int, int]]:
    """Parse the Master ``other_stems`` cell into ordered ``(lo, hi)`` int pairs.

    The cell is a Python-literal list of ``[start, end]`` leader offsets (1-based,
    same frame as ``fasta_sequence``), e.g. ``"[[7, 107], [110, 142], ...]"``. A
    blank / unparseable / malformed cell yields ``[]`` -- the overlay then simply
    omits the Stem II split for that element (it degrades, never raises).
    """
    if pd.isna(value):
        return []
    text = str(value).strip()
    if not text:
        return []
    try:
        raw = ast.literal_eval(text)
    except (ValueError, SyntaxError):
        return []
    spans: list[tuple[int, int]] = []
    for item in raw:
        try:
            a, b = int(item[0]), int(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        spans.append((min(a, b), max(a, b)))
    return spans


def derive_stems(row: object) -> list[dict]:
    """Ordered, labelled stem spans for a member's RNA colour overlay (PLAN section 9).

    Spans are 1-based, inclusive, leader-relative -- the SAME frame as
    ``fasta_sequence`` / ``whole_antiterm_structure`` -- so the frontend can paint
    each nucleotide of the rendered antiterminator fold by the domain it sits in:

    * **Stem I**           = ``s1_start..s1_end``
    * **Stem II**          = the 5'-most helix inside the Stem II region
    * **Stem IIA/B**       = the following pseudoknot helix(es) in that region
    * **Stem III**         = ``stem3_start..stem3_end``
    * **Antiterminator**   = ``antiterm_start..antiterm_end``

    The Stem II region (``stem2_region_start..stem2_region_end``) is a single
    Master span; its internal Stem II vs IIA/B boundary lives only in ``other_stems``
    (the per-helix list), so the two are split from the ``other_stems`` helices that
    fall within the region. Degenerate elements (no Stem I, no Stem II region, ...)
    simply omit the missing spans -- the overlay leaves those nucleotides neutral.
    Accepts a ``pd.Series`` (the resolved pool row) or any mapping (unit tests).
    """
    def span(c0: str, c1: str) -> tuple[int, int] | None:
        a, b = _i(row[c0]), _i(row[c1])
        if a is None or b is None or a <= 0 or b <= 0:
            return None
        return (min(a, b), max(a, b))

    stems: list[tuple[str, tuple[int, int]]] = []

    s1 = span("s1_start", "s1_end")
    if s1:
        stems.append(("i", s1))

    s2_region = span("stem2_region_start", "stem2_region_end")
    if s2_region:
        inner = sorted(
            sp for sp in _parse_other_stems(row["other_stems"])
            if sp[0] >= s2_region[0] and sp[1] <= s2_region[1]
        )
        if len(inner) >= 2:
            stems.append(("ii", inner[0]))                       # Stem II = 5'-most helix
            stems.append(("iiab", (inner[1][0], inner[-1][1])))  # Stem IIA/B = the rest
        else:
            stems.append(("ii", inner[0] if inner else s2_region))

    s3 = span("stem3_start", "stem3_end")
    if s3:
        stems.append(("iii", s3))

    at = span("antiterm_start", "antiterm_end")
    if at:
        stems.append(("at", at))

    return [{"key": key, "start": lo, "end": hi} for key, (lo, hi) in stems]


def _assemble_member(row: pd.Series, member: dict, accession: str, strand: str) -> dict:
    """Build one ``members.json`` object from its resolved Master row (PLAN 5.2).

    ``member`` carries the resolution-stage keys (``member_id`` / ``ordinal`` /
    ``tandem_id``); ``row`` is ``pool.loc[row_index]`` with the feature offsets
    already coerced to nullable ints.
    """
    locus_start = int(row["locus_start"])
    locus_end = int(row["locus_end"])

    uname = _s(row["unique_name"])
    tbdb_url = f"https://tbdb.io/tboxes/{uname}.html" if uname else None
    # NCBI fallback (PLAN section 9): the leader's genome span, from<=to.
    lo, hi = (locus_start, locus_end) if locus_start <= locus_end else (locus_end, locus_start)
    ncbi_url = (
        f"https://www.ncbi.nlm.nih.gov/nuccore/{accession}"
        f"?report=genbank&from={lo}&to={hi}"
    )

    # Feature coords: window offsets (leader-relative) + genome projection. A
    # missing offset (codon-less partials) yields [None, None] / projects to None.
    window: dict[str, list[int | None]] = {}
    genome: dict[str, list[int | None]] = {}
    for name, (c0, c1) in _FEATURE_SPANS.items():
        window[name] = [_i(row[c0]), _i(row[c1])]
        genome[name] = [project(row[c0], locus_start, strand), project(row[c1], locus_start, strand)]

    ec = _s(row["downstream_protein_EC"])
    protein = _s(row["downstream_protein"])
    func_class, func_source = classify_func(ec, protein)

    return {
        "member_id": member["member_id"],
        "tandem_id": member["tandem_id"],
        "ordinal": member["ordinal"],
        "unique_name": uname,
        "tbdb_url": tbdb_url,
        "ncbi_url": ncbi_url,
        "specifier": {"aa": _s(row["amino_acid_top"]), "codon": _s(row["refine_codon_top"])},
        "coords": {
            "leader": [locus_start, locus_end],
            "window": window,
            "genome": genome,
        },
        # Gap-free leader (DNA); len == |locus_end - locus_start| + 1 (gate #5).
        "fasta_sequence": _s(row["FASTA_sequence"]),
        # Gapped Stem-I aligned RNA + converted Stem-I structure, kept together;
        # NOT genome-indexable (PLAN section 5.2). structure converts WUSS only.
        "aligned_sequence": _s(row["Sequence"]),
        "structure": wuss_to_dotbracket(str(row["Structure"])),
        # Already dot-bracket -> pass through, never converted (PLAN section 3.1).
        "whole_antiterm_structure": _s(row["whole_antiterm_structure"]),
        "term_structure": _s(row["term_structure"]),
        # Labelled stem spans (Stem I / II / IIA-B / III / antiterminator) for the
        # in-app RNA colour overlay; leader-relative, indexes whole_antiterm_structure.
        "stems": derive_stems(row),
        "deltadelta_g": _f(row["deltadelta_g"]),
        "terminator_energy": _f(row["terminator_energy"]),
        "type": _s(row["type"]),
        "completeness": _s(row["Completeness"]),
        "trna": _s(row["trna_family_top"]),
        "downstream": {
            "protein": protein,
            "id": _s(row["downstream_protein_id"]),
            "ec": ec,
            "desc": _s(row["protein_desc"]),
            "func_class": func_class,
            "func_source": func_source,
        },
    }


def _locus_func_class(tandem_row: pd.Series, member_objs: list[dict]) -> tuple[str, str]:
    """Locus-level ``(func_class, func_source)`` (PLAN section 9 (3) -- loci by class).

    The tandem regulates one operon recorded as ``downstream_gene`` /
    ``downstream_id``. Classify the member whose ``downstream_protein_id`` matches
    that id (so the EC tier still applies); if no member matches, text-classify the
    tandem ``downstream_gene`` directly (no EC available at locus level).
    """
    target = _s(tandem_row["downstream_id"])
    if target is not None:
        for obj in member_objs:
            if obj["downstream"]["id"] == target:
                return obj["downstream"]["func_class"], obj["downstream"]["func_source"]
    return classify_func(None, _s(tandem_row["downstream_gene"]))


def assemble(
    loci: list[dict], pool: pd.DataFrame, tandem: pd.DataFrame
) -> tuple[list[dict], dict[str, dict]]:
    """Assemble the ``loci.json`` locus list and the ``members.json`` map (PLAN 5.2).

    Returns ``(locus_objs, members_map)``. ``members_map`` is keyed by
    ``member_id``; ``locus_objs`` denormalizes ``member_ids`` (and a ``null``
    ``mean_pairwise_identity`` placeholder backfilled at S0.5).
    """
    tmap = {r["tandem_id"]: r for _, r in tandem.iterrows()}
    members_map: dict[str, dict] = {}
    locus_objs: list[dict] = []

    for locus in loci:
        tandem_id = locus["tandem_id"]
        accession = locus["accession"]
        strand = locus["strand"]
        trow = tmap[tandem_id]

        member_objs: list[dict] = []
        for member in locus["members"]:
            row = pool.loc[member["row_index"]]
            obj = _assemble_member(row, member, accession, strand)
            members_map[obj["member_id"]] = obj
            member_objs.append(obj)

        locus_type = (
            "Translational"
            if any(o["type"] == "Translational" for o in member_objs)
            else "Transcriptional"
        )
        func_class, func_source = _locus_func_class(trow, member_objs)

        locus_objs.append(
            {
                "tandem_id": tandem_id,
                "accession": accession,
                "strand": strand,
                "organism": _s(trow["organism"]),
                "phylum": _s(trow["phylum"]),
                "tax_id": _s(trow["TaxId"]),
                "n_cores": locus["n_cores"],
                "n_complete_cores": _i(pd.to_numeric(trow["n_complete_cores"], errors="coerce")),
                "core_span": _i(pd.to_numeric(trow["core_span"], errors="coerce")),
                "specifier_aa": _s(trow["specifier_aa"]),
                "same_specifier": str(trow["same_specifier"]).strip().lower() == "true",
                "confidence": _s(trow["confidence"]),
                "flags": _s(trow["flags"]),
                "type": locus_type,
                "func_class": func_class,
                "func_source": func_source,
                "downstream_gene": _s(trow["downstream_gene"]),
                "downstream_id": _s(trow["downstream_id"]),
                "member_ids": [o["member_id"] for o in member_objs],
                # Backfilled at S0.5 alongside identity.json (PLAN section 5.2).
                "mean_pairwise_identity": None,
            }
        )

    return locus_objs, members_map


def build_facets(locus_objs: list[dict]) -> dict[str, list[str]]:
    """Facet vocabularies for the table/filter store (PLAN section 5.2, 7.3).

    ``specifier`` is ordered by locus frequency (descending) -- the §9 (2) bar
    order; the rest are sorted. Null phylum (the 3 unassigned loci) and any null
    facet value are omitted from the vocab but remain filterable as ``null``.
    """
    def freq_desc(key: str) -> list[str]:
        counts: dict[str, int] = {}
        for o in locus_objs:
            v = o[key]
            if v is not None:
                counts[v] = counts.get(v, 0) + 1
        return [v for v, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]

    def sorted_distinct(key: str) -> list[str]:
        return sorted({o[key] for o in locus_objs if o[key] is not None})

    return {
        "specifier": freq_desc("specifier_aa"),
        "phylum": sorted_distinct("phylum"),
        "type": sorted_distinct("type"),
        "confidence": sorted_distinct("confidence"),
        "func_class": sorted_distinct("func_class"),
    }


# --- Pairwise identity -> identity.json + loci mean backfill (PLAN 5.2) ------

#: Pairwise global-alignment scoring for the intra-locus %-identity (PLAN 5.2:
#: "Biopython global align, gaps count against -> recent vs ancient duplication").
#: A standard nucleotide Needleman-Wunsch: reward identity, penalise mismatch and
#: (affine) gaps. The spec fixes the *method* (global align, gaps count against),
#: not the exact weights -- these are a deterministic, conventional choice. Identity
#: is read off the resulting alignment as ``identities / alignment-length``, so
#: every gap column (terminal or internal) counts against, independent of the score.
_ALN_MATCH = 2.0
_ALN_MISMATCH = -1.0
_ALN_OPEN_GAP = -5.0
_ALN_EXTEND_GAP = -0.5


def _new_aligner() -> PairwiseAligner:
    """A deterministic global nucleotide aligner (PLAN section 5.2)."""
    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.match_score = _ALN_MATCH
    aligner.mismatch_score = _ALN_MISMATCH
    aligner.open_gap_score = _ALN_OPEN_GAP
    aligner.extend_gap_score = _ALN_EXTEND_GAP
    return aligner


def _pairwise_identity(aligner: PairwiseAligner, seq_a: str, seq_b: str) -> float:
    """Percent identity of the best global alignment, gaps counting against.

    ``identity = 100 * identities / (identities + mismatches + gaps)`` -- the
    alignment length is the denominator, so every gap column counts against
    (PLAN section 5.2). Sequences are upper-cased so any soft-masked base aligns
    by identity; the result is rounded to 1 dp. ``aligner.align(a, b)[0]`` is the
    first co-optimal alignment and is deterministic.
    """
    a = (seq_a or "").upper()
    b = (seq_b or "").upper()
    counts = aligner.align(a, b)[0].counts()
    length = counts.identities + counts.mismatches + counts.gaps
    if length == 0:
        return 0.0
    return round(100.0 * counts.identities / length, 1)


def compute_identity(
    locus_objs: list[dict], members_map: dict[str, dict]
) -> tuple[list[dict], dict[str, float]]:
    """Intra-locus pairwise %-identity (PLAN section 5.2): the 488 unordered pairs.

    Returns ``(pairs, means)``. ``pairs`` is a flat list of
    ``{"a", "b", "identity"}`` over each locus's members in ordinal (transcript-5')
    order, so it holds exactly ``Sum C(n_cores, 2) == 488`` entries (461*1 + 9*3)
    and the loaded ``identity.json`` has ``len == 488`` (gate #9). ``means`` maps
    each ``tandem_id`` to the mean of its pair identities (backfilled into
    ``loci.json``); for a 2-core locus that mean equals its single pair value.
    """
    aligner = _new_aligner()
    pairs: list[dict] = []
    means: dict[str, float] = {}
    for locus in locus_objs:
        mids = locus["member_ids"]  # ordinal (transcript-5'->3') order
        locus_pids: list[float] = []
        for a, b in combinations(mids, 2):
            pid = _pairwise_identity(
                aligner,
                members_map[a]["fasta_sequence"],
                members_map[b]["fasta_sequence"],
            )
            pairs.append({"a": a, "b": b, "identity": pid})
            locus_pids.append(pid)
        means[locus["tandem_id"]] = round(sum(locus_pids) / len(locus_pids), 1)
    return pairs, means


# --- summary.json (PLAN section 5.2, 3.1, 9 (2)) ----------------------------

def _median(values: list[float]) -> float | None:
    """Median of a numeric list (``None`` if empty), rounded to 2 dp."""
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    med = s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2
    return round(med, 2)


def _count_dist(objs: list[dict], key: str) -> list[dict]:
    """A frequency-descending ``[{"value", "count"}]`` distribution over ``key``.

    Null values are omitted (e.g. the 3 unassigned-phylum loci). Ties break
    alphabetically -- matching the §9 (2) specifier bar order (TRP, THR, MET, ...).
    """
    counts: dict[str, int] = {}
    for o in objs:
        v = o[key]
        if v is not None:
            counts[v] = counts.get(v, 0) + 1
    return [
        {"value": v, "count": c}
        for v, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def build_summary(
    locus_objs: list[dict], members_map: dict[str, dict], pairs: list[dict]
) -> dict:
    """KPI + distribution payload for the dashboard (PLAN section 5.2, ~2 KB).

    Boots with ``loci.json`` for the KPI strip; the distributions feed the §9
    specificity bar (locus-level specifier), the operon split (func_class +
    func_source EC/text), and the phylum / type / n_cores context. The headline
    counts reconcile with the PLAN section 3.1 facts: 470 / 949 / 488; 461 pairs /
    9 triples; 394 high / 76 low confidence; 428 same / 42 mixed specifier; 16
    non-Firmicutes.
    """
    n_loci = len(locus_objs)
    same = sum(1 for o in locus_objs if o["same_specifier"])
    conf = {"high": 0, "low": 0}
    for o in locus_objs:
        c = o["confidence"]
        if c in conf:
            conf[c] += 1
    ddg = [m["deltadelta_g"] for m in members_map.values() if m["deltadelta_g"] is not None]
    pid = [p["identity"] for p in pairs]

    return {
        "counts": {
            "loci": n_loci,
            "members": len(members_map),
            "intra_locus_pairs": len(pairs),
            "pairs": sum(1 for o in locus_objs if o["n_cores"] == 2),
            "triples": sum(1 for o in locus_objs if o["n_cores"] == 3),
            "non_firmicutes": sum(1 for o in locus_objs if o["phylum"] != "Firmicutes"),
        },
        "confidence": conf,
        "specifier_agreement": {"same": same, "mixed": n_loci - same},
        "distributions": {
            "specifier": _count_dist(locus_objs, "specifier_aa"),
            "phylum": _count_dist(locus_objs, "phylum"),
            "type": _count_dist(locus_objs, "type"),
            "func_class": _count_dist(locus_objs, "func_class"),
            "func_source": _count_dist(locus_objs, "func_source"),
            "n_cores": [
                {"value": v, "count": sum(1 for o in locus_objs if o["n_cores"] == v)}
                for v in sorted({o["n_cores"] for o in locus_objs})
            ],
        },
        "numeric": {
            "deltadelta_g": {"n_filled": len(ddg), "median": _median(ddg)},
            "pairwise_identity": {
                "median": _median(pid),
                "mean": round(sum(pid) / len(pid), 1) if pid else None,
            },
        },
    }


def _write_json(path: Path, obj: object) -> None:
    """Write compact deterministic JSON (no spaces, stable key order)."""
    with path.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=True)


# --- Member-level base table (members.csv) ----------------------------------
#
# The same database, one flat row per canonical member, with the component-stem
# spans (PLAN section 9) flattened into fixed columns. This keeps the stem
# identity *in* the main database (alongside every other per-member field)
# rather than only inside members.json's nested ``stems`` array -- the CSV is the
# spreadsheet-friendly "base table" and carries the EXACT spans the website
# colours the RNA secondary structure by (1-based, inclusive, leader-relative,
# the same frame as ``fasta_sequence`` / ``whole_antiterm_structure``). Driven
# off :data:`_STEM_KEYS` so the stem columns can never drift from
# :func:`derive_stems`. Blank cell == that stem is absent on the element.

#: Scalar member + locus-context columns, in header order, that precede the stems.
_MEMBER_CSV_LEAD = [
    "member_id", "tandem_id", "ordinal",
    "accession", "strand", "organism", "phylum",
    "unique_name", "specifier_aa", "specifier_codon",
    "type", "completeness", "trna",
    "deltadelta_g", "terminator_energy",
    "func_class", "func_source", "downstream_protein", "downstream_id", "downstream_ec",
    "leader_length",
]
#: One ``start``/``end`` column pair per stem key (Stem I / II / IIA-B / III / antiterm).
_STEM_CSV_COLS = [f"stem_{key}_{end}" for key in _STEM_KEYS for end in ("start", "end")]
#: Full members.csv header: lead columns -> stem span pairs -> the two deep-link URLs.
_MEMBER_CSV_HEADER = _MEMBER_CSV_LEAD + _STEM_CSV_COLS + ["tbdb_url", "ncbi_url"]


def _member_csv_row(member: dict, locus: dict) -> list:
    """Flatten one member (+ its locus context) into a members.csv row."""
    spans = {s["key"]: (s["start"], s["end"]) for s in member.get("stems", [])}
    spec = member.get("specifier") or {}
    down = member.get("downstream") or {}
    lead = {
        "member_id": member["member_id"],
        "tandem_id": member["tandem_id"],
        "ordinal": member["ordinal"],
        "accession": locus.get("accession"),
        "strand": locus.get("strand"),
        "organism": locus.get("organism"),
        "phylum": locus.get("phylum"),
        "unique_name": member.get("unique_name"),
        "specifier_aa": spec.get("aa"),
        "specifier_codon": spec.get("codon"),
        "type": member.get("type"),
        "completeness": member.get("completeness"),
        "trna": member.get("trna"),
        "deltadelta_g": member.get("deltadelta_g"),
        "terminator_energy": member.get("terminator_energy"),
        "func_class": down.get("func_class"),
        "func_source": down.get("func_source"),
        "downstream_protein": down.get("protein"),
        "downstream_id": down.get("id"),
        "downstream_ec": down.get("ec"),
        "leader_length": len(member.get("fasta_sequence") or ""),
    }
    row = [lead[col] for col in _MEMBER_CSV_LEAD]
    for key in _STEM_KEYS:
        lo, hi = spans.get(key, (None, None))
        row.extend([lo, hi])
    row.extend([member.get("tbdb_url"), member.get("ncbi_url")])
    return row


def write_members_csv(
    locus_objs: list[dict], members_map: dict[str, dict], out_dir: Path
) -> int:
    """Write ``members.csv`` -- the member-level base table with flattened stem spans.

    One row per canonical member (members.json order); locus context (accession,
    strand, organism, phylum) is joined per member from ``locus_objs``. Returns the
    number of data rows written.
    """
    loc_by_member = {mid: loc for loc in locus_objs for mid in loc["member_ids"]}
    with (out_dir / "members.csv").open("w", encoding="utf-8", newline="") as fh:
        writer = csv.writer(fh, lineterminator="\n")
        writer.writerow(_MEMBER_CSV_HEADER)
        for member_id, member in members_map.items():
            writer.writerow(_member_csv_row(member, loc_by_member[member_id]))
    return len(members_map)


# --- Tree-build FASTAs: Stem-I length-gate (PLAN section 6, 5.2) -------------

def _native_stemI_span(member: dict) -> int | None:
    """Native Stem-I span (bp) of a member, or ``None`` if it has no valid Stem-I.

    Validity is PLAN section 6's ``s1_start > 0 AND s1_end > 0`` over the
    leader-relative Stem-I window offsets (``members.json`` ``coords.window.s1``).
    The native span is ``|s1_end - s1_start| + 1`` -- the element's own Stem-I
    length in leader nucleotides, *not* an alignment-column count -- so it is the
    quantity gate #10 (PLAN section 5.4) checks against :data:`STEMI_MIN_SPAN`. On
    the real sources 31 members carry ``s1_end == 0`` (no called Stem-I) and return
    ``None`` here.
    """
    a, b = member["coords"]["window"]["s1"]
    if a is None or b is None or a <= 0 or b <= 0:
        return None
    return abs(b - a) + 1


def partition_for_tree(members_map: dict[str, dict]) -> tuple[list[str], list[str]]:
    """Split members into the main Stem-I tree vs the antiterminator fallback.

    A member joins the **main** tree iff it has a valid Stem-I whose native span
    is ``>= STEMI_MIN_SPAN`` (PLAN section 6); all others -- Stem-I-less or
    sub-threshold degenerate fragments -- go to the **fallback**. Returns
    ``(main_ids, fallback_ids)`` preserving ``members_map`` (resolution) order, so
    the emitted FASTA record order is deterministic. This is the single definition
    of the gate, reused by the artifact-integrity test (gate #10) at S0.7.
    """
    main_ids: list[str] = []
    fallback_ids: list[str] = []
    for member_id, member in members_map.items():
        span = _native_stemI_span(member)
        if span is not None and span >= STEMI_MIN_SPAN:
            main_ids.append(member_id)
        else:
            fallback_ids.append(member_id)
    return main_ids, fallback_ids


def _antiterm_core(member: dict) -> str | None:
    """The antiterminator-core nucleotides of a member, or ``None`` if unavailable.

    Slices the gap-free leader (``fasta_sequence``) at the leader-relative
    antiterminator window (``coords.window.antiterm``). This is the comparable,
    near-universally-present region used to build the lower-rigor MAFFT fallback
    tree for elements that have no usable Stem-I (PLAN section 6: "the
    antiterminator-core MAFFT alignment is the labelled lower-rigor fallback
    aligner"). On the real sources every one of the 102 fallback members has a
    valid antiterminator window in range, so none are dropped.
    """
    a, b = member["coords"]["window"]["antiterm"]
    seq = member["fasta_sequence"] or ""
    if a is None or b is None or a <= 0 or b <= 0:
        return None
    lo, hi = (a, b) if a <= b else (b, a)
    if hi > len(seq):
        return None
    return seq[lo - 1:hi]


def _write_fasta(path: Path, records: list[tuple[str, str]]) -> None:
    """Write FASTA records ``(header, sequence)`` in order, one sequence per line."""
    with path.open("w", encoding="utf-8") as fh:
        for header, seq in records:
            fh.write(f">{header}\n{seq}\n")


def write_tree_fastas(members_map: dict[str, dict], out_dir: Path) -> tuple[int, int]:
    """Emit ``tree_input.fasta`` (main) + ``antiterm_fallback.fasta`` (PLAN 5.2, 6).

    The main FASTA carries the full per-element leader of every gated member,
    headed by its ``unique_name`` (gate #10 requires every header be a known
    ``unique_name`` -- raised here if one is missing). The fallback FASTA carries
    the antiterminator-core slice of every other member. Returns
    ``(main_tip_count, fallback_count)``; the main tip count is the value gate #10
    pins and is recorded in PROGRESS.md.
    """
    main_ids, fallback_ids = partition_for_tree(members_map)

    main_records: list[tuple[str, str]] = []
    for member_id in main_ids:
        member = members_map[member_id]
        uname = member["unique_name"]
        leader = member["fasta_sequence"]
        if not uname:
            raise ValueError(
                f"{member_id}: main-tree member has no unique_name; gate #10 "
                "requires every tree_input.fasta header to be a known unique_name"
            )
        # Guard the sequence symmetrically with the header: a blank leader would
        # otherwise be written as the literal "None", silently corrupting the
        # cmalign input. (Cannot trigger on real data -- gate #4 holds -- but keeps
        # the gate-#10 contract self-enforcing.)
        if not leader:
            raise ValueError(
                f"{member_id}: main-tree member has an empty fasta_sequence; "
                "tree_input.fasta records carry the full per-element leader "
                "(PLAN section 5.2, gates #4/#10)"
            )
        main_records.append((uname, leader))
    _write_fasta(out_dir / "tree_input.fasta", main_records)

    fallback_records: list[tuple[str, str]] = []
    dropped: list[str] = []
    for member_id in fallback_ids:
        member = members_map[member_id]
        core = _antiterm_core(member)
        if core:
            fallback_records.append((member["unique_name"] or member_id, core))
        else:
            dropped.append(member_id)
    _write_fasta(out_dir / "antiterm_fallback.fasta", fallback_records)

    print(
        f"tree_input.fasta:        {len(main_records)} main-tree tips "
        f"(valid Stem-I, native span >= {STEMI_MIN_SPAN} bp)"
    )
    print(
        f"antiterm_fallback.fasta: {len(fallback_records)} fallback records "
        f"({len(fallback_ids)} routed to fallback"
        + (f"; {len(dropped)} lacked an antiterminator core: {dropped}" if dropped else "")
        + ")"
    )
    # Every canonical member must land in the main tree, the fallback tree, or the
    # printed `dropped` set (the "flagged-absent" tips Track B records in
    # tree_tips.json, PLAN section 5.2). This asserts the total accounting so a
    # member can never silently fall out of both FASTAs unnoticed. On the real
    # sources `dropped` is empty (all 102 fallback members have an antiterminator).
    assert len(main_records) + len(fallback_records) + len(dropped) == len(members_map), (
        f"tree FASTA accounting lost members: {len(main_records)} main + "
        f"{len(fallback_records)} fallback + {len(dropped)} dropped != {len(members_map)}"
    )
    return len(main_records), len(fallback_records)


# --- Validation gates (PLAN section 5.4) ------------------------------------

def _read_fasta(path: Path) -> list[tuple[str, str]]:
    """Parse a FASTA file into ordered ``(header, sequence)`` records."""
    records: list[tuple[str, str]] = []
    header: str | None = None
    parts: list[str] = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.startswith(">"):
                if header is not None:
                    records.append((header, "".join(parts)))
                header, parts = line[1:], []
            elif line:
                parts.append(line)
    if header is not None:
        records.append((header, "".join(parts)))
    return records


def _codon_backcheck(members_map: dict[str, dict]) -> dict:
    """Gate #6 (PLAN section 5.4): translate each member's leader specifier codon
    and compare to ``amino_acid_top``. **Warn, never fail** -- codon-less partials
    always skip and the raw codon is corrupt by design (PLAN section 3.1).

    Reads the codon straight from the gap-free leader at the leader-relative codon
    window (``fasta[codon_start-1:codon_end]``, PLAN section 5.4 #6), translates it
    with the standard table, and tallies match / mismatch / skip. Returns the
    tally; the caller surfaces it as a warning line.
    """
    checked = match = mismatch = skipped = 0
    examples: list[str] = []
    for member_id, m in members_map.items():
        aa = m["specifier"]["aa"]
        cs, ce = m["coords"]["window"]["codon"]
        seq = m["fasta_sequence"] or ""
        if aa is None or cs is None or ce is None:
            skipped += 1
            continue
        lo, hi = (cs, ce) if cs <= ce else (ce, cs)
        # Guard non-positive / out-of-range windows the same way the sibling
        # slicers do (_native_stemI_span, _antiterm_core): ~90 members carry a
        # corrupt codon window of (-1, -1), which must skip cleanly rather than
        # index from the end of the leader.
        if lo <= 0 or hi > len(seq):
            skipped += 1
            continue
        codon = seq[lo - 1:hi].upper()
        if len(codon) != 3 or any(b not in "ACGT" for b in codon):
            skipped += 1
            continue
        try:
            aa1 = str(Seq(codon).translate())
        except Exception:
            skipped += 1
            continue
        checked += 1
        aa3 = protein_letters_1to3.get(aa1, aa1).upper()
        if aa3 == aa.upper():
            match += 1
        else:
            mismatch += 1
            if len(examples) < 5:
                examples.append(f"{member_id}:{codon}->{aa3}!={aa}")
    return {"checked": checked, "match": match, "mismatch": mismatch,
            "skipped": skipped, "examples": examples}


def validate_gates(
    locus_objs: list[dict], members_map: dict[str, dict], pairs: list[dict]
) -> list[str]:
    """Run the scale-free PLAN section 5.4 gates over the build products.

    Raises :class:`ValueError` listing *every* hard-gate failure (so the build
    aborts nonzero on any gate failure, PLAN section 5.4); returns a list of
    human-readable warnings (gate #6 is warn-not-fail). This is the single gate
    definition reused by S0.7's ``test_build.py`` on the committed fixture, so it
    asserts the **relational** invariants that hold at any scale -- ``members ==
    Sum n_cores`` (#2), ``identity == Sum C(n_cores, 2)`` (#9), per-member URL /
    sequence / length / balance (#3/#4/#5/#7), and the golden (#8). The
    **absolute** 470 / 949 / 488 counts (gates #1/#2/#9) are asserted by
    :func:`main` on the real build and by ``test_artifacts.py`` over the committed
    JSON; gate #10 is :func:`verify_tree_fasta` over the emitted FASTA.
    """
    failures: list[str] = []

    # Gate #2 (relational): each locus yields exactly n_cores members; the member
    # map reconciles 1:1 with the loci's denormalized member_ids.
    sum_cores = 0
    referenced: list[str] = []
    for lo in locus_objs:
        sum_cores += lo["n_cores"]
        referenced.extend(lo["member_ids"])
        if len(lo["member_ids"]) != lo["n_cores"]:
            failures.append(
                f"gate#2: {lo['tandem_id']} has {len(lo['member_ids'])} member_ids "
                f"!= n_cores {lo['n_cores']}"
            )
    if sum_cores != len(members_map):
        failures.append(f"gate#2: sum(n_cores)={sum_cores} != len(members)={len(members_map)}")
    if len(referenced) != len(members_map) or set(referenced) != set(members_map):
        failures.append("gate#2: loci member_ids do not reconcile 1:1 with the members map")

    for member_id, m in members_map.items():
        # Gate #3: every member resolves to a tbdb_url OR an ncbi_url (a missing
        # unique_name is the expected NCBI-fallback case, not a failure).
        if not (m["tbdb_url"] or m["ncbi_url"]):
            failures.append(f"gate#3: {member_id} resolves to neither tbdb_url nor ncbi_url")
        # Gate #4: non-empty fasta_sequence and structure.
        if not m["fasta_sequence"]:
            failures.append(f"gate#4: {member_id} has empty fasta_sequence")
        if not m["structure"]:
            failures.append(f"gate#4: {member_id} has empty structure")
        # Gate #5: len(fasta_sequence) == |locus_end - locus_start| + 1.
        a, b = m["coords"]["leader"]
        expected_len = abs(b - a) + 1
        if m["fasta_sequence"] and len(m["fasta_sequence"]) != expected_len:
            failures.append(
                f"gate#5: {member_id} fasta len {len(m['fasta_sequence'])} "
                f"!= |leader|+1 {expected_len}"
            )
        # Gate #7: the converted Stem-I structure is balanced dot-bracket, and the
        # pass-through antiterm/term structures are already balanced.
        if m["structure"] and not is_balanced(m["structure"]):
            failures.append(f"gate#7: {member_id} structure is not balanced dot-bracket")
        for col in ("whole_antiterm_structure", "term_structure"):
            value = m[col]
            if value is not None and not is_balanced(value):
                failures.append(f"gate#7: {member_id} {col} is not balanced")

    # Gate #9 (relational): pair count == Sum C(n_cores, 2); every pair is
    # intra-locus and references known members.
    expected_pairs = sum(comb(lo["n_cores"], 2) for lo in locus_objs)
    if len(pairs) != expected_pairs:
        failures.append(f"gate#9: identity pairs {len(pairs)} != Sum C(n_cores,2) {expected_pairs}")
    for p in pairs:
        if p["a"].split(".")[0] != p["b"].split(".")[0]:
            failures.append(f"gate#9: pair {p['a']}|{p['b']} crosses loci")
        if p["a"] not in members_map or p["b"] not in members_map:
            failures.append(f"gate#9: pair {p['a']}|{p['b']} references an unknown member")

    # Gate #8: the CP045927 golden (when present) -> specifier set {VAL, TRP},
    # distinct non-null unique_names, transcript-5' order m1=TRP then m2=VAL. The
    # set check alone would mask a silent minus-strand ordinal flip, so the order
    # is pinned here too (mirrors _assert_golden_ordinal at the resolution stage).
    golden = next((lo for lo in locus_objs if lo["accession"] == "CP045927"), None)
    if golden is not None:
        gm = [members_map[mid] for mid in golden["member_ids"]]
        order = [m["specifier"]["aa"] for m in gm]
        unames = [m["unique_name"] for m in gm]
        if set(order) != {"VAL", "TRP"}:
            failures.append(f"gate#8: CP045927 specifier set {set(order)} != {{VAL, TRP}}")
        if any(u is None for u in unames) or len(set(unames)) != len(unames):
            failures.append(f"gate#8: CP045927 unique_names not distinct/non-null: {unames}")
        if order != ["TRP", "VAL"]:
            failures.append(f"gate#8: CP045927 order {order} != transcript-5' ['TRP', 'VAL']")

    if failures:
        raise ValueError(
            "build gate failure(s) (PLAN section 5.4):\n  " + "\n  ".join(failures)
        )

    # Gate #6 (WARN, never fail): leader codon back-check.
    cb = _codon_backcheck(members_map)
    warning = (
        f"gate#6 (warn): codon back-check {cb['match']}/{cb['checked']} translate to "
        f"amino_acid_top ({cb['mismatch']} mismatch, {cb['skipped']} skipped -- "
        "codon-less partials always skip; the raw codon is corrupt by design, "
        "PLAN section 3.1/5.4)"
    )
    if cb["examples"]:
        warning += f"; e.g. {cb['examples']}"
    return [warning]


def verify_tree_fasta(out_dir: Path, members_map: dict[str, dict]) -> int:
    """Gate #10 (PLAN section 5.4) over the emitted ``tree_input.fasta``.

    Reuses :func:`partition_for_tree` -- the single gate definition -- so the
    FASTA's headers are exactly the gated members' ``unique_name``s, in order, and
    every record's native Stem-I span meets :data:`STEMI_MIN_SPAN`. Returns the
    verified main-tree tip count (which must equal the count the build emitted).
    """
    main_ids, _ = partition_for_tree(members_map)
    expected = [members_map[mid]["unique_name"] for mid in main_ids]
    headers = [h for h, _ in _read_fasta(out_dir / "tree_input.fasta")]
    if headers != expected:
        raise ValueError(
            f"gate#10: tree_input.fasta headers ({len(headers)}) do not match the "
            f"gated unique_names ({len(expected)})"
        )
    for member_id in main_ids:
        span = _native_stemI_span(members_map[member_id])
        if span is None or span < STEMI_MIN_SPAN:
            failures = f"gate#10: {member_id} is in the main tree but native Stem-I span {span} < {STEMI_MIN_SPAN}"
            raise ValueError(failures)
    return len(headers)


# --- CLI smoke (S0.3) -------------------------------------------------------

def _smoke(loci: list[dict]) -> None:
    """Print the S0.3 exit-criteria counts and a golden spot-check (PLAN 5.4 #8)."""
    n_members = sum(len(locus["members"]) for locus in loci)
    print(f"loci:    {len(loci)}")
    print(f"members: {n_members}")

    recovered = sum(
        1 for locus in loci if len(locus["members"]) > locus["member_names_count"]
    ) if loci and "member_names_count" in loci[0] else None
    if recovered is not None:
        print(f"loci recovered by collapse (members > member_names tokens): {recovered}")

    # Golden: CP045927 (T0342) resolves to two members VAL & TRP, distinct names.
    golden = next((l for l in loci if l["accession"] == "CP045927"), None)
    if golden is not None:
        aas = [m["aa"] for m in golden["members"]]
        names = [m["unique_name"] for m in golden["members"]]
        print(
            f"golden CP045927 ({golden['tandem_id']}): aa={aas} "
            f"unique_names={names}"
        )


def _assert_golden_ordinal(loci: list[dict]) -> None:
    """Pin the load-bearing minus-strand ordinal direction (PLAN section 5.1 step 3).

    The member ``ordinal`` is transcript-5'->3' (biological): on the minus strand
    the transcript 5' end sits at the LARGER genome coordinate, so it is ordinal 1.
    The golden T0342 (``CP045927``, minus strand) must therefore resolve
    ``m1=TRP`` (core5=1984287) then ``m2=VAL`` (core5=1984088). Gate #8 (PLAN 5.4)
    only checks the *set* ``{VAL, TRP}``, which would mask a silent flip of the
    minus-strand reversal in :func:`resolve_members`; this asserts the *order*, so
    the build fails loudly before emitting ``members.json`` on a drifted ordinal.
    (Adjudicated from the S0.3 verification workflow ``verify-s03-member-resolution``;
    convention confirmed biological-5' by the spec owner.)
    """
    g = next((locus for locus in loci if locus["tandem_id"] == "T0342"), None)
    if g is None:
        return  # fixture/subset builds lacking the golden locus skip the pin
    order = [m["aa"] for m in g["members"]]
    if order != ["TRP", "VAL"]:
        raise ValueError(
            "T0342 ordinal pin failed: expected transcript-5' order ['TRP', 'VAL'], "
            f"got {order} -- the minus-strand ordinal reversal may have drifted "
            "(PLAN section 5.1 step 3)"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build tbdb.tandem static JSON from the TBDB sources (PLAN section 5).",
    )
    parser.add_argument("--master", type=Path, required=True, help="Master_tboxes.csv (read-only)")
    parser.add_argument("--tandem", type=Path, required=True, help="tandem_tbox_FINAL.tsv (read-only)")
    parser.add_argument("--out", type=Path, required=True, help="output dir for the JSON artifacts")
    args = parser.parse_args(argv)

    tandem, master = load_sources(args.master, args.tandem)

    # Annotate each tandem row's token count so the smoke can report the 44
    # loci recovered by the collapse (informational; not an exit gate here).
    tandem = tandem.copy()
    tandem["_ntok"] = tandem["member_names"].str.split(";").map(len)

    loci = resolve_members(tandem, master)
    for locus, ntok in zip(loci, tandem["_ntok"]):
        locus["member_names_count"] = int(ntok)

    _smoke(loci)
    _assert_golden_ordinal(loci)  # fail loudly if the minus-strand ordinal drifts

    # S0.4: assemble the two backbone payloads. The pool is rebuilt (cheap, ~952
    # rows) so resolve_members keeps its S0.3 signature; indices align.
    pool = _build_pool(tandem, master)
    locus_objs, members_map = assemble(loci, pool, tandem)
    facets = build_facets(locus_objs)

    # S0.5: the 488 intra-locus pairwise identities + the summary KPI/distribution
    # payload. Identity is computed before loci.json is written so each locus's
    # mean_pairwise_identity placeholder is filled in place (PLAN section 5.2).
    pairs, means = compute_identity(locus_objs, members_map)
    for locus in locus_objs:
        locus["mean_pairwise_identity"] = means[locus["tandem_id"]]
    summary = build_summary(locus_objs, members_map, pairs)

    # S0.7: lock the build behind the PLAN section 5.4 gates. validate_gates raises
    # (nonzero exit) on any hard-gate failure (#2/#3/#4/#5/#7/#8/#9) and returns the
    # gate #6 (warn-not-fail) codon back-check summary.
    warnings = validate_gates(locus_objs, members_map, pairs)
    # Gates #1/#2/#9 absolute, load-bearing counts -- the build runs on the full
    # TBDB sources (PLAN section 5.4; CLAUDE.md section 2: 470 / 949 / 488).
    actual = {"loci": len(locus_objs), "members": len(members_map), "identity": len(pairs)}
    expected = {"loci": 470, "members": 949, "identity": 488}
    if actual != expected:
        raise ValueError(
            f"gate#1/#2/#9: absolute counts {actual} != {expected} -- the build runs "
            "on the full TBDB sources (PLAN section 5.4; CLAUDE.md section 2)"
        )

    args.out.mkdir(parents=True, exist_ok=True)
    _write_json(args.out / "loci.json", {"loci": locus_objs, "facets": facets})
    _write_json(args.out / "members.json", members_map)
    _write_json(args.out / "identity.json", pairs)
    _write_json(args.out / "summary.json", summary)
    n_csv = write_members_csv(locus_objs, members_map, args.out)
    print(
        f"wrote loci.json ({len(locus_objs)}) + members.json ({len(members_map)}) "
        f"+ identity.json ({len(pairs)}) + summary.json + members.csv ({n_csv}) -> {args.out}"
    )

    # S0.6: the Stem-I length-gate + the two tree-build FASTAs (PLAN section 6, 5.2).
    # The main-tree tip count is emitted here and is legitimately < 949 by design.
    main_tips, _ = write_tree_fastas(members_map, args.out)
    # Gate #10: re-read tree_input.fasta and check it against the gate definition.
    verified = verify_tree_fasta(args.out, members_map)
    if verified != main_tips:
        raise ValueError(f"gate#10: verified tip count {verified} != emitted {main_tips}")

    for warning in warnings:
        print(warning)
    print(f"all PLAN section 5.4 gates passed ({main_tips} main-tree tips, gate #10)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
