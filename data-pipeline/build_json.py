"""build_json.py -- TandemView offline data build (PLAN section 5).

The deterministic local job that turns the two read-only TBDB source files into
the static JSON the app loads and the ``tree_input.fasta`` the cluster tree build
consumes. It is the single source of truth for member resolution and field
provenance -- get those right here, once (PLAN section 5).

    python3 data-pipeline/build_json.py --master <csv> --tandem <tsv> --out public/data

This file is built up across Phase 0 in document order:

* S0.3 -- member resolution + coordinate projection (PLAN section 5.1):
  reproduce the 470 loci as exactly 949 canonical members held in memory.
* **S0.4 (this step)** -- per-member field assembly + the two-tier function
  classifier -> ``loci.json`` + ``members.json`` (PLAN section 5.2, 5.3). Writes
  the two backbone JSON to ``--out``; ``mean_pairwise_identity`` is emitted as a
  ``null`` placeholder backfilled at S0.5 (where the Biopython pairwise identity
  is computed). ``summary.json`` / ``identity.json`` / the tree FASTAs still
  land in later steps.
* S0.5 -- ``summary.json`` + ``identity.json`` (+ backfill the loci.json mean).
* S0.6 -- the Stem-I length-gate + ``tree_input.fasta`` + the fallback FASTA.

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
import json
import re
import sys
from pathlib import Path

import pandas as pd

from wuss import wuss_to_dotbracket

# --- Locked constants (PLAN section 5.1, 5.3) -------------------------------

#: Non-bacterial contaminant phyla. Their Master rows are dropped *before* the
#: join (PLAN section 5.3) -- 24 confirmed-contaminant rows on the real source.
CONTAMINANT_PHYLA = frozenset({"Arthropoda", "Ascomycota", "Nematoda", "Streptophyta"})

#: Two cores closer than this many bp on the genomic 5' coordinate are the same
#: physical core (collapse window, PLAN section 5.1).
COLLAPSE_BP = 60

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
    "antiterm_start", "antiterm_end",
    "term_start", "term_end",
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


def _write_json(path: Path, obj: object) -> None:
    """Write compact deterministic JSON (no spaces, stable key order)."""
    with path.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=True)


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
        description="Build TandemView static JSON from the TBDB sources (PLAN section 5).",
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

    # S0.4: assemble + write the two backbone JSON. The pool is rebuilt (cheap,
    # ~952 rows) so resolve_members keeps its S0.3 signature; indices align.
    pool = _build_pool(tandem, master)
    locus_objs, members_map = assemble(loci, pool, tandem)
    facets = build_facets(locus_objs)
    args.out.mkdir(parents=True, exist_ok=True)
    _write_json(args.out / "loci.json", {"loci": locus_objs, "facets": facets})
    _write_json(args.out / "members.json", members_map)
    print(f"wrote loci.json ({len(locus_objs)}) + members.json ({len(members_map)}) -> {args.out}")
    # NOTE: summary.json / identity.json (S0.5) + tree FASTAs (S0.6) still to come.
    return 0


if __name__ == "__main__":
    sys.exit(main())
