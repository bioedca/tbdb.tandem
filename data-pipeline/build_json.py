"""build_json.py -- TandemView offline data build (PLAN section 5).

The deterministic local job that turns the two read-only TBDB source files into
the static JSON the app loads and the ``tree_input.fasta`` the cluster tree build
consumes. It is the single source of truth for member resolution and field
provenance -- get those right here, once (PLAN section 5).

    python3 data-pipeline/build_json.py --master <csv> --tandem <tsv> --out public/data

This file is built up across Phase 0 in document order:

* **S0.3 (this step)** -- member resolution + coordinate projection (PLAN
  section 5.1): reproduce the 470 loci as exactly 949 canonical members held in
  memory. The ``--out`` directory is accepted but not yet written to.
* S0.4 -- per-member field assembly + the two-tier function classifier ->
  ``loci.json`` + ``members.json`` (PLAN section 5.2, 5.3).
* S0.5 -- ``summary.json`` + ``identity.json``.
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
import sys
from pathlib import Path

import pandas as pd

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


# --- Coordinate projection (PLAN section 5.1) -------------------------------

def project(offset: float, locus_start: int, strand: str) -> int:
    """Project a 1-based leader ``offset`` onto genome coordinates (PLAN 5.1).

    On the ``+`` strand the leader runs 5'->3' with increasing genome
    coordinate, so ``locus_start + offset - 1``; on ``-`` it runs the other way,
    ``locus_start - offset + 1``. ``offset`` and ``locus_start`` are taken from
    one Master row.
    """
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
    master = pd.read_csv(master_path, usecols=_RESOLUTION_COLS, dtype=str)
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
    # NOTE: JSON emission to --out lands in S0.4/S0.5/S0.6; S0.3 is in-memory only.
    return 0


if __name__ == "__main__":
    sys.exit(main())
