"""build_tree_artifacts.py -- map the cluster tree-build outputs to the four
committed app artifacts (PLAN section 5.2, 6; Track B, run at SB.4).

The cluster job (``build_tree.sbatch``) emits Newick files; this *local* script
turns them + the data build's ``members.json`` / ``loci.json`` into what the
``/tree`` view loads::

    tree.nwk            <- tree_elements.midpoint.nwk  (midpoint-rooted, LAYOUT ONLY;
                                                        the app displays it UNROOTED)
    tree_fallback.nwk   <- tree_fallback.nwk            (antiterminator-core MAFFT tree)
    tree_tips.json       per-tip metadata: which tree the tip lives in (main /
                         fallback / absent), specifier, phylum, tandem_id, ordinal
    tree_locus_map.json  tandem_id -> [tip unique_name, ...] for the per-locus collapse

Usage (from the repo root, after SB.3 retrieves the Newicks into the run dir)::

    python data-pipeline/build_tree_artifacts.py \
        --main-nwk tree_elements.midpoint.nwk \
        --fallback-nwk tree_fallback.nwk \
        --members public/data/members.json --loci public/data/loci.json \
        --out public/data

Gate #10 (PLAN section 5.4): the main-tree tip set parsed from the Newick must equal
the S0.6 length-gate's main partition over ``members.json`` -- asserted here, so a
dropped/extra tip aborts the artifact build loudly.

HARD CONSTRAINT (PLAN section 6, CLAUDE.md section 6): no polarity from tips. The
stored ``tree.nwk`` is midpoint-rooted for stable layout only; nothing here (or in the
app) reads ancestry from it.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

# The Stem-I length-gate is the single source of truth for the main/fallback split
# (S0.6). Reused here so the gate-#10 check compares the Newick against the exact
# same partition the FASTAs were emitted from.
from build_json import partition_for_tree

#: A Newick leaf label: the token after a "(" or "," and before its ":" branch length.
#: Internal-node support labels follow a ")" and are therefore not captured.
_TIP_RE = re.compile(r"[(,]\s*([^(),:;\s]+)\s*:")


def parse_newick_tips(text: str) -> set[str]:
    """Return the set of leaf labels in a Newick string (PLAN section 6 tips)."""
    return set(_TIP_RE.findall(text))


def assemble_tip_metadata(
    members_map: dict[str, dict],
    locus_phylum: dict[str, str | None],
    main_tips: set[str],
    fallback_tips: set[str],
) -> tuple[dict[str, dict], dict[str, list[str]], dict[str, int]]:
    """Build ``(tree_tips, tree_locus_map, counts)`` from the parsed tip sets.

    ``tree_tips`` is keyed by ``unique_name`` (the Newick label, the deep-link key);
    each entry records the member's ``member_id`` / ``tandem_id`` / ``ordinal``,
    its specifier ``aa`` and locus ``phylum`` (for the tip color + phylum ring), and
    which ``tree`` it lives in: ``main``, ``fallback``, or ``absent`` (in neither --
    the PLAN section 6 "flagged-absent" case). ``tree_locus_map`` maps each
    ``tandem_id`` to its tip ``unique_name``s (tips only) for the per-locus collapse.
    Iterates ``members_map`` in resolution order, so output ordering is deterministic.
    """
    tree_tips: dict[str, dict] = {}
    tree_locus_map: dict[str, list[str]] = {}
    counts = {"main": 0, "fallback": 0, "absent": 0}

    for member_id, member in members_map.items():
        uname = member["unique_name"]
        tandem_id = member["tandem_id"]
        if uname in main_tips:
            tree = "main"
        elif uname in fallback_tips:
            tree = "fallback"
        else:
            tree = "absent"
        counts[tree] += 1
        tree_tips[uname] = {
            "member_id": member_id,
            "tandem_id": tandem_id,
            "ordinal": member["ordinal"],
            "specifier": member["specifier"]["aa"],
            "phylum": locus_phylum.get(tandem_id),
            "tree": tree,
        }
        if tree != "absent":
            tree_locus_map.setdefault(tandem_id, []).append(uname)

    return tree_tips, tree_locus_map, counts


def _write_json(path: Path, obj: object) -> None:
    """Write compact deterministic JSON (matches build_json.py)."""
    with path.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Post-process the cluster tree outputs into the four committed "
        "TandemView tree artifacts (PLAN section 5.2, 6).",
    )
    parser.add_argument(
        "--main-nwk", type=Path, default=Path("tree_elements.midpoint.nwk"),
        help="midpoint-rooted main Stem-I Newick (layout only) -> tree.nwk",
    )
    parser.add_argument(
        "--fallback-nwk", type=Path, default=Path("tree_fallback.nwk"),
        help="antiterminator-core fallback Newick -> tree_fallback.nwk",
    )
    parser.add_argument("--members", type=Path, default=Path("public/data/members.json"))
    parser.add_argument("--loci", type=Path, default=Path("public/data/loci.json"))
    parser.add_argument("--out", type=Path, default=Path("public/data"))
    args = parser.parse_args(argv)

    members_map = json.loads(args.members.read_text(encoding="utf-8"))
    loci_doc = json.loads(args.loci.read_text(encoding="utf-8"))
    locus_phylum = {l["tandem_id"]: l["phylum"] for l in loci_doc["loci"]}

    main_tips = parse_newick_tips(args.main_nwk.read_text(encoding="utf-8"))
    fallback_tips = parse_newick_tips(args.fallback_nwk.read_text(encoding="utf-8"))

    # Gate #10: the Newick's main tips must be exactly the length-gate's main set.
    main_ids, _ = partition_for_tree(members_map)
    expected_main = {members_map[mid]["unique_name"] for mid in main_ids}
    if main_tips != expected_main:
        missing = sorted(expected_main - main_tips)
        extra = sorted(main_tips - expected_main)
        raise SystemExit(
            f"gate #10 FAILED: main tree has {len(main_tips)} tips, expected "
            f"{len(expected_main)} (the S0.6 length-gate set). "
            f"missing from tree: {missing[:10]}{'...' if len(missing) > 10 else ''}; "
            f"unexpected in tree: {extra[:10]}{'...' if len(extra) > 10 else ''}"
        )

    tree_tips, tree_locus_map, counts = assemble_tip_metadata(
        members_map, locus_phylum, main_tips, fallback_tips
    )

    args.out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(args.main_nwk, args.out / "tree.nwk")
    shutil.copyfile(args.fallback_nwk, args.out / "tree_fallback.nwk")
    _write_json(args.out / "tree_tips.json", tree_tips)
    _write_json(args.out / "tree_locus_map.json", tree_locus_map)

    print(
        f"tree.nwk: {counts['main']} main tips | tree_fallback.nwk: "
        f"{counts['fallback']} fallback tips | absent (flagged): {counts['absent']}"
    )
    print(
        f"wrote tree.nwk + tree_fallback.nwk + tree_tips.json ({len(tree_tips)}) + "
        f"tree_locus_map.json ({len(tree_locus_map)} loci) -> {args.out}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
