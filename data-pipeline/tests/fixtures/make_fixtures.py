"""Regenerate the committed test fixtures from the read-only TBDB sources.

NOT a test (the ``make_`` prefix keeps pytest from collecting it). Run manually
when the fixture set needs to change; it reads the 92 MB ``Master_tboxes.csv``
that is never committed (PLAN section 3, 11.1) and writes a small, faithful subset
under ``data-pipeline/tests/fixtures/`` so ``test_build.py`` runs deterministically
in CI without the source CSV (PLAN section 10.1).

    data-pipeline/.venv/bin/python data-pipeline/tests/fixtures/make_fixtures.py

Fixture loci (curated for coverage of every resolution path, PLAN section 5.1):

* **T0342** (CP045927, - strand) -- the gate #8 golden. A *collapse-recovered*
  locus: its single ``member_names`` token resolves to two Master rows >60 bp
  apart that the 60-bp collapse keeps as two physical cores (m1=TRP, m2=VAL with
  distinct ``unique_name``s). Exercises the minus-strand ordinal reversal +
  collapse path + mixed specifier.
* **T0001** (MNJJ01000215, + strand) -- a clean two-token plus-strand pair
  (ascending-coordinate ordinals; + projection).
* **T0062** (CP011974, + strand) -- a three-core triple on the plus strand
  (Sum C(3,2) = 3 identity pairs).
* **T0124** (CVRB01000005, - strand) -- a three-core triple on the minus strand
  (ordinal reversal over three cores).
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd

FIXTURE_LOCI = ["T0342", "T0001", "T0062", "T0124"]

ROOT = Path(__file__).resolve().parents[3]            # repo root
SRC = ROOT.parent                                     # /home/bioedca/tbox-phylogeny
MASTER = SRC / "tboxdb-master" / "Master_tboxes.csv"
TANDEM = SRC / "tandem_tbox_FINAL.tsv"
OUT = Path(__file__).resolve().parent                 # the fixtures/ dir


def main() -> None:
    tandem = pd.read_csv(TANDEM, sep="\t", dtype=str)
    sub = tandem[tandem["tandem_id"].isin(FIXTURE_LOCI)].copy()
    sub = sub.sort_values("tandem_id", kind="stable")
    if len(sub) != len(FIXTURE_LOCI):
        missing = set(FIXTURE_LOCI) - set(sub["tandem_id"])
        raise SystemExit(f"missing fixture loci in tandem source: {missing}")

    # Union of every member_names token across the fixture loci.
    tokens = {t for names in sub["member_names"] for t in names.split(";")}

    # Pull every Master row whose Name matches a token (full width -> faithful,
    # future-proof against _MASTER_COLS additions). Read as str so nothing coerces.
    master = pd.read_csv(MASTER, dtype=str)
    rows = master[master["Name"].isin(tokens)].copy()
    rows = rows.sort_values(["Name", "Tbox_start"], kind="stable")

    sub.to_csv(OUT / "tandem_subset.tsv", sep="\t", index=False)
    rows.to_csv(OUT / "master_subset.csv", index=False)

    print(f"tandem_subset.tsv: {len(sub)} loci {list(sub['tandem_id'])}")
    print(f"master_subset.csv: {len(rows)} Master rows for {len(tokens)} tokens")
    print(f"  tokens: {sorted(tokens)}")


if __name__ == "__main__":
    main()
