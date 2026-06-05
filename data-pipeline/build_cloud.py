"""build_cloud.py -- tbdb.tandem 3D similarity-cloud embedding (the /cloud view).

A sibling of :mod:`build_tree_artifacts` that turns the SAME committed Stem-I /
antiterminator trees + per-locus metadata into ``public/data/cloud.json`` -- the
single artifact the lazy ``/cloud`` route renders. Everything heavy is computed
here, offline, so the client only draws:

    tree.nwk / tree_fallback.nwk   ->  patristic distance matrix D  (per tree)
                                   ->  classical MDS / PCoA  ->  3D coordinates
    tree_tips.json + loci.json     ->  per-point join (specifier / phylum / func / ...)
    + members.json                 ->  per-element delta-delta-G

Usage (from the repo root, after the tree artifacts exist)::

    python data-pipeline/build_cloud.py \
        --main-nwk public/data/tree.nwk \
        --fallback-nwk public/data/tree_fallback.nwk \
        --tips public/data/tree_tips.json \
        --loci public/data/loci.json \
        --members public/data/members.json \
        --out public/data

HARD CONSTRAINT (PLAN section 6, CLAUDE.md section 6): NO POLARITY. The embedding
is an exploratory similarity map -- a 3D companion to the unrooted ``/tree`` layout.
Patristic distance is rooting-independent (it is the path-length sum between two
leaves, identical for any rooting of the same edges), so nothing here reads or
implies ancestry; the midpoint root in ``tree.nwk`` is never consulted as a root.

DEPENDENCIES: numpy only (already a transitive dependency of the pipeline's
``pandas``; pinned explicitly in ``requirements.txt``). The spec sketched
``dendropy.phylogenetic_distance_matrix().patristic_distance`` for the matrix; the
repo convention is a minimal, dependency-free pipeline (cf. ``tree.ts`` keeping the
Newick logic pure), so the patristic matrix is computed here with a small,
unit-tested pure-Python parser + per-leaf tree walk instead -- no new dependency.

DETERMINISM: classical MDS eigenvectors are sign-ambiguous, so each axis's sign is
fixed (the largest-magnitude coordinate on that axis is made positive). The
embedding payload (``var`` / ``points`` / ``edges``) is therefore byte-stable
across runs on a platform -- the committed file regenerates identically. The ONLY
wall-clock field is ``meta.generated`` (informational); pass ``--generated`` to pin
it for a byte-exact rebuild.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

#: Schema version of the emitted cloud.json (bumped on a breaking shape change).
CLOUD_VERSION = 1
#: Stable canvas half-range: every tree's coordinates are scaled so max(|coord|)==SCALE.
SCALE = 100.0
#: Nearest-neighbour edges per leaf for the "constellation" overlay (PLAN /cloud spec).
K_NN = 2
#: Coordinate rounding (2 dp keeps cloud.json < 400 KB; sub-pixel at the 100-unit scale).
COORD_DP = 2
#: Variance-ratio rounding (enough precision for the honest "% of distance" readout).
VAR_DP = 4
#: How many leading variance ratios to record (readout uses the first three).
N_VAR = 6


# --- Newick parse (pure; no dependency) -------------------------------------

class _Node:
    """A parsed Newick node. ``length`` is the RAW branch-length token (parsed to a
    float at distance time); internal-node ``name`` carries the support label."""

    __slots__ = ("name", "length", "children")

    def __init__(self) -> None:
        self.name = ""
        self.length: str | None = None
        self.children: list[_Node] = []


def parse_newick(text: str) -> _Node:
    """Parse one Newick string into a ``_Node`` tree (iterative -- no recursion
    limit on deep/caterpillar trees). Mirrors the grammar of ``src/lib/tree.ts``.

    Rules over the token stream, maintaining a stack whose top is the current node:
      ``(`` push a new child of the top; ``,`` pop, then push a sibling under the
      new top; ``)`` pop; ``:`` read the branch length onto the top; any other run
      reads a label (tip name or internal support) onto the top.
    """
    s = text.strip()
    if s.endswith(";"):
        s = s[:-1]
    root = _Node()
    stack: list[_Node] = [root]
    delims = set("(),:;")
    i, n = 0, len(s)
    while i < n:
        c = s[i]
        if c == "(":
            child = _Node()
            stack[-1].children.append(child)
            stack.append(child)
            i += 1
        elif c == ",":
            stack.pop()
            child = _Node()
            stack[-1].children.append(child)
            stack.append(child)
            i += 1
        elif c == ")":
            stack.pop()
            i += 1
        elif c == ":":
            i += 1
            start = i
            while i < n and s[i] not in delims:
                i += 1
            stack[-1].length = s[start:i]
        else:
            start = i
            while i < n and s[i] not in delims:
                i += 1
            stack[-1].name = s[start:i]
    return root


def _leaves_in_order(root: _Node) -> list[_Node]:
    """Leaf nodes in document (pre-order) order -- the canonical matrix/point index.

    Iterative pre-order so the order matches the Newick left-to-right reading and is
    independent of the recursion limit."""
    out: list[_Node] = []
    stack = [root]
    while stack:
        node = stack.pop()
        if not node.children:
            out.append(node)
        else:
            # push children reversed so they pop left-to-right (document order)
            stack.extend(reversed(node.children))
    return out


# --- Patristic distance matrix (pure; per-leaf tree walk) -------------------

def patristic_matrix(root: _Node) -> tuple[list[str], np.ndarray]:
    """Full leaf x leaf patristic distance matrix (sum of branch lengths on the path
    between each leaf pair). Returns ``(leaf_names, D)`` with ``D`` symmetric,
    zero-diagonal, in the document leaf order.

    Patristic distance is rooting-independent, so this is a property of the
    UNROOTED similarity tree (PLAN section 6) -- no ancestry is read. Each node is
    given an integer id; an undirected adjacency (parent<->child, weighted by the
    child's branch length) is walked once per leaf (O(n * V), trivial at this scale)
    to fill that leaf's row.
    """
    # Number every node and build the weighted undirected adjacency.
    nodes: list[_Node] = []
    stack = [root]
    while stack:
        node = stack.pop()
        nodes.append(node)
        stack.extend(node.children)
    idx = {id(node): k for k, node in enumerate(nodes)}
    adj: list[list[tuple[int, float]]] = [[] for _ in nodes]
    for node in nodes:
        u = idx[id(node)]
        for child in node.children:
            v = idx[id(child)]
            w = float(child.length) if child.length not in (None, "") else 0.0
            adj[u].append((v, w))
            adj[v].append((u, w))

    leaves = _leaves_in_order(root)
    leaf_ids = [idx[id(node)] for node in leaves]
    leaf_pos = {node_id: p for p, node_id in enumerate(leaf_ids)}
    n = len(leaves)
    D = np.zeros((n, n), dtype=np.float64)

    for p, src in enumerate(leaf_ids):
        # Single DFS from this leaf over the tree (parent guard prevents revisits).
        dist = {src: 0.0}
        work = [(src, -1)]
        while work:
            u, parent = work.pop()
            du = dist[u]
            for v, w in adj[u]:
                if v == parent:
                    continue
                dist[v] = du + w
                work.append((v, u))
        for node_id, d in dist.items():
            q = leaf_pos.get(node_id)
            if q is not None:
                D[p, q] = d
    # Symmetrize defensively against float drift on the two directions of an edge.
    D = 0.5 * (D + D.T)
    np.fill_diagonal(D, 0.0)
    return [node.name for node in leaves], D


# --- Classical MDS / PCoA ----------------------------------------------------

def pcoa(D: np.ndarray) -> tuple[np.ndarray, list[float]]:
    """Classical MDS (PCoA) of a distance matrix -> 3D coordinates + variance ratios.

    ``D2 = D**2``; double-centre ``B = -1/2 * J D2 J`` (``J = I - 11^T / n``);
    eigendecompose the symmetric ``B`` (``numpy.linalg.eigh``), sort eigenvalues
    descending; coordinates ``C = V[:, :3] * sqrt(|lambda[:3]|)``. Coordinates are
    scaled so ``max(|C|) == SCALE``. Each axis's sign is fixed so its
    largest-magnitude coordinate is positive (byte-stable across runs). Variance
    ratios are ``lambda / sum(positive lambda)`` over the leading :data:`N_VAR`.
    """
    n = D.shape[0]
    D2 = D ** 2
    J = np.eye(n) - np.ones((n, n)) / n
    B = -0.5 * J @ D2 @ J
    B = 0.5 * (B + B.T)  # enforce exact symmetry for eigh
    eigvals, eigvecs = np.linalg.eigh(B)  # ascending
    order = np.argsort(eigvals)[::-1]  # descending
    eigvals = eigvals[order]
    eigvecs = eigvecs[:, order]

    # 3D coordinates from the top-3 components (clamp negative eigenvalues to 0).
    k = min(3, n)
    lead = eigvals[:k]
    coords = eigvecs[:, :k] * np.sqrt(np.maximum(lead, 0.0))
    if k < 3:  # tiny trees: pad to 3 columns so every point is [x, y, z]
        coords = np.hstack([coords, np.zeros((n, 3 - k))])

    # Scale to the stable canvas half-range.
    max_abs = float(np.max(np.abs(coords))) if coords.size else 0.0
    if max_abs > 0:
        coords = coords * (SCALE / max_abs)

    # Deterministic sign convention: the largest-|.| coordinate on each axis is +.
    for axis in range(3):
        col = coords[:, axis]
        j = int(np.argmax(np.abs(col)))  # first max on a tie
        if col[j] < 0:
            coords[:, axis] = -col

    pos = eigvals[eigvals > 0]
    total = float(pos.sum()) if pos.size else 1.0
    var = [round(float(v) / total, VAR_DP) for v in eigvals[:N_VAR]]
    var += [0.0] * (N_VAR - len(var))  # pad short spectra to N_VAR
    return coords, var[:N_VAR]


# --- Nearest-neighbour "constellation" edges --------------------------------

def knn_edges(D: np.ndarray, k: int = K_NN) -> list[list[int]]:
    """Deduplicated undirected k-NN edge list as ``[i, j]`` index pairs (i < j).

    For each leaf, its ``k`` nearest by patristic distance (self excluded, ties
    broken by index via a stable argsort); pairs are stored unordered so a mutual /
    reciprocal neighbour is emitted once. Sorted for a deterministic, sparse list.
    """
    n = D.shape[0]
    edges: set[tuple[int, int]] = set()
    for i in range(n):
        row = D[i].copy()
        row[i] = np.inf
        nearest = np.argsort(row, kind="stable")[:k]
        for j in nearest:
            j = int(j)
            if j == i or not np.isfinite(row[j]):
                continue
            edges.add((i, j) if i < j else (j, i))
    return [[i, j] for i, j in sorted(edges)]


# --- Per-point join ----------------------------------------------------------

def build_points(
    leaf_names: list[str],
    coords: np.ndarray,
    tips: dict[str, dict],
    loci_by_id: dict[str, dict],
    members: dict[str, dict],
) -> list[dict]:
    """Join each leaf (a ``unique_name``) to its per-element + per-locus metadata.

    Element keys come from ``tree_tips.json`` (specifier / phylum / ordinal /
    member_id / tandem_id); locus keys from ``loci.json`` (func_class / type /
    confidence / same_specifier / mean_pairwise_identity / n_cores); the per-element
    delta-delta-G from ``members.json``. ``mixed`` is ``same_specifier is False`` (a
    locus whose elements disagree). Coordinates are rounded to :data:`COORD_DP`.
    """
    points: list[dict] = []
    for k, name in enumerate(leaf_names):
        tip = tips.get(name)
        if tip is None:
            raise ValueError(
                f"tree leaf {name!r} is absent from tree_tips.json -- the cloud "
                "embedding and the tip metadata have drifted out of sync"
            )
        tandem_id = tip["tandem_id"]
        member_id = tip["member_id"]
        locus = loci_by_id.get(tandem_id, {})
        member = members.get(member_id, {})
        x, y, z = (round(float(coords[k, ax]), COORD_DP) for ax in range(3))
        points.append(
            {
                "id": name,
                "tandem_id": tandem_id,
                "member_id": member_id,
                "ord": tip["ordinal"],
                "spec": tip["specifier"],
                "phylum": tip["phylum"],
                "func": locus.get("func_class"),
                "type": locus.get("type"),
                "conf": locus.get("confidence"),
                "mixed": locus.get("same_specifier") is False,
                "ddg": member.get("deltadelta_g"),
                "ident": locus.get("mean_pairwise_identity"),
                "ncores": locus.get("n_cores"),
                "x": x,
                "y": y,
                "z": z,
            }
        )
    return points


def build_tree_block(
    newick_text: str,
    tips: dict[str, dict],
    loci_by_id: dict[str, dict],
    members: dict[str, dict],
) -> dict:
    """Compute one tree's ``{var, points, edges}`` block (PLAN /cloud schema)."""
    root = parse_newick(newick_text)
    leaf_names, D = patristic_matrix(root)
    coords, var = pcoa(D)
    edges = knn_edges(D)
    points = build_points(leaf_names, coords, tips, loci_by_id, members)
    block = {"var": var, "points": points, "edges": edges}
    # PHASE 2 (optional, not built here): a second, explicitly NON-METRIC
    # "neighbourhood" layout. Behind a guarded `import umap` (so this Phase-1 build
    # still runs without umap-learn), compute UMAP with metric='precomputed' on D and
    # emit `block["umap"] = [[x, y, z], ...]` aligned to `points`. The view would label
    # it non-metric ("distances and gaps are not meaningful") and never default to it.
    return block


def build_cloud(
    main_nwk: str,
    fallback_nwk: str,
    tips: dict[str, dict],
    loci_doc: dict,
    members: dict[str, dict],
    generated: str,
) -> dict:
    """Assemble the full cloud.json document (meta + the two tree blocks)."""
    loci_by_id = {l["tandem_id"]: l for l in loci_doc["loci"]}
    return {
        "meta": {
            "generated": generated,
            "method": "pcoa",
            "scale": int(SCALE),
            "k_nn": K_NN,
            "version": CLOUD_VERSION,
        },
        "main": build_tree_block(main_nwk, tips, loci_by_id, members),
        "fallback": build_tree_block(fallback_nwk, tips, loci_by_id, members),
    }


def _write_json(path: Path, obj: object) -> None:
    """Write compact deterministic JSON (matches build_json.py / build_tree_artifacts.py)."""
    with path.open("w", encoding="utf-8") as fh:
        json.dump(obj, fh, separators=(",", ":"), ensure_ascii=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build the tbdb.tandem 3D similarity-cloud embedding "
        "(public/data/cloud.json) from the committed trees + metadata.",
    )
    parser.add_argument("--main-nwk", type=Path, default=Path("public/data/tree.nwk"))
    parser.add_argument("--fallback-nwk", type=Path, default=Path("public/data/tree_fallback.nwk"))
    parser.add_argument("--tips", type=Path, default=Path("public/data/tree_tips.json"))
    parser.add_argument("--loci", type=Path, default=Path("public/data/loci.json"))
    parser.add_argument("--members", type=Path, default=Path("public/data/members.json"))
    parser.add_argument("--out", type=Path, default=Path("public/data"))
    parser.add_argument(
        "--generated", type=str, default=None,
        help="ISO-8601 stamp for meta.generated (default: now, UTC, second precision)",
    )
    args = parser.parse_args(argv)

    tips = json.loads(args.tips.read_text(encoding="utf-8"))
    loci_doc = json.loads(args.loci.read_text(encoding="utf-8"))
    members = json.loads(args.members.read_text(encoding="utf-8"))
    main_nwk = args.main_nwk.read_text(encoding="utf-8")
    fallback_nwk = args.fallback_nwk.read_text(encoding="utf-8")
    generated = args.generated or datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    doc = build_cloud(main_nwk, fallback_nwk, tips, loci_doc, members, generated)

    args.out.mkdir(parents=True, exist_ok=True)
    _write_json(args.out / "cloud.json", doc)

    main_b, fb_b = doc["main"], doc["fallback"]
    size_kb = (args.out / "cloud.json").stat().st_size / 1024
    print(
        f"cloud.json: main {len(main_b['points'])} pts / {len(main_b['edges'])} edges "
        f"(3 axes capture {round(100 * sum(main_b['var'][:3]))}% of pairwise distance, "
        f"flat 2D {round(100 * sum(main_b['var'][:2]))}%) | "
        f"fallback {len(fb_b['points'])} pts / {len(fb_b['edges'])} edges "
        f"(3D {round(100 * sum(fb_b['var'][:3]))}%, 2D {round(100 * sum(fb_b['var'][:2]))}%) "
        f"-> {args.out}/cloud.json ({size_kb:.0f} KB)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
