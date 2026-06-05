#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Reproduce the tbdb.tandem tandem-T-box database from ``Master_tboxes.csv`` alone.

================================================================================
WHAT THIS SCRIPT DOES
================================================================================
tbdb.tandem (https://bioedca.github.io/tbdb.tandem/) explores the
**470 tandem T-box riboswitch loci** found in TBDB. This single, self-contained
script regenerates that entire dataset from the one public source file:

    Master_tboxes.csv   --  the full TBDB master table (~23,535 T-box rows),
                            from https://github.com/mpiersonsmela/tbox

A *T-box riboswitch* is a regulatory RNA in the 5' leader of a bacterial mRNA.
It binds one specific tRNA and reads whether that tRNA is charged with its amino
acid; when the amino acid is scarce it switches the downstream gene ON. The
amino acid a given T-box senses is its *specifier*. A **tandem** locus stacks two
or more complete T-box units in the same leader, jointly regulating one operon.

This program scans Master_tboxes.csv, finds every genomic window that stacks
>= 2 T-box cores, resolves each locus to its canonical member elements, derives
every per-element and per-locus field the app shows, and writes the same static
artifacts the web app loads:

    loci.json       470 locus records + facet vocabularies
    members.json    949 canonical member (element) records
    identity.json   488 intra-locus pairwise %-identity values
    summary.json    KPI + distribution rollups
    members.csv     949 members as one flat base table -- every per-member field
                    plus the component-stem colour spans (Stem I / II / IIA-B /
                    III / antiterminator) the web app colours the structure by
    tree_input.fasta        one leader per length-gated member (-> the tree build)
    antiterm_fallback.fasta antiterminator cores of the length-gated-out members
    tandem_loci.tsv         (optional) a human-readable per-locus table

Run it and you get a byte-for-byte-faithful copy of the published dataset
(see "REPRODUCIBILITY" below for the handful of curated edge cases).

================================================================================
HOW TO RUN
================================================================================
    python3 -m pip install "pandas>=2.0" "biopython>=1.81"

    python3 reproduce_tandem_tbox_db.py \
        --master /path/to/Master_tboxes.csv \
        --out    ./out                       \
        --emit-table          # optional: also write tandem_loci.tsv

The script self-verifies on exit (470 / 949 / 488, balanced structures, and a
golden spot-check) and exits non-zero if any invariant is violated.

================================================================================
THE PIPELINE, STEP BY STEP (the logic behind every number)
================================================================================
0. DROP NON-BACTERIAL CONTAMINATION.
   24 rows whose phylum is one of {Arthropoda, Ascomycota, Nematoda,
   Streptophyta} are sequence contaminants (eukaryotic). They are removed before
   anything else so they never reach a locus.

1. ORIENT EVERY T-BOX ON THE GENOME.
   Each Master row carries a leader window (``locus_start``..``locus_end``) and
   the T-box's offset inside it (``Tbox_start``). The strand is read from the
   coordinate order (start < end => '+'); the T-box's genomic 5' anchor is

       core5 = locus_start + Tbox_start - 1     (+ strand)
       core5 = locus_start - Tbox_start + 1     (- strand)

2. CLUSTER NEARBY CORES INTO CANDIDATE LOCI (single-linkage, 600 bp).
   Within each (accession, strand), cores are sorted by ``core5`` and chained:
   two cores join the same window when they sit <= 600 bp apart, and chaining is
   transitive (A-B and B-C => {A,B,C}). Each window is a candidate locus.

3. COLLAPSE REDUNDANT ANNOTATIONS TO PHYSICAL CORES (60 bp).
   The same physical T-box is often annotated by several pipelines, producing
   near-duplicate rows. Cores within 60 bp of each other are one physical core;
   the single best representative row is kept, preferring (in order):
       Completeness == 'Full'  >  has a called codon  >  has a tbdb id  >  lowest E-value.

4. KEEP A WINDOW AS A *TANDEM* LOCUS (>= 2 cores + a relatedness test).
   A candidate with >= 2 physical cores is a tandem locus when its cores are
   plausibly co-regulated, i.e. they
       (a) share a downstream gene id, OR
       (b) share a specifier amino acid, OR
       (c) have overlapping leader windows (a single stacked leader).
   This single rule reproduces all 470 published loci with no false positives.

5. ORDER ELEMENTS 5'->3' AND NUMBER THEM.
   Members are ordered along the transcript (most-5' first). On the minus strand
   the transcript 5' end is the *larger* genome coordinate, so the order is
   reversed there. Ordinal 1 is always the most-5' element.

6. DERIVE EVERY FIELD.
   * Specifier:    from ``amino_acid_top`` / ``refine_codon_top`` -- never the raw,
                   corrupt ``codon`` column.
   * Structure:    the Stem-I ``Structure`` column is WUSS notation and is
                   converted to dot-bracket (< -> (, > -> ), all marks -> .);
                   a missing ``Structure`` is null-guarded to ``None`` (pass
                   ``--legacy-empty-structure`` to instead reproduce the
                   published artifact's old fake ``"..."`` -- a no-op on the
                   current source). ``whole_antiterm_structure`` /
                   ``term_structure`` are already dot-bracket and pass through.
   * Coordinates:  each feature offset is projected onto genome coordinates.
   * func_class:   a two-tier classifier -- EC number first, then an ordered regex
                   over the downstream protein name (tagged EC / text / none).
   * Confidence:   a locus is high-confidence when >= 2 of its cores have a
                   called specifier codon (``codon_start`` > 0), else low.

7. PAIRWISE IDENTITY.
   For every intra-locus pair of elements, a global Needleman-Wunsch alignment
   of the gap-free leaders yields percent identity (gaps count against) -- a
   measure of how different a locus's stacked copies are. Sum over loci = 488 pairs.

8. THE TREE INPUT (length gate).
   Members with a valid Stem-I whose native span >= 50 bp seed the main
   similarity tree (847 of them); the rest route to an antiterminator-core
   fallback. The actual alignment + tree inference run separately on a cluster
   (Infernal cmalign -> RF00230 -> slice Stem-I columns -> FastTree); this script
   only emits the input FASTAs.

================================================================================
REPRODUCIBILITY (what is exact, and the few curated edge cases)
================================================================================
Run against the published Master_tboxes.csv this script reproduces, exactly:
    * the locus / member / pair counts (470 / 949 / 488),
    * the confidence split (394 high / 76 low),
    * the specifier, phylum, type and n_cores distributions,
    * the same/mixed-specifier split (428 / 42),
    * 943 of 949 member records byte-for-byte.

Two classes of curated edge case are *not* bit-identical, by nature:
    * ~6 members lie on a physical core annotated by several redundant source
      files (Vitreschak / Marks / RF00230 / gecont3). The published table kept a
      source-specific pick; this script keeps the best by the rule in step 3.
      The element is the same T-box -- only which redundant annotation row
      represents it (and thus its tbdb id) differs.
    * ~3 multi-gene loci differ in the locus-level ``downstream_gene`` *text*
      (a display field), where two cores regulate different genes.

Locus IDs (T0001..T0470) are assigned here in deterministic genomic order
(accession, then position) and therefore differ from the published discovery-
order T-numbers; the biology of each locus is identical.

================================================================================
LICENSE & ATTRIBUTION
================================================================================
Code: MIT. Data: TBDB (https://tbdb.io), used under CC-BY -- cite Marchand,
Pierson Smela, Jordan, Narasimhan & Church (2021), Nucleic Acids Research
49(D1):D229-D235, doi:10.1093/nar/gkaa721.
"""

from __future__ import annotations

import argparse
import ast
import csv
import json
import re
import sys
from collections import Counter
from itertools import combinations
from math import comb
from pathlib import Path

try:
    import pandas as pd
    from Bio.Align import PairwiseAligner
except ImportError as exc:  # pragma: no cover - dependency hint
    sys.exit(
        f"Missing dependency: {exc.name}.\n"
        '  pip install "pandas>=2.0" "biopython>=1.81"'
    )


# =============================================================================
# Locked constants
# =============================================================================

#: Non-bacterial contaminant phyla, dropped before any locus is formed (step 0).
CONTAMINANT_PHYLA = frozenset({"Arthropoda", "Ascomycota", "Nematoda", "Streptophyta"})

#: Single-linkage distance (bp) that chains cores into one candidate locus (step 2).
LINK_BP = 600

#: Two cores closer than this (bp) are the same physical core (step 3).
COLLAPSE_BP = 60

#: Minimum native Stem-I span (bp) to seed the main similarity tree (step 8).
STEMI_MIN_SPAN = 50

#: Component-stem keys, biological 5'->3' order. The frontend maps each to a
#: label + colour; members.csv flattens each into a start/end column pair (step 6).
_STEM_KEYS = ("i", "ii", "iiab", "iii", "at")

#: Master columns needed for detection + member resolution.
_DETECT_COLS = [
    "Name", "accession_name", "phylum",
    "locus_start", "locus_end", "Tbox_start", "Tbox_end",
    "Completeness", "codon_start", "unique_name", "E_value", "amino_acid_top",
]

#: Master columns needed to fill out every per-member / per-locus field.
_FIELD_COLS = [
    "FASTA_sequence", "Sequence", "Structure",
    "whole_antiterm_structure", "term_structure", "term_sequence",
    "s1_start", "s1_end", "s1_loop_start", "s1_loop_end",
    "stem2_region_start", "stem2_region_end", "stem3_start", "stem3_end",
    "antiterm_start", "antiterm_end", "term_start", "term_end",
    "other_stems",
    "codon_end", "discrim_start", "discrim_end",
    "refine_codon_top", "type", "trna_family_top",
    "deltadelta_g", "terminator_energy",
    "downstream_protein", "downstream_protein_id", "downstream_protein_EC",
    "protein_desc", "GBSeq_organism", "TaxId",
]

_ALL_COLS = list(dict.fromkeys(_DETECT_COLS + _FIELD_COLS))

#: Feature-offset columns coerced to nullable ints (``<NA>`` for codon-less partials).
_COORD_COLS = [
    "Tbox_start", "Tbox_end", "s1_start", "s1_end", "s1_loop_start", "s1_loop_end",
    "stem2_region_start", "stem2_region_end", "stem3_start", "stem3_end",
    "antiterm_start", "antiterm_end", "term_start", "term_end",
    "codon_start", "codon_end", "discrim_start", "discrim_end",
]

#: JSON feature spans -> their (start, end) Master columns. Each is stored as a
#: leader-relative window AND projected onto genome coordinates.
_FEATURE_SPANS = {
    "tbox": ("Tbox_start", "Tbox_end"),
    "s1": ("s1_start", "s1_end"),
    "s1_loop": ("s1_loop_start", "s1_loop_end"),
    "codon": ("codon_start", "codon_end"),
    "antiterm": ("antiterm_start", "antiterm_end"),
    "term": ("term_start", "term_end"),
    "discrim": ("discrim_start", "discrim_end"),
}


# =============================================================================
# RNA structure notation: WUSS -> dot-bracket (step 6)
# =============================================================================

_OPEN, _CLOSE = frozenset("<([{"), frozenset(">)]}")


def wuss_to_dotbracket(wuss: str) -> str:
    """Convert a WUSS Stem-I structure string to dot-bracket.

    Opening pair brackets become ``(``, closing become ``)``, every other WUSS
    mark (``- . _ , : ~``) becomes ``.``. Length is preserved 1:1. Applied only
    to the Stem-I ``Structure`` column; the antiterm/term columns are already
    dot-bracket and must not be run through this.
    """
    return "".join("(" if c in _OPEN else ")" if c in _CLOSE else "." for c in wuss)


def is_balanced(dotbracket: str) -> bool:
    """True iff parentheses in a dot-bracket string are balanced and nested."""
    depth = 0
    for ch in dotbracket or "":
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


# =============================================================================
# Coordinate projection (step 1)
# =============================================================================

def project(offset, locus_start: int, strand: str):
    """Project a 1-based leader ``offset`` onto genome coordinates.

    ``+`` strand counts up from ``locus_start``; ``-`` counts down. A missing
    offset (codon-less partials) returns ``None``.
    """
    if pd.isna(offset):
        return None
    offset = int(offset)
    return locus_start + offset - 1 if strand == "+" else locus_start - offset + 1


# =============================================================================
# Step 0-1: load + orient
# =============================================================================

def load_master(path: Path) -> pd.DataFrame:
    """Read the needed columns, drop contaminants, and add strand + ``core5``."""
    raw = pd.read_csv(path, usecols=_ALL_COLS, dtype=str)
    n_contaminant = int(raw["phylum"].isin(CONTAMINANT_PHYLA).sum())
    master = raw[~raw["phylum"].isin(CONTAMINANT_PHYLA)].copy()
    print(f"  {len(raw):,} T-box rows; dropped {n_contaminant} non-bacterial contaminant rows.")

    # Float (`_n`) copies of the coordinate columns. Only three things need a
    # plain float: the genome-anchor arithmetic for `core5` (`Tbox_start_n`),
    # the strand comparison (`locus_start_n` < `locus_end_n`), and the
    # physical-core ranking (`E_value_n`, `codon_start_n`). Every other call
    # site reads the nullable-int (`Int64`) form built from `_COORD_COLS` below
    # -- so `Tbox_start` and `codon_start` deliberately exist in both forms.
    for col in ["locus_start", "locus_end", "Tbox_start", "E_value"]:
        master[col + "_n"] = pd.to_numeric(master[col], errors="coerce")
    master["codon_start_n"] = pd.to_numeric(master["codon_start"], errors="coerce")
    for col in _COORD_COLS:
        master[col] = pd.to_numeric(master[col], errors="coerce").astype("Int64")

    # A core with no genomic anchor can never be placed; drop it.
    n_before = len(master)
    master = master.dropna(subset=["locus_start_n", "locus_end_n", "Tbox_start_n"]).copy()
    if n_before != len(master):
        print(f"  dropped {n_before - len(master)} row(s) with no usable genomic coordinates.")

    master["strand"] = (master["locus_start_n"] < master["locus_end_n"]).map({True: "+", False: "-"})
    on_plus = master["strand"] == "+"
    master["core5"] = (
        (master["locus_start_n"] + master["Tbox_start_n"] - 1)
        .where(on_plus, master["locus_start_n"] - master["Tbox_start_n"] + 1)
        .astype("int64")
    )
    # Leader window low/high bound, for the overlap test in step 4.
    master["lw_lo"] = master[["locus_start_n", "locus_end_n"]].min(axis=1).astype("int64")
    master["lw_hi"] = master[["locus_start_n", "locus_end_n"]].max(axis=1).astype("int64")
    return master


# =============================================================================
# Step 3: collapse to physical cores
# =============================================================================

def _has_unique_name(value) -> bool:
    return not pd.isna(value) and bool(value)


def _pick_best(rows: pd.DataFrame):
    """Index of the best representative row of a collapsed physical core (step 3)."""
    ranked = rows.assign(
        _full=(rows["Completeness"] == "Full").astype(int),
        _codon=(rows["codon_start_n"].fillna(-1) > 0).astype(int),
        _uname=rows["unique_name"].map(_has_unique_name).astype(int),
    ).sort_values(
        ["_full", "_codon", "_uname", "E_value_n"],
        ascending=[False, False, False, True],
        kind="stable",
    )
    return ranked.index[0]


def _single_linkage(series: pd.Series, gap: int) -> list[list]:
    """Chain a ``core5``-sorted series into clusters whose neighbours are <= gap apart."""
    clusters: list[list] = []
    current: list = []
    prev = None
    for idx, value in series.items():
        if prev is not None and (value - prev) > gap:
            clusters.append(current)
            current = []
        current.append(idx)
        prev = value
    if current:
        clusters.append(current)
    return clusters


def _leaders_overlap(rows: pd.DataFrame) -> bool:
    """True iff any two of these cores' leader windows overlap (step 4c)."""
    intervals = sorted(zip(rows["lw_lo"], rows["lw_hi"]))
    return any(nxt_lo <= cur_hi for (_, cur_hi), (nxt_lo, _) in zip(intervals, intervals[1:]))


# =============================================================================
# Steps 2, 4, 5: detect tandem loci
# =============================================================================

def detect_loci(master: pd.DataFrame) -> list[dict]:
    """Find every tandem locus and its ordered member rows (steps 2-5)."""
    detected: list[dict] = []
    for (accession, strand), group in master.groupby(["accession_name", "strand"], sort=False):
        group = group.sort_values("core5", kind="stable")
        for window_idx in _single_linkage(group["core5"], LINK_BP):
            window = group.loc[window_idx]

            # Step 3: collapse redundant annotations to physical cores.
            cores = _single_linkage(window["core5"], COLLAPSE_BP)
            if len(cores) < 2:
                continue
            reps = [_pick_best(window.loc[core]) for core in cores]
            rep_rows = master.loc[reps]

            # Step 4: is this a co-regulated tandem (not two unrelated neighbours)?
            shares_gene = (
                rep_rows["downstream_protein_id"].nunique(dropna=True) == 1
                and rep_rows["downstream_protein_id"].notna().any()
            )
            shares_spec = (
                rep_rows["amino_acid_top"].nunique(dropna=True) == 1
                and rep_rows["amino_acid_top"].notna().any()
            )
            if not (shares_gene or shares_spec or _leaders_overlap(rep_rows)):
                continue

            # Step 5: order 5'->3' (reverse on the minus strand).
            if strand == "-":
                reps = reps[::-1]
            detected.append({"accession": accession, "strand": strand, "core_indices": reps})

    # Deterministic, position-sorted locus IDs (see REPRODUCIBILITY note).
    detected.sort(key=lambda loc: (loc["accession"], int(master.loc[loc["core_indices"][0], "core5"])))
    for ordinal, loc in enumerate(detected, start=1):
        loc["tandem_id"] = f"T{ordinal:04d}"
        loc["n_cores"] = len(loc["core_indices"])
    return detected


# =============================================================================
# Step 6: two-tier downstream-function classifier
# =============================================================================

_EC_AARS = re.compile(r"^6\.1\.1\.")       # aminoacyl-tRNA ligases  -> aaRS
_EC_BIOSYN = re.compile(r"^(?:2|4)\.")     # transferases / lyases   -> biosynthesis
_EC_OXRED = re.compile(r"^1\.")            # oxidoreductases         -> oxidoreductase
_RE_AARS = re.compile(r"tRNA\s+(?:ligase|synthetase)", re.IGNORECASE)
_RE_TRANS = re.compile(r"transporter|permease|abc|atp-binding", re.IGNORECASE)
_RE_BIOSYN = re.compile(
    r"aminotransferase|dehydratase|synthase|anthranilate|chorismate|"
    r"isopropylmalate|homoserine",
    re.IGNORECASE,
)
_RE_HYPO = re.compile(r"hypothetical", re.IGNORECASE)


def classify_func(ec, protein) -> tuple[str, str]:
    """Return ``(func_class, func_source)``: EC number first, then protein-name regex."""
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


# =============================================================================
# Step 6: assemble member + locus records
# =============================================================================

def _clean_str(value):
    """A trimmed string, or ``None`` for a missing/blank cell."""
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def _to_int(value):
    return None if pd.isna(value) else int(value)


def _to_float(value, ndigits: int = 2):
    if pd.isna(value):
        return None
    try:
        return round(float(value), ndigits)
    except (TypeError, ValueError):
        return None


def _ordered_unique(values) -> list:
    """Distinct values in first-seen order (the ``dict.fromkeys`` idiom)."""
    return list(dict.fromkeys(values))


def _parse_other_stems(value) -> list:
    """Parse the Master ``other_stems`` cell into ordered ``(lo, hi)`` int pairs.

    Blank / unparseable cells yield ``[]`` (the overlay then omits the Stem II split).
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
    spans = []
    for item in raw:
        try:
            a, b = int(item[0]), int(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        spans.append((min(a, b), max(a, b)))
    return spans


def derive_stems(row) -> list:
    """Ordered, labelled stem spans for a member's RNA colour overlay.

    Spans are 1-based, inclusive, leader-relative (same frame as ``fasta_sequence`` /
    ``whole_antiterm_structure``): Stem I = ``s1_start..s1_end``, Stem III =
    ``stem3_start..stem3_end``, antiterminator = ``antiterm_start..antiterm_end``, and
    the Stem II region (``stem2_region_*``) split into Stem II (5'-most helix) + Stem
    IIA/B (the following pseudoknot helix) from the ``other_stems`` helices inside it.
    Missing domains are simply omitted.
    """
    def span(c0, c1):
        a, b = _to_int(row[c0]), _to_int(row[c1])
        if a is None or b is None or a <= 0 or b <= 0:
            return None
        return (min(a, b), max(a, b))

    stems = []
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
            stems.append(("ii", inner[0]))
            stems.append(("iiab", (inner[1][0], inner[-1][1])))
        else:
            stems.append(("ii", inner[0] if inner else s2_region))
    s3 = span("stem3_start", "stem3_end")
    if s3:
        stems.append(("iii", s3))
    at = span("antiterm_start", "antiterm_end")
    if at:
        stems.append(("at", at))
    return [{"key": key, "start": lo, "end": hi} for key, (lo, hi) in stems]


def _member_structure(value, *, legacy: bool):
    """The member's Stem-I dot-bracket structure, or ``None`` when it is absent.

    Default: a missing/blank source ``Structure`` is null-guarded to ``None``,
    like every other field. ``legacy=True`` reproduces the published artifact's
    historical quirk, where a missing ``Structure`` (NaN) went ``str(nan)`` ->
    ``"nan"`` -> a fake three-base unpaired ``"..."`` (balanced, so it slipped
    past verification). On the published source no selected member has a missing
    ``Structure``, so the two modes emit identical bytes -- the guard is a
    forward fix for any future source revision.
    """
    if legacy:
        return wuss_to_dotbracket(str(value))
    struct = _clean_str(value)
    return wuss_to_dotbracket(struct) if struct else None


def _assemble_member(row: pd.Series, member: dict, accession: str, strand: str,
                     legacy_structure: bool = False) -> dict:
    """Build one ``members.json`` element record from its representative Master row."""
    locus_start, locus_end = int(row["locus_start_n"]), int(row["locus_end_n"])

    uname = _clean_str(row["unique_name"])
    tbdb_url = f"https://tbdb.io/tboxes/{uname}.html" if uname else None
    lo, hi = (locus_start, locus_end) if locus_start <= locus_end else (locus_end, locus_start)
    ncbi_url = (
        f"https://www.ncbi.nlm.nih.gov/nuccore/{accession}"
        f"?report=genbank&from={lo}&to={hi}"
    )

    window, genome = {}, {}
    for name, (c0, c1) in _FEATURE_SPANS.items():
        window[name] = [_to_int(row[c0]), _to_int(row[c1])]
        genome[name] = [project(row[c0], locus_start, strand), project(row[c1], locus_start, strand)]

    ec, protein = _clean_str(row["downstream_protein_EC"]), _clean_str(row["downstream_protein"])
    func_class, func_source = classify_func(ec, protein)

    return {
        "member_id": member["member_id"],
        "tandem_id": member["tandem_id"],
        "ordinal": member["ordinal"],
        "unique_name": uname,
        "tbdb_url": tbdb_url,
        "ncbi_url": ncbi_url,
        "specifier": {"aa": _clean_str(row["amino_acid_top"]), "codon": _clean_str(row["refine_codon_top"])},
        "coords": {"leader": [locus_start, locus_end], "window": window, "genome": genome},
        "fasta_sequence": _clean_str(row["FASTA_sequence"]),
        "aligned_sequence": _clean_str(row["Sequence"]),
        "structure": _member_structure(row["Structure"], legacy=legacy_structure),
        "whole_antiterm_structure": _clean_str(row["whole_antiterm_structure"]),
        "term_structure": _clean_str(row["term_structure"]),
        # Terminator-hairpin sequence; pairs 1:1 with term_structure WHERE PRESENT.
        # Independent source cell -> can be null even when term_structure is not (T0360.m2).
        "term_sequence": _clean_str(row["term_sequence"]),
        "stems": derive_stems(row),
        "deltadelta_g": _to_float(row["deltadelta_g"]),
        "terminator_energy": _to_float(row["terminator_energy"]),
        "type": _clean_str(row["type"]),
        "completeness": _clean_str(row["Completeness"]),
        "trna": _clean_str(row["trna_family_top"]),
        "downstream": {
            "protein": protein,
            "id": _clean_str(row["downstream_protein_id"]),
            "ec": ec,
            "desc": _clean_str(row["protein_desc"]),
            "func_class": func_class,
            "func_source": func_source,
        },
    }


def _summarize_locus(loc: dict, member_objs: list[dict], master: pd.DataFrame) -> dict:
    """Roll a locus's ordered members up into one ``loci.json`` record (steps 5-6)."""
    # Locus specifier: the distinct member specifiers (alphabetical), or '?'.
    distinct_aa = _ordered_unique(o["specifier"]["aa"] for o in member_objs if o["specifier"]["aa"])
    specifier_aa = "?" if not distinct_aa else ";".join(sorted(distinct_aa))
    same_specifier = len(distinct_aa) == 1

    # A core counts as "complete" when its specifier codon was called.
    n_complete = sum(1 for o in member_objs if (o["coords"]["window"]["codon"][0] or 0) > 0)
    confidence = "high" if n_complete >= 2 else "low"

    core5s = [int(master.loc[idx, "core5"]) for idx in loc["core_indices"]]
    core_span = abs(max(core5s) - min(core5s))

    distinct_ids = _ordered_unique(o["downstream"]["id"] for o in member_objs if o["downstream"]["id"])
    downstream_id = ";".join(distinct_ids) if distinct_ids else None
    distinct_genes = _ordered_unique(o["downstream"]["protein"] for o in member_objs if o["downstream"]["protein"])
    downstream_gene = ";".join(distinct_genes) if distinct_genes else None

    # Locus func_class: one shared downstream gene id lets the locus inherit that
    # member's EC-backed class; multi-gene (or gene-less) loci fall back to
    # classifying the joined downstream gene text.
    if len(distinct_ids) == 1:
        # single regulated gene: inherit that member's EC-backed class
        matched = next(o for o in member_objs if o["downstream"]["id"] == distinct_ids[0])
        func_class, func_source = matched["downstream"]["func_class"], matched["downstream"]["func_source"]
    else:
        func_class, func_source = classify_func(None, downstream_gene)

    locus_type = "Translational" if any(o["type"] == "Translational" for o in member_objs) else "Transcriptional"
    first = master.loc[loc["core_indices"][0]]

    return {
        "tandem_id": loc["tandem_id"],
        "accession": loc["accession"],
        "strand": loc["strand"],
        "organism": _clean_str(first["GBSeq_organism"]),
        "phylum": _clean_str(first["phylum"]),
        "tax_id": _clean_str(first["TaxId"]),
        "n_cores": loc["n_cores"],
        "n_complete_cores": n_complete,
        "core_span": core_span,
        "specifier_aa": specifier_aa,
        "same_specifier": same_specifier,
        "confidence": confidence,
        "type": locus_type,
        "func_class": func_class,
        "func_source": func_source,
        "downstream_gene": downstream_gene,
        "downstream_id": downstream_id,
        "member_ids": [o["member_id"] for o in member_objs],
        "mean_pairwise_identity": None,  # filled in step 7
    }


def assemble(detected: list[dict], master: pd.DataFrame,
             legacy_structure: bool = False) -> tuple[list[dict], dict[str, dict]]:
    """Build the locus list and member map (steps 5-6)."""
    members_map: dict[str, dict] = {}
    locus_objs: list[dict] = []

    for loc in detected:
        tandem_id, accession, strand = loc["tandem_id"], loc["accession"], loc["strand"]

        member_objs: list[dict] = []
        for ordinal, idx in enumerate(loc["core_indices"], start=1):
            stub = {"member_id": f"{tandem_id}.m{ordinal}", "tandem_id": tandem_id, "ordinal": ordinal}
            obj = _assemble_member(master.loc[idx], stub, accession, strand, legacy_structure)
            members_map[obj["member_id"]] = obj
            member_objs.append(obj)

        locus_objs.append(_summarize_locus(loc, member_objs, master))

    return locus_objs, members_map


# =============================================================================
# Step 7: intra-locus pairwise %-identity
# =============================================================================

def _new_aligner() -> PairwiseAligner:
    """A deterministic global nucleotide aligner (gaps count against identity)."""
    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.match_score = 2.0
    aligner.mismatch_score = -1.0
    aligner.open_gap_score = -5.0
    aligner.extend_gap_score = -0.5
    return aligner


def _pairwise_identity(aligner: PairwiseAligner, a: str, b: str) -> float:
    a, b = (a or "").upper(), (b or "").upper()
    counts = aligner.align(a, b)[0].counts()
    length = counts.identities + counts.mismatches + counts.gaps
    return 0.0 if length == 0 else round(100.0 * counts.identities / length, 1)


def compute_identity(locus_objs: list[dict], members_map: dict[str, dict]) -> list[dict]:
    """The 488 intra-locus pairwise identities; also fills ``mean_pairwise_identity``."""
    aligner = _new_aligner()
    pairs: list[dict] = []
    for loc in locus_objs:
        ids = loc["member_ids"]
        loc_pids: list[float] = []
        for a, b in combinations(ids, 2):
            pid = _pairwise_identity(aligner, members_map[a]["fasta_sequence"], members_map[b]["fasta_sequence"])
            pairs.append({"a": a, "b": b, "identity": pid})
            loc_pids.append(pid)
        loc["mean_pairwise_identity"] = round(sum(loc_pids) / len(loc_pids), 1)
    return pairs


# =============================================================================
# Rollups: facets + summary
# =============================================================================

def _count_dist(objs: list[dict], key: str) -> list[dict]:
    """Value -> count records, ordered by (count desc, value asc)."""
    counts = Counter(obj[key] for obj in objs if obj[key] is not None)
    return [{"value": v, "count": c} for v, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def _median(values: list[float]):
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    mid = n // 2
    return round(s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2, 2)


def build_facets(locus_objs: list[dict]) -> dict[str, list[str]]:
    def freq_desc(key):
        counts = Counter(o[key] for o in locus_objs if o[key] is not None)
        return [v for v, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]

    def sorted_distinct(key):
        return sorted({o[key] for o in locus_objs if o[key] is not None})

    return {
        "specifier": freq_desc("specifier_aa"),
        "phylum": sorted_distinct("phylum"),
        "type": sorted_distinct("type"),
        "confidence": sorted_distinct("confidence"),
        "func_class": sorted_distinct("func_class"),
    }


def build_summary(locus_objs: list[dict], members_map: dict[str, dict], pairs: list[dict]) -> dict:
    n = len(locus_objs)
    same = sum(1 for o in locus_objs if o["same_specifier"])
    # Keep the emitted key order fixed at {"high", "low"} regardless of data order.
    conf_counts = Counter(o["confidence"] for o in locus_objs)
    conf = {"high": conf_counts["high"], "low": conf_counts["low"]}
    ddg = [m["deltadelta_g"] for m in members_map.values() if m["deltadelta_g"] is not None]
    pid = [p["identity"] for p in pairs]
    return {
        "counts": {
            "loci": n,
            "members": len(members_map),
            "intra_locus_pairs": len(pairs),
            "pairs": sum(1 for o in locus_objs if o["n_cores"] == 2),
            "triples": sum(1 for o in locus_objs if o["n_cores"] == 3),
            "non_firmicutes": sum(1 for o in locus_objs if o["phylum"] != "Firmicutes"),
        },
        "confidence": conf,
        "specifier_agreement": {"same": same, "mixed": n - same},
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


# =============================================================================
# Step 8: tree-build FASTAs (Stem-I length gate)
# =============================================================================

def _native_stemI_span(member: dict):
    a, b = member["coords"]["window"]["s1"]
    if a is None or b is None or a <= 0 or b <= 0:
        return None
    return abs(b - a) + 1


def _antiterm_core(member: dict):
    a, b = member["coords"]["window"]["antiterm"]
    seq = member["fasta_sequence"] or ""
    if a is None or b is None or a <= 0 or b <= 0:
        return None
    lo, hi = (a, b) if a <= b else (b, a)
    return seq[lo - 1:hi] if hi <= len(seq) else None


def write_tree_fastas(members_map: dict[str, dict], out_dir: Path) -> tuple[int, int]:
    """Emit the main (length-gated) + antiterminator-fallback FASTAs."""
    main, fallback = [], []
    for member_id, member in members_map.items():
        span = _native_stemI_span(member)
        (main if (span is not None and span >= STEMI_MIN_SPAN) else fallback).append(member_id)

    with (out_dir / "tree_input.fasta").open("w", encoding="utf-8") as fh:
        for member_id in main:
            member = members_map[member_id]
            header = member["unique_name"] or member_id  # never write a literal "None"
            fh.write(f">{header}\n{member['fasta_sequence']}\n")

    with (out_dir / "antiterm_fallback.fasta").open("w", encoding="utf-8") as fh:
        for member_id in fallback:
            member = members_map[member_id]
            core = _antiterm_core(member)
            if core:
                fh.write(f">{member['unique_name'] or member_id}\n{core}\n")
    return len(main), len(fallback)


# =============================================================================
# Output + self-verification
# =============================================================================

def _write_json(path: Path, obj) -> None:
    with path.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=True)


# =============================================================================
# Member-level base table (members.csv) -- the same database as one flat row per
# element, with the component-stem spans (step 6) flattened into fixed columns so
# the stem identity lives IN the main table (not only inside members.json). The
# stem start/end values are 1-based, inclusive, leader-relative -- the EXACT spans
# the web app colours the RNA secondary structure by. Blank cell == stem absent.
# =============================================================================

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

#: Conserved-feature window columns alongside the stems (leader-relative, 1-based,
#: inclusive -- same frame as the stem spans): the specifier loop + codon (Stem I), the
#: 5'-UGGN-3' T-box motif (``discrim``, in the antiterminator), and the terminator
#: hairpin + its sequence. Blank start/end == that window is absent on the element.
_FEATURE_CSV_FEATS = ("s1_loop", "codon", "discrim", "term")
_FEATURE_CSV_COLS = [f"{feat}_{end}" for feat in _FEATURE_CSV_FEATS for end in ("start", "end")] + [
    "term_sequence"
]
#: Full members.csv header: lead -> stem spans -> feature windows -> the two deep-link URLs.
_MEMBER_CSV_HEADER = (
    _MEMBER_CSV_LEAD + _STEM_CSV_COLS + _FEATURE_CSV_COLS + ["tbdb_url", "ncbi_url"]
)


def _csv_window(window: dict, feat: str, length: int):
    """A feature's leader-relative ``(lo, hi)`` for members.csv, or ``(None, None)`` when
    the window is absent / a missing sentinel (start or end < 1) OR runs off the leader
    3' end (``hi > length``). This is the FULL web-app drop rule -- ``validSpan``
    (ascending + >= 1) AND the ``hi <= length`` guard the viewers apply -- so the CSV
    never carries a span the app does not draw (e.g. a corrupt term window past the end)."""
    span = window.get(feat) or [None, None]
    a, b = span[0], span[1]
    if a is None or b is None or a < 1 or b < 1:
        return (None, None)
    lo, hi = min(a, b), max(a, b)
    if hi > length:
        return (None, None)
    return (lo, hi)


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
    window = (member.get("coords") or {}).get("window") or {}
    leader_length = lead["leader_length"]
    for feat in _FEATURE_CSV_FEATS:
        lo, hi = _csv_window(window, feat, leader_length)
        row.extend([lo, hi])
    row.append(member.get("term_sequence"))
    row.extend([member.get("tbdb_url"), member.get("ncbi_url")])
    return row


def write_members_csv(locus_objs: list, members_map: dict, out_dir: Path) -> int:
    """Write members.csv -- the member-level base table with flattened stem spans.

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


def write_table(path: Path, locus_objs: list[dict], members_map: dict[str, dict]) -> None:
    """Optional human-readable per-locus table (tab-separated)."""
    cols = ["tandem_id", "accession", "strand", "organism", "phylum", "tax_id",
            "n_cores", "n_complete_cores", "core_span", "specifier_aa", "same_specifier",
            "confidence", "type", "func_class", "func_source", "downstream_gene",
            "mean_pairwise_identity", "member_unique_names"]
    with path.open("w", encoding="utf-8") as fh:
        fh.write("\t".join(cols) + "\n")
        for o in locus_objs:
            unames = ";".join(str(members_map[mid]["unique_name"]) for mid in o["member_ids"])
            row = [o[c] for c in cols[:-1]] + [unames]
            fh.write("\t".join("" if v is None else str(v) for v in row) + "\n")


def verify_invariants(locus_objs: list[dict], members_map: dict[str, dict], pairs: list[dict]) -> None:
    """Assert the always-true structural invariants; raise (non-zero exit) on violation.

    These hold for *any* valid run -- they check internal consistency (the pair
    arithmetic, per-member resolvability, balanced Stem-I structures, leader-span
    agreement), never dataset-specific totals. See ``verify_golden`` for those.
    """
    problems: list[str] = []

    expected_pairs = sum(comb(o["n_cores"], 2) for o in locus_objs)
    if len(pairs) != expected_pairs:
        problems.append(f"pair count {len(pairs)} != sum C(n_cores,2) = {expected_pairs}")

    sum_cores = sum(o["n_cores"] for o in locus_objs)
    if sum_cores != len(members_map):
        problems.append(f"sum(n_cores)={sum_cores} != members={len(members_map)}")

    for member_id, m in members_map.items():
        if not (m["tbdb_url"] or m["ncbi_url"]):
            problems.append(f"{member_id}: resolves to neither tbdb nor NCBI")
        if not m["fasta_sequence"]:
            problems.append(f"{member_id}: empty fasta_sequence")
        if m["structure"] and not is_balanced(m["structure"]):
            problems.append(f"{member_id}: Stem-I structure not balanced")
        a, b = m["coords"]["leader"]
        if m["fasta_sequence"] and len(m["fasta_sequence"]) != abs(b - a) + 1:
            problems.append(f"{member_id}: fasta length != leader span")

    if problems:
        raise SystemExit("INVARIANT CHECK FAILED:\n  " + "\n  ".join(problems))


def verify_golden(locus_objs: list[dict], members_map: dict[str, dict], pairs: list[dict]) -> None:
    """Assert the published dataset's hardcoded counts + golden locus.

    This is the single source of truth for the magic numbers: 470 loci / 949
    members / 488 pairs, the 394 high / 76 low confidence split, and the
    CP045927 TRP->VAL order. Gated by ``--golden`` (default on); ``--no-golden``
    skips it so the script can validate an updated source without these firing.
    """
    problems: list[str] = []

    if len(locus_objs) != 470:
        problems.append(f"locus count {len(locus_objs)} != 470")
    if len(members_map) != 949:
        problems.append(f"member count {len(members_map)} != 949")
    if len(pairs) != 488:
        problems.append(f"pair count {len(pairs)} != 488")

    conf = Counter(o["confidence"] for o in locus_objs)
    if (conf["high"], conf["low"]) != (394, 76):
        problems.append(f"confidence split {conf['high']}/{conf['low']} != 394/76")

    # Golden: Staphylococcus agnetis CP045927 stacks TRP then VAL (transcript 5'->3').
    golden = next((o for o in locus_objs if o["accession"] == "CP045927"), None)
    if golden is None:
        problems.append("golden locus CP045927 missing")
    else:
        order = [members_map[mid]["specifier"]["aa"] for mid in golden["member_ids"]]
        if order != ["TRP", "VAL"]:
            problems.append(f"golden CP045927 order {order} != ['TRP', 'VAL']")

    if problems:
        raise SystemExit("GOLDEN CHECK FAILED:\n  " + "\n  ".join(problems))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Reproduce the tbdb.tandem tandem-T-box database from Master_tboxes.csv.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--master", type=Path, required=True, help="path to Master_tboxes.csv")
    parser.add_argument("--out", type=Path, required=True, help="output directory")
    parser.add_argument("--emit-table", action="store_true", help="also write tandem_loci.tsv")
    parser.add_argument(
        "--golden", action=argparse.BooleanOptionalAction, default=True,
        help="also assert the published counts + golden locus (default: on; --no-golden to skip)",
    )
    parser.add_argument(
        "--legacy-empty-structure", action="store_true",
        help="reproduce the published artifact's legacy quirk: a missing Stem-I "
             "Structure becomes a fake \"...\" instead of null (no-op on the "
             "current source; here only for strict historical reproduction)",
    )
    args = parser.parse_args(argv)

    print(f"Reading {args.master} ...")
    master = load_master(args.master)

    print("Detecting tandem loci (cluster -> collapse -> tandem test) ...")
    detected = detect_loci(master)
    locus_objs, members_map = assemble(detected, master, legacy_structure=args.legacy_empty_structure)
    print(f"  {len(locus_objs)} loci, {len(members_map)} canonical members.")

    print("Computing intra-locus pairwise identities ...")
    pairs = compute_identity(locus_objs, members_map)

    summary = build_summary(locus_objs, members_map, pairs)

    print("Verifying invariants ...")
    verify_invariants(locus_objs, members_map, pairs)
    if args.golden:
        verify_golden(locus_objs, members_map, pairs)

    args.out.mkdir(parents=True, exist_ok=True)
    _write_json(args.out / "loci.json", {"loci": locus_objs, "facets": build_facets(locus_objs)})
    _write_json(args.out / "members.json", members_map)
    _write_json(args.out / "identity.json", pairs)
    _write_json(args.out / "summary.json", summary)
    n_members_csv = write_members_csv(locus_objs, members_map, args.out)
    main_tips, fallback = write_tree_fastas(members_map, args.out)
    if args.emit_table:
        write_table(args.out / "tandem_loci.tsv", locus_objs, members_map)

    print(
        f"\nWrote -> {args.out}\n"
        f"  loci.json        {len(locus_objs)} loci\n"
        f"  members.json     {len(members_map)} members\n"
        f"  identity.json    {len(pairs)} intra-locus pairs\n"
        f"  summary.json     ({summary['confidence']['high']} high / "
        f"{summary['confidence']['low']} low confidence)\n"
        f"  members.csv      {n_members_csv} members (flat base table incl. stem spans)\n"
        f"  tree_input.fasta {main_tips} length-gated members (+ {fallback} in the fallback)\n"
        + (f"  tandem_loci.tsv  {len(locus_objs)} rows\n" if args.emit_table else "")
        + (
            "All invariants passed (470 / 949 / 488, balanced structures, golden CP045927)."
            if args.golden else
            "Structural invariants passed (golden checks skipped via --no-golden)."
        )
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
