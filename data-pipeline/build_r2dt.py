#!/usr/bin/env python3
"""Build the committed R2DT secondary-structure assets (PLAN section 9).

The in-app structure viewer offers two renders of each T-box element: the legacy
fornac force layout (best-effort) and an **R2DT** diagram drawn on the canonical
**RF00230 / T-box template** -- the recognisable, reproducible textbook layout
(https://github.com/r2dt-bio/R2DT). R2DT itself is a heavyweight templated
pipeline (Infernal + a covariance-model template library) that cannot run in the
browser, so -- exactly like the similarity tree -- the diagrams are generated
offline once and committed; the static SPA just fetches and colours them.

Two stages, decoupled by the (gated, offline) R2DT run itself:

  1. ``fasta``  -- emit an R2DT input FASTA (one gap-free RNA leader per canonical
     member, header == ``member_id``) to feed a batch R2DT run
     (``r2dt.py draw r2dt_input.fasta out/``), whether that runs under local
     Docker (``rnacentral/r2dt``), the lab cluster (Singularity), or the EMBL-EBI
     R2DT web service. R2DT auto-classifies T-box leaders to the RF00230 template.

  2. ``ingest`` -- read the R2DT run's per-sequence RNA-2D-JSON output (+ the
     classification metadata) and write the COMPACT, recolour-ready per-member
     assets this app commits + serves::

         public/data/r2dt/<member_id>.json   coords + base pairs + sequence
         public/data/r2dt/manifest.json      members with a diagram + template id

     The web app fetches one ``<member_id>.json`` on demand and colours each
     nucleotide by its structural domain CLIENT-SIDE from the same
     ``src/lib/color.ts`` ``STEM_COLORS`` palette the fornac overlay uses, so the
     colours are defined in exactly one place and match across both viewers.

R2DT's ``residueIndex`` is 1-based over the nucleotides (the ``5'``/``3'`` end
markers are indices 0 and N+1 and are dropped), the SAME frame as members.json's
leader-relative stem spans -- so the committed coordinates index the stems
directly, with no offset. ``ingest`` asserts every diagram's sequence equals its
member's ``fasta_sequence`` (T->U); a mismatch would silently misalign the colour
overlay, so it is a hard error (the member is skipped and reported).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

#: RNA nucleotide alphabet R2DT emits (drops the ``5'``/``3'`` end-marker entries).
_NT = frozenset("ACGU")


def to_rna(seq: str) -> str:
    """DNA -> RNA for R2DT input: upper-case, T->U. Non-ACGU codes pass through."""
    return (seq or "").upper().replace("T", "U")


def load_members(path: Path) -> dict:
    """Load members.json (the whole map, keyed by member_id)."""
    return json.loads(path.read_text())


# --- stage 1: R2DT input FASTA ----------------------------------------------

def write_input_fasta(members: dict, out_path: Path) -> int:
    """Write one record per member (``>member_id`` / RNA leader). Returns the count."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        for member_id, m in members.items():
            seq = to_rna(m.get("fasta_sequence") or "")
            if seq:
                fh.write(f">{member_id}\n{seq}\n")
    return len(members)


# --- stage 2: ingest R2DT output -> compact committed assets -----------------

def compact_from_r2dt_json(raw: dict) -> dict | None:
    """Extract the compact {seq, x, y, pairs} from one R2DT RNA-2D-JSON document.

    Returns ``None`` if the document is not the expected single-molecule shape.
    Nucleotides are taken in ``residueIndex`` order (1..N); the ``5'``/``3'`` end
    markers (non-ACGU ``residueName``) are dropped. Base pairs are kept as ordered
    ``[lo, hi]`` 1-based index pairs with both ends inside 1..N.
    """
    # One try/except over the WHOLE extraction: a single malformed document (missing
    # residueIndex/x/y, non-numeric coords, ...) must be reported as one skipped member
    # by ingest(), never crash the batch (the module's stated contract).
    try:
        mol = raw["rnaComplexes"][0]["rnaMolecules"][0]
        residues = mol["sequence"]
        base_pairs = mol.get("basePairs", [])

        nts = sorted(
            (r for r in residues if r.get("residueName") in _NT),
            key=lambda r: r["residueIndex"],
        )
        if not nts:
            return None
        n = len(nts)
        # residueIndex must be the contiguous 1..N frame the stems index into.
        if [r["residueIndex"] for r in nts] != list(range(1, n + 1)):
            return None

        pairs: list[list[int]] = []
        seen: set[tuple[int, int]] = set()
        for bp in base_pairs:
            a, b = bp.get("residueIndex1"), bp.get("residueIndex2")
            if not isinstance(a, int) or not isinstance(b, int):
                continue
            lo, hi = (a, b) if a <= b else (b, a)
            if 1 <= lo < hi <= n and (lo, hi) not in seen:
                seen.add((lo, hi))
                pairs.append([lo, hi])
        pairs.sort()

        return {
            "seq": "".join(r["residueName"] for r in nts),
            "x": [round(float(r["x"]), 1) for r in nts],
            "y": [round(float(r["y"]), 1) for r in nts],
            "pairs": pairs,
        }
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def read_metadata(path: Path | None) -> dict[str, tuple[str | None, str | None]]:
    """Parse R2DT classification metadata (``member_id\\ttemplate\\tsource`` rows).

    Header-less, tab-separated; only the first three columns are used. Missing file
    -> empty map (templates default to ``None`` in the manifest).
    """
    out: dict[str, tuple[str | None, str | None]] = {}
    if not path or not path.exists():
        return out
    for line in path.read_text().splitlines():
        cols = line.rstrip("\n").split("\t")
        if not cols or not cols[0] or cols[0].lower() in {"sequence", "seq_id", "name"}:
            continue
        template = cols[1].strip() or None if len(cols) > 1 else None
        source = cols[2].strip() or None if len(cols) > 2 else None
        out[cols[0].strip()] = (template, source)
    return out


def ingest(
    results_dir: Path, members: dict, out_dir: Path, metadata_path: Path | None
) -> tuple[int, list[str]]:
    """Convert every ``<member_id>.json`` R2DT output into a committed compact asset.

    Returns ``(n_written, problems)``. A diagram whose sequence does not match its
    member's ``fasta_sequence`` (T->U), or whose member_id is unknown, is a problem
    (skipped, reported) -- never silently written, since it would misalign colours.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    meta = read_metadata(metadata_path)
    manifest: dict[str, dict] = {}
    problems: list[str] = []

    for json_path in sorted(results_dir.glob("*.json")):
        member_id = json_path.stem
        if member_id == "manifest":
            continue
        if member_id not in members:
            problems.append(f"{member_id}: unknown member_id (not in members.json)")
            continue
        try:
            raw = json.loads(json_path.read_text())
        except json.JSONDecodeError as exc:
            problems.append(f"{member_id}: unreadable R2DT JSON ({exc})")
            continue
        compact = compact_from_r2dt_json(raw)
        if compact is None:
            problems.append(f"{member_id}: unexpected R2DT JSON shape")
            continue
        expected = to_rna(members[member_id].get("fasta_sequence") or "")
        if compact["seq"] != expected:
            problems.append(
                f"{member_id}: R2DT sequence != fasta_sequence "
                f"(len {len(compact['seq'])} vs {len(expected)}) -- colour overlay would misalign"
            )
            continue
        template, source = meta.get(member_id, (None, None))
        compact["template"] = template
        compact["source"] = source
        with (out_dir / f"{member_id}.json").open("w", encoding="utf-8") as fh:
            json.dump(compact, fh, separators=(",", ":"), ensure_ascii=True)
        manifest[member_id] = {"template": template, "source": source}

    manifest_obj = {"count": len(manifest), "diagrams": dict(sorted(manifest.items()))}
    with (out_dir / "manifest.json").open("w", encoding="utf-8") as fh:
        json.dump(manifest_obj, fh, separators=(",", ":"), ensure_ascii=True)
    return len(manifest), problems


# --- CLI --------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    repo = Path(__file__).resolve().parents[1]
    default_members = repo / "public" / "data" / "members.json"
    default_out = repo / "public" / "data" / "r2dt"

    parser = argparse.ArgumentParser(description="Build committed R2DT assets (PLAN section 9).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_fasta = sub.add_parser("fasta", help="emit the R2DT input FASTA (one RNA leader per member)")
    p_fasta.add_argument("--members", type=Path, default=default_members)
    p_fasta.add_argument("--out", type=Path, required=True, help="path to write r2dt_input.fasta")

    p_ing = sub.add_parser("ingest", help="convert an R2DT output dir -> committed compact assets")
    p_ing.add_argument("--results", type=Path, required=True, help="dir of <member_id>.json R2DT outputs")
    p_ing.add_argument("--members", type=Path, default=default_members)
    p_ing.add_argument("--metadata", type=Path, default=None, help="R2DT metadata.tsv (optional)")
    p_ing.add_argument("--out", type=Path, default=default_out, help="public/data/r2dt output dir")

    args = parser.parse_args(argv)
    members = load_members(args.members)

    if args.cmd == "fasta":
        n = write_input_fasta(members, args.out)
        print(f"wrote {n} records -> {args.out}")
        return 0

    n, problems = ingest(args.results, members, args.out, args.metadata)
    print(f"wrote {n} R2DT diagrams + manifest.json -> {args.out}")
    for p in problems:
        print(f"  SKIPPED {p}")
    if problems:
        print(f"{len(problems)} member(s) skipped (see above).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
