"""slice_stemI_columns.py -- slice the Stem-I consensus columns from the
full-leader RF00230 alignment (PLAN section 6, 6.1).

The main tree (PLAN section 6) aligns the *whole* leader to the RF00230 Infernal
CM (``cmalign``, default truncation-allowed mode) so the model uses its complete
~219-column structure, then infers from the **Stem-I consensus columns only**.
This script performs that slice: it reads the cmalign alignment and emits an
aligned FASTA (afa) containing just the Stem-I columns, which ``FastTree`` then
consumes (see ``build_tree.sbatch``, PLAN section 6.1).

Stem-I is read from the alignment's consensus secondary structure -- the RF00230
``SS_cons`` map that cmalign propagates into its output -- as the **first stem**
(the 5'-most hairpin): the column span from the first opening base-pair bracket to
its matching closer, inclusive of the intervening loop/bulge columns. Within that
span only **consensus** columns are kept; insert columns (``SS_cons`` ``.`` or
``~``) are dropped, since insertions are not homologous across sequences. T-box
Stem I is a single top-level hairpin, so the first ``<...>`` block is Stem I.

Input formats
-------------
* **Stockholm** (``leaders.sto``) -- carries ``#=GC SS_cons`` (and ``#=GC RF``):
  the self-contained path. **Preferred.**
* **Aligned FASTA** (``leaders.afa``) -- has no per-column annotation, so the
  SS_cons must be supplied separately with ``--ss-cons`` (a Stockholm or a file
  whose first non-blank line is the SS_cons string).

NOTE for ``build_tree.sbatch`` (Track B / SB.1): ``esl-reformat afa`` *strips*
``SS_cons``, so a slice "over the RF00230 SS_cons map" needs the annotation back.
Feed the Stockholm directly (``slice_stemI_columns.py leaders.sto``) -- or pass
``--ss-cons leaders.sto`` alongside the afa. The PLAN section 6.1 sbatch snippet
pipes the afa; SB.1 should wire one of these so SS_cons is available to the slice.

Usage::

    python slice_stemI_columns.py leaders.sto                 > stemI.afa
    python slice_stemI_columns.py leaders.afa --ss-cons leaders.sto > stemI.afa
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

#: WUSS / SS_cons base-pair bracket families. Openers raise nesting depth, closers
#: lower it; the matched first opener delimits the first stem. Pseudoknot letters
#: (``Aa``/``Bb`` ...) are intentionally *not* counted -- they do not delimit the
#: nested hairpin boundary we slice on.
_OPENERS = "<([{"
_CLOSERS = ">)]}"

#: SS_cons characters marking columns that are NOT part of the consensus, i.e.
#: insertions relative to the model. Everything else (paired brackets and the
#: unpaired-consensus marks ``: - _ ,``) is a consensus column.
_INSERT_MARKS = frozenset({".", "~"})


def stem_i_span(ss_cons: str) -> tuple[int, int]:
    """Return the inclusive ``(start, end)`` column span of the first stem.

    Scans ``ss_cons`` for the first opening bracket, then walks forward tracking a
    single combined nesting depth across all bracket families until depth returns
    to zero -- that closer ends the first (5'-most) hairpin. The returned span
    covers the whole hairpin: both strands plus every loop/bulge column between
    them. Raises ``ValueError`` if there is no base pair (no Stem-I to slice).
    """
    start = next((i for i, c in enumerate(ss_cons) if c in _OPENERS), None)
    if start is None:
        raise ValueError("SS_cons has no base-pair bracket -- no Stem-I to slice")
    depth = 0
    for j in range(start, len(ss_cons)):
        c = ss_cons[j]
        if c in _OPENERS:
            depth += 1
        elif c in _CLOSERS:
            depth -= 1
            if depth == 0:
                return start, j
    raise ValueError("SS_cons first stem is unbalanced (no matching closer)")


def stem_i_columns(ss_cons: str) -> list[int]:
    """Column indices of the Stem-I **consensus** columns (PLAN section 6).

    The first-stem span (:func:`stem_i_span`) restricted to consensus columns --
    insert columns (``SS_cons`` ``.``/``~``) within the span are dropped, since
    insertions are not column-homologous across sequences.
    """
    start, end = stem_i_span(ss_cons)
    return [c for c in range(start, end + 1) if ss_cons[c] not in _INSERT_MARKS]


def parse_stockholm(text: str) -> tuple[dict[str, str], str | None, str | None]:
    """Parse a (possibly interleaved) Stockholm alignment.

    Returns ``(sequences, ss_cons, rf)``. Sequence rows and the ``#=GC SS_cons`` /
    ``#=GC RF`` annotation rows are concatenated across interleaved blocks in file
    order. ``ss_cons`` / ``rf`` are ``None`` if absent.
    """
    sequences: dict[str, str] = {}
    ss_parts: list[str] = []
    rf_parts: list[str] = []
    for line in text.splitlines():
        if not line.strip() or line.startswith("# STOCKHOLM") or line.startswith("//"):
            continue
        if line.startswith("#=GC SS_cons"):
            # .strip() keeps the annotation token whitespace-clean, matching the
            # sequence rows; SS_cons / RF carry no internal whitespace.
            ss_parts.append(line.split(None, 2)[2].strip())
            continue
        if line.startswith("#=GC RF"):
            rf_parts.append(line.split(None, 2)[2].strip())
            continue
        if line.startswith("#"):  # other #=GR / #=GS / #=GF annotation
            continue
        # A sequence row is "<name> <aligned-residues>"; names carry no whitespace.
        parts = line.split()
        if len(parts) < 2:  # malformed name-only row -> skip, never corrupt the seq
            continue
        name, seq = parts[0], parts[-1]
        sequences[name] = sequences.get(name, "") + seq
    ss_cons = "".join(ss_parts) if ss_parts else None
    rf = "".join(rf_parts) if rf_parts else None
    return sequences, ss_cons, rf


def parse_fasta(text: str) -> dict[str, str]:
    """Parse an aligned FASTA into an ordered ``{name: aligned_sequence}`` dict."""
    sequences: dict[str, str] = {}
    name: str | None = None
    chunks: list[str] = []
    for line in text.splitlines():
        if line.startswith(">"):
            if name is not None:
                sequences[name] = "".join(chunks)
            name = line[1:].strip().split()[0]
            chunks = []
        elif name is not None:
            chunks.append(line.strip())
    if name is not None:
        sequences[name] = "".join(chunks)
    return sequences


def _ss_cons_from_text(text: str) -> str | None:
    """SS_cons from an arbitrary file: a Stockholm's ``#=GC SS_cons`` else line 1."""
    if "#=GC SS_cons" in text or text.lstrip().startswith("# STOCKHOLM"):
        _, ss_cons, _ = parse_stockholm(text)
        if ss_cons:
            return ss_cons
    for line in text.splitlines():
        if line.strip():
            return line.strip()
    return None


def slice_columns(sequences: dict[str, str], columns: list[int]) -> dict[str, str]:
    """Project every aligned sequence onto ``columns`` (order preserved)."""
    return {name: "".join(seq[c] for c in columns) for name, seq in sequences.items()}


def load_alignment(path: Path) -> tuple[dict[str, str], str | None]:
    """Load ``path`` as Stockholm (with SS_cons) or aligned FASTA (no SS_cons)."""
    text = path.read_text(encoding="utf-8")
    if text.lstrip().startswith("# STOCKHOLM"):
        sequences, ss_cons, _ = parse_stockholm(text)
        return sequences, ss_cons
    return parse_fasta(text), None


def slice_alignment(
    alignment_path: Path, ss_cons_path: Path | None = None
) -> dict[str, str]:
    """End-to-end slice: load the alignment, resolve SS_cons, return sliced seqs.

    SS_cons comes from the alignment itself (Stockholm) or, for an afa, from
    ``ss_cons_path``. The SS_cons length must equal the alignment width.
    """
    sequences, ss_cons = load_alignment(alignment_path)
    if ss_cons is None:
        if ss_cons_path is None:
            raise SystemExit(
                f"{alignment_path}: no SS_cons in the alignment (aligned FASTA carries "
                "no annotation); pass --ss-cons with the Stockholm / SS_cons file"
            )
        ss_cons = _ss_cons_from_text(ss_cons_path.read_text(encoding="utf-8"))
    if not ss_cons:
        raise SystemExit("could not resolve an SS_cons string for the Stem-I slice")
    if sequences:
        width = len(next(iter(sequences.values())))
        if any(len(s) != width for s in sequences.values()):
            raise SystemExit("alignment rows are not all the same width")
        if len(ss_cons) != width:
            raise SystemExit(
                f"SS_cons length {len(ss_cons)} != alignment width {width}"
            )
    columns = stem_i_columns(ss_cons)
    if not columns:
        raise SystemExit("Stem-I slice selected 0 consensus columns")
    return slice_columns(sequences, columns)


def write_fasta(sequences: dict[str, str], out) -> None:
    """Write ``sequences`` as FASTA to the open text stream ``out``."""
    for name, seq in sequences.items():
        out.write(f">{name}\n{seq}\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Slice the Stem-I consensus columns from an RF00230 alignment "
        "(PLAN section 6).",
    )
    parser.add_argument(
        "alignment",
        type=Path,
        help="cmalign alignment: Stockholm (.sto, carries SS_cons) or aligned FASTA",
    )
    parser.add_argument(
        "--ss-cons",
        type=Path,
        default=None,
        help="SS_cons source when the alignment is a plain aligned FASTA "
        "(a Stockholm file, or a file whose first line is the SS_cons string)",
    )
    args = parser.parse_args(argv)

    sliced = slice_alignment(args.alignment, args.ss_cons)
    write_fasta(sliced, sys.stdout)
    print(
        f"sliced {len(sliced)} sequences to "
        f"{len(next(iter(sliced.values()))) if sliced else 0} Stem-I columns",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
