#!/usr/bin/env python3
"""Build the committed R2DT secondary-structure assets (PLAN section 9).

The in-app structure viewer offers two renders of each T-box element: the legacy
fornac force layout (best-effort) and an **R2DT** diagram drawn on the canonical
**RF00230 / T-box template** -- the recognisable, reproducible textbook layout
(https://github.com/r2dt-bio/R2DT). R2DT itself is a heavyweight templated
pipeline (Infernal + a covariance-model template library) that cannot run in the
browser, so -- exactly like the similarity tree -- the diagrams are generated
offline once and committed; the static SPA just fetches and colours them.

Three stages, decoupled by the (gated, offline) R2DT run itself:

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

     ``ingest`` writes the *raw* R2DT layout. The combined snapshot of that raw
     output is committed as ``data-pipeline/r2dt_raw.json`` so the next stage is
     reproducible without re-running the (gated) R2DT pipeline.

  3. ``graft`` -- post-process the raw layout so the **antiterminator** renders as a
     real hairpin and the variable inter-stem single strands stop breaking the
     backbone (see the stage-3 banner below). Reads ``r2dt_raw.json``, writes the
     final served ``public/data/r2dt/`` assets. This is the stage the app serves.

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
import math
import sys
from pathlib import Path

import numpy as np

#: RNA nucleotide alphabet R2DT emits (drops the ``5'``/``3'`` end-marker entries).
_NT = frozenset("ACGU")

#: A grafted diagram is rejected (member falls back to fornac) when its longest
#: backbone step exceeds this multiple of the median step -- i.e. R2DT's own base
#: layout was too distorted (a big exterior loop) for the graft to rescue. Chosen
#: empirically: the standard T-box helix-junction kink is ~3.5-4x; the pathological
#: big-circle layouts are >=5x. See PROGRESS (graft step).
GRAFT_MAX_STEP_RATIO = 5.0

#: Extra outward clearance (in median backbone steps) by which a grafted hairpin's base is
#: pushed off the layout centroid when placed (``_orient_hairpin_outward``). Because the
#: step-2 declash FREEZES the shared stems (issue #45), it cannot relax a hairpin that the
#: outward orientation drops on top of the frozen upstream core; nudging the hairpin a few
#: steps further out clears that overlap up front. A margin sweep over the corpus (the
#: stems-frozen antiterminator diagrams) drove hard-clash diagrams down sharply through ~4.5
#: and then flattened, while the bounding-box aspect barely moved and the helices stayed
#: straight -- so 4.5 is the knee. The stretched stem->hairpin connector is respread evenly by
#: the reflow (no break) and the stems are untouched, so the toggle's pin guarantee holds.
HAIRPIN_CLEARANCE = 4.5


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


# --- stage 3: graft a real antiterminator hairpin onto the R2DT layout ------
#
# R2DT draws the canonical RF00230 / T-box *template* conformation. That template
# does not base-pair the antiterminator (it is the alternative regulatory fold), so
# R2DT dumps the AT residues into one big unpaired loop and the variable inter-stem
# single strands stretch into backbone "breaks". This stage keeps R2DT's coordinates
# for the recognisable Stem I/II/III, but:
#   * folds the antiterminator span into a real hairpin on a deterministic straight
#     ladder (collinear helices + spread bulge; see ``_ladder_hairpin``), its axis
#     aimed outward from the layout centroid so it radiates parallel to the other stems;
#   * drops R2DT's template pairs that touch the AT span and substitutes the
#     antiterminator pairs from ``whole_antiterm_structure`` (the SAME fold fornac
#     shows) -- so one consistent conformation is drawn, with no cross-region rungs;
#   * reflows the single-stranded connectors/tails (even circular arcs / straight
#     dangles) so the backbone is continuous instead of broken.
# Members whose R2DT *base* layout is too distorted to rescue are rejected (the
# frontend falls those back to fornac). ViennaRNA is a build-time-only dependency.


def _pair_table(dot: str) -> list[int]:
    """1-based partner table for a dot-bracket string (``pt[i]`` = partner or 0)."""
    pt = [0] * (len(dot) + 1)
    stack: list[int] = []
    for i, ch in enumerate(dot, start=1):
        if ch == "(":
            stack.append(i)
        elif ch == ")" and stack:
            j = stack.pop()
            pt[i] = j
            pt[j] = i
    return pt


def _median_step(xs: list[float], ys: list[float]) -> float:
    """Median nearest-neighbour backbone step over 1-based coords ``xs[1..n]``.

    Floored to a small positive value so a degenerate diagram (coincident
    coordinates → median 0) can never make a downstream divisor zero.
    """
    steps = sorted(math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]) for i in range(2, len(xs)))
    return max(steps[len(steps) // 2], 1e-6) if steps else 1.0


def _loop_half_angle(ratio: float, k: int) -> float:
    """Half-angle of a circular arc of ``k+1`` equal chords with end-to-end/chord == ratio.

    ``f(theta) = sin(theta) / sin(theta/(k+1))`` decreases monotonically from ``k+1``
    (theta→0, a straight line) toward 0 (theta→pi), so a value above ``ratio`` means
    the angle is still too small. Bisects accordingly; ``ratio`` is the caller's
    chord/median-step and must lie in ``(1, k+1)`` for a solution to exist.
    """
    lo, hi = 1e-6, math.pi - 1e-6
    for _ in range(60):
        mid = (lo + hi) / 2
        if math.sin(mid) / math.sin(mid / (k + 1)) > ratio:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _place_arc(xs, ys, s, e, lo, hi, med, cen) -> None:
    """Spread unpaired run ``xs[s..e]`` on an even arc between anchors ``lo``/``hi``.

    Built as a "turtle" polyline of ``k+1`` equal chords of length ``med`` with a
    constant turn, so consecutive residues stay ~one median step apart (no break)
    and the run lands exactly on the far anchor. When the chord is too long for the
    residue count the arc degenerates to a straight line. The turn direction is
    chosen so the bulge points away from the layout centroid ``cen``. This turtle
    form is reflex-safe (the arc may sweep >180° when residues are crammed).
    """
    k = e - s + 1
    p0x, p0y, p1x, p1y = xs[lo], ys[lo], xs[hi], ys[hi]
    chord = math.hypot(p1x - p0x, p1y - p0y)
    if chord < 1e-6:
        return
    if chord / med >= k + 1:  # residues too sparse to bulge → even straight line
        for t in range(1, k + 1):
            f = t / (k + 1)
            xs[s + t - 1] = p0x + f * (p1x - p0x)
            ys[s + t - 1] = p0y + f * (p1y - p0y)
        return
    theta = _loop_half_angle(chord / med, k)
    delta = 2 * theta / (k + 1)  # turn per interior vertex
    chord_dir = math.atan2(p1y - p0y, p1x - p0x)
    launch = delta * k / 2  # start-tangent offset from the chord (symmetric polyline)
    best = None
    for sgn in (1, -1):
        heading = chord_dir + sgn * launch
        px, py = p0x, p0y
        pts, cx_acc, cy_acc = [], 0.0, 0.0
        for _ in range(k):
            px += med * math.cos(heading)
            py += med * math.sin(heading)
            pts.append((px, py))
            cx_acc += px
            cy_acc += py
            heading -= sgn * delta
        # pick the turn direction whose bulge (point centroid) sits away from cen
        bulge_dist = math.hypot(cx_acc / k - cen[0], cy_acc / k - cen[1])
        if best is None or bulge_dist > best[0]:
            best = (bulge_dist, pts)
    for t, (px, py) in enumerate(best[1], start=1):
        xs[s + t - 1] = px
        ys[s + t - 1] = py


#: Base-pair rung length of the antiterminator ladder, in units of the backbone
#: step. ~1.9 matches the rung/step ratio R2DT draws the canonical Stem I/II/III
#: helices at (measured 1.88 over the committed diagrams), so the grafted
#: antiterminator helix reads at the SAME width as its neighbours.
LADDER_WIDTH = 1.9


def _ladder_hairpin(subdot: str) -> tuple[list[float], list[float]] | None:
    """Deterministic straight-ladder coordinates for a SIMPLE hairpin sub-structure.

    The antiterminator is, on every member in the data, a single nested hairpin (one
    hairpin loop, with one or more helices stacked through bulges / internal loops).
    This lays it out as a textbook ladder: every base-PAIRED residue sits on one of
    two vertical rails (5' at ``-WIDTH/2``, 3' at ``+WIDTH/2``) advancing one step per
    stacked pair, so the helices stay collinear / parallel no matter where the bulges
    fall -- unlike NAView, which pivots each helix around its loop and crushes the
    conserved 5' bulge. The unpaired runs (bulges + the apical loop) are then spread
    by the shared :func:`_place_arc`, bowing away from the ladder base so each bulge
    fans out to the side (every base ~one step apart) and the apical loop caps the
    tip as a clean semicircle.

    Returns local ``(xs, ys)`` (length == ``len(subdot)``), or ``None`` for a branched
    / multiloop sub-structure (>=2 hairpin loops), which the caller folds with NAView
    instead. The coordinates are unit-scaled (one step per stacked pair); the caller
    rescales to the diagram's own nucleotide spacing and rotates the axis outward.
    """
    length = len(subdot)
    pt = _pair_table(subdot)
    # A simple (caterpillar) hairpin never opens a helix after one has closed; a '('
    # following any ')' marks a branch (multiloop), which the ladder can't lay flat.
    seen_close = False
    for ch in subdot:
        if ch == ")":
            seen_close = True
        elif ch == "(" and seen_close:
            return None
    opens = [i for i in range(1, length + 1) if 0 < i < pt[i]]  # 1-based, i < partner
    if not opens:
        return None

    # 1-based working coordinates; stack each pair one step up the ladder (ascending
    # position == ascending nesting depth for a caterpillar hairpin -> outermost first).
    xs = [0.0] * (length + 1)
    ys = [0.0] * (length + 1)
    half = LADDER_WIDTH / 2.0
    for level, i in enumerate(opens):
        j = pt[i]
        xs[i], ys[i] = -half, float(level)  # 5' rail
        xs[j], ys[j] = +half, float(level)  # 3' rail

    # Spread each internal unpaired run. p_lo / p_hi (the sub-structure's ends) are
    # paired by construction, so every run is flanked by a pair on both sides -- there
    # are no dangling tails here. A centroid far below the base makes side bulges fan
    # out perpendicular to the rails while the apical loop bows up over the tip.
    base_cen = (0.0, -1000.0)
    k = 1
    while k <= length:
        if pt[k] != 0:
            k += 1
            continue
        s = k
        while k <= length and pt[k] == 0:
            k += 1
        e = k - 1
        lo, hi = s - 1, e + 1
        if lo >= 1 and hi <= length and pt[lo] and pt[hi]:
            _place_arc(xs, ys, s, e, lo, hi, 1.0, base_cen)
    return xs[1 : length + 1], ys[1 : length + 1]


def _naview_hairpin(subdot: str) -> tuple[list[float], list[float]]:
    """NAView local coordinates for the antiterminator sub-structure (lazy ViennaRNA).

    Fallback for the (data-absent but possible) branched/multiloop antiterminator that
    :func:`_ladder_hairpin` declines; the straight ladder handles every simple hairpin.
    """
    import RNA  # build-time-only dependency; never imported by the frontend/runtime

    co = RNA.naview_xy_coordinates(subdot)
    return [co[k].X for k in range(len(subdot))], [co[k].Y for k in range(len(subdot))]


def _naview_hairpin_declashed(subdot: str) -> tuple[list[float], list[float]]:
    """NAView layout of a BRANCHED hairpin, declashed in its own frame before placement.

    NAView draws a multiloop terminator (two side-by-side hairpins) compactly but with its
    sub-hairpins crowded -- the residual ``hairpin x hairpin`` overlap. Declashing here, in the
    isolated local frame (each sub-helix a rigid body free to swing apart, loops free), spreads
    them with no frozen stems in the way; the spread layout is then placed + held by the graft's
    own declash. Simple hairpins never reach this path (the straight ladder handles them).
    """
    lx, ly = _naview_hairpin(subdot)
    n = len(subdot)
    pt = _pair_table(subdot)
    pairs = [(i, pt[i]) for i in range(1, n + 1) if 0 < i < pt[i]]
    xs = [0.0] + list(lx)
    ys = [0.0] + list(ly)
    rigid = [[r - 1 for r in c] for c in _helix_clusters(pairs, n)]
    dx, dy = _declash(xs, ys, pairs, n, rigid_groups=rigid, iters=160, final_spread=30)
    return dx[1 : n + 1], dy[1 : n + 1]


# --- overlap resolution (declash) -------------------------------------------
#
# R2DT's base Stem I/II/III coordinates are kept verbatim by `graft`, and the AT graft +
# single-strand reflow place each region by LOCAL rules (radiate outward, bow away from the
# centroid) with no GLOBAL collision check -- so non-adjacent residues routinely land on top
# of each other (measured: hard glyph-on-glyph clashes in 85.6% of the raw committed
# diagrams). `_declash` resolves that with a position-based relaxation: a few hundred passes
# of (1) pairwise repulsion that pushes any two non-bonded residues closer than ~one glyph
# diameter apart, (2) hard distance constraints that hold the backbone step and every
# base-pair RUNG at its rest length (so helices stay rigid -- this is what keeps the
# recognisable shape, unlike a force layout), and (3) a gentle pull back toward the input
# coordinates (the shape anchor). Run over the whole corpus it takes 85.6% -> 0 hard clashes
# while leaving the aspect ratio essentially unchanged.


def _declash(
    xs: list[float],
    ys: list[float],
    pairs: list,
    n: int,
    *,
    anchor_paired: float = 0.7,
    anchor_unpaired: float = 0.0,
    iters: int = 200,
    dmin_factor: float = 1.12,
    final_spread: int = 40,
    anchor: "np.ndarray | list | None" = None,
    rigid_groups: "list | None" = None,
    rigid_anchor: float = 0.08,
) -> tuple[list[float], list[float]]:
    """Separate colliding nucleotides while holding the backbone + base-pair rungs rigid.

    Position-based dynamics on 1-based ``xs``/``ys`` (``[1..n]``; index 0 unused, matching
    ``graft_member``). ``dmin_factor`` is the minimum non-bonded centre spacing in units of
    the median backbone step (~one glyph diameter); ``final_spread`` extra passes at a
    slightly larger radius clear the last stubborn clashes. Returns new 1-based lists.

    The shape anchor is PER RESIDUE: base-paired (helix) residues are pulled hard toward
    their input position (``anchor_paired`` ~0.7) while unpaired residues (loops / single
    strands) are free (``anchor_unpaired`` ~0). A helix therefore moves as a near-rigid body
    -- it TRANSLATES out of a collision (the loops that tether it flex) but does not BEND, so
    the recognisable straight ladders R2DT / the graft drew stay crisp. (Tuned over the
    corpus: 0 hard clashes with helix-rail deviation back down to ~0.1 of a backbone step.)

    Pass an explicit per-residue ``anchor`` array (0-based, length ``n``) to override the
    paired/unpaired split -- the step-2 local declash uses this to FREEZE the shared stems
    (anchor 1.0 -> the residue is snapped back to its input each pass) while only the switch
    region relaxes, so the stems stay byte-identical to the base across the toggle.
    """
    P = np.array([[xs[i], ys[i]] for i in range(1, n + 1)], dtype=float)
    O = P.copy()
    L = _median_step(xs, ys)
    dmin = dmin_factor * L
    # bonded = backbone neighbours + base pairs: pairs that are SUPPOSED to be close, so
    # repulsion skips them and the distance constraints hold them at their rest length.
    bonded = np.zeros((n, n), dtype=bool)
    for i in range(n - 1):
        bonded[i, i + 1] = bonded[i + 1, i] = True
    is_paired = np.zeros(n, dtype=bool)
    rest = []  # (i0, j0, rung_rest_length)
    for a, b in pairs:
        i, j = (a - 1, b - 1) if a < b else (b - 1, a - 1)
        bonded[i, j] = bonded[j, i] = True
        is_paired[i] = is_paired[j] = True
        rest.append((i, j, math.hypot(xs[a] - xs[b], ys[a] - ys[b]) or L))
    if anchor is not None:
        aw = np.asarray(anchor, dtype=float)[:, None]  # caller-supplied freeze/relax mask
    else:
        aw = np.where(is_paired, anchor_paired, anchor_unpaired)[:, None]  # per-residue anchor
    # Rigid-body groups (0-based residue index lists): each is snapped to the rigid (rotation +
    # translation) fit of its REST shape onto its current positions every pass -- so the helix stays
    # EXACTLY straight yet is free to rotate AND translate to pack clear of its neighbours (which the
    # per-residue anchor, pulling toward a FIXED orientation, cannot do). Grouped residues keep only a
    # weak ``rigid_anchor`` pull toward their rest position, enough to hold R2DT's overall arrangement
    # without pinning a stem that needs to swing out of a collision.
    groups: list[tuple[np.ndarray, np.ndarray]] = []
    if rigid_groups:
        aw = aw.copy()
        for g in rigid_groups:
            idx = np.array(sorted({r for r in g if 0 <= r < n}), dtype=int)
            if len(idx) >= 2:
                Q = O[idx]
                groups.append((idx, Q - Q.mean(axis=0)))
                aw[idx] = rigid_anchor
    nb_i, nb_j = np.where(np.triu(~bonded, k=1))  # non-bonded pairs (each once)
    bb_i = np.arange(n - 1)
    bb_j = np.arange(1, n)
    rp = np.array([(i, j) for i, j, _ in rest]) if rest else np.zeros((0, 2), dtype=int)
    rr = np.array([r for _, _, r in rest]) if rest else np.zeros(0)

    def _pass(dm: float) -> None:
        nonlocal P
        # (1) repulsion: push apart any non-bonded pair closer than dm
        d = P[nb_j] - P[nb_i]
        dist = np.hypot(d[:, 0], d[:, 1])
        m = dist < dm
        if m.any():
            mi, mj, dd = nb_i[m], nb_j[m], d[m]
            di = dist[m].copy()
            di[di < 1e-6] = 1e-6  # coincident -> nudge along an arbitrary axis next pass
            push = ((dm - di) / di * 0.5)[:, None] * dd
            np.add.at(P, mi, -push)
            np.add.at(P, mj, push)
        # (2) distance constraints (two sub-passes): backbone step -> L, rungs -> rest length
        for _ in range(2):
            d = P[bb_j] - P[bb_i]
            di = np.hypot(d[:, 0], d[:, 1])
            di[di < 1e-6] = 1e-6
            c = ((di - L) / di * 0.5)[:, None] * d
            np.add.at(P, bb_i, c)
            np.add.at(P, bb_j, -c)
            if len(rp):
                d = P[rp[:, 1]] - P[rp[:, 0]]
                di = np.hypot(d[:, 0], d[:, 1])
                di[di < 1e-6] = 1e-6
                c = ((di - rr) / di * 0.5)[:, None] * d
                np.add.at(P, rp[:, 0], c)
                np.add.at(P, rp[:, 1], -c)
        # (3) rigid-body shape match: snap each group to the rigid transform of its rest shape, so
        # it stays perfectly straight while free to rotate + translate out of a collision.
        for idx, Qc in groups:
            Pg = P[idx]
            cen = Pg.mean(axis=0)
            Pc = Pg - cen
            a = float(Qc[:, 0] @ Pc[:, 0] + Qc[:, 1] @ Pc[:, 1])
            b = float(Qc[:, 0] @ Pc[:, 1] - Qc[:, 1] @ Pc[:, 0])
            th = math.atan2(b, a)
            c_, s_ = math.cos(th), math.sin(th)
            P[idx, 0] = Qc[:, 0] * c_ - Qc[:, 1] * s_ + cen[0]
            P[idx, 1] = Qc[:, 0] * s_ + Qc[:, 1] * c_ + cen[1]
        # (4) per-residue shape anchor: loops/single strands free to flow apart; helices (or rigid
        # groups, weakly) pulled toward their input position so R2DT's overall arrangement holds.
        P += (O - P) * aw

    for _ in range(iters):
        _pass(dmin)
    for _ in range(final_spread):
        _pass(dmin * 1.18)
    out_x = [0.0] + [float(P[i, 0]) for i in range(n)]
    out_y = [0.0] + [float(P[i, 1]) for i in range(n)]
    return out_x, out_y


#: A glyph is drawn at radius ``0.44 * L`` (median backbone step), so two NON-adjacent glyphs
#: VISUALLY OVERLAP when their centres are closer than ``2 * 0.44 = 0.88 * L``. This is the real
#: clash threshold the whole declash now targets (the old 0.5 * L only caught severe burials and
#: let ~80% of diagrams ship with soft overlaps).
VISUAL_OVERLAP = 0.88


def _overlap_count(xs: list[float], ys: list[float], n: int, factor: float = VISUAL_OVERLAP) -> int:
    """Number of NON-adjacent nucleotide pairs whose centres sit closer than ``factor * L``."""
    if n < 3:
        return 0
    P = np.array([[xs[i], ys[i]] for i in range(1, n + 1)], dtype=float)
    L = _median_step(xs, ys)
    d = np.hypot(P[:, 0, None] - P[None, :, 0], P[:, 1, None] - P[None, :, 1])
    return int((d[np.triu_indices(n, k=2)] < factor * L).sum())


def _has_visual_overlap(xs: list[float], ys: list[float], n: int, factor: float = VISUAL_OVERLAP) -> bool:
    """True if any two NON-adjacent glyphs visually overlap (centres < ``factor * L``)."""
    return _overlap_count(xs, ys, n, factor) > 0


def _has_hard_clash(xs: list[float], ys: list[float], n: int) -> bool:
    """True if any two NON-adjacent nucleotides sit closer than half a backbone step.

    Severe glyph-on-glyph burial (kept as the tier-2 fornac-drop gate). The softer visual-overlap
    gate :func:`_has_visual_overlap` (centres < 0.88 * L) is what the layout now targets and
    re-lays on. 1-based ``xs``/``ys[1..n]``.
    """
    return _overlap_count(xs, ys, n, 0.5) > 0


def _naview_relayout(
    xs: list[float], ys: list[float], pairs: list, n: int
) -> tuple[list[float], list[float]] | None:
    """Re-lay a too-elongated diagram on a compact NAView layout, then declash.

    Builds the (nested) dot-bracket from the grafted ``pairs`` and lays the WHOLE molecule
    out with ViennaRNA's NAView (lazy import; the existing graft dependency). Because the
    base pairs are unchanged, the leader-relative stem spans still index the new coordinates,
    so the client-side stem-colour overlay stays aligned. Returns new 1-based ``(xs, ys)``,
    or ``None`` on any layout failure (a pseudoknotted pair set, a NAView error) so the
    caller keeps the declashed R2DT layout.
    """
    try:
        import RNA  # build-time-only dependency; never imported by the frontend/runtime

        dot = ["."] * n
        for a, b in pairs:
            i, j = (a, b) if a < b else (b, a)
            dot[i - 1] = "("
            dot[j - 1] = ")"
        co = RNA.naview_xy_coordinates("".join(dot))
        nx = [0.0] + [float(co[k].X) for k in range(n)]
        ny = [0.0] + [float(co[k].Y) for k in range(n)]
        if any(not math.isfinite(v) for v in nx[1:] + ny[1:]):
            return None
        # NAView already lays straight helices; declash (helices anchored) clears any
        # residual loop crowding without bending them.
        return _declash(nx, ny, pairs, n, iters=160, final_spread=30)
    except Exception:
        return None


# --- shared declashed stems-only base (the antiterm<->term toggle's stem-pinning seam) ------
#
# The antiterminator (gene-ON) and terminator (gene-OFF) diagrams share Stem I/II/III and
# differ only in the 3' switch region (AT hairpin vs terminator hairpin). To pin the stems
# across the toggle BOTH grafts build the same base FIRST: drop the switch pairs to single
# strand, reflow, and declash the kept Stem I/II/III into an overlap-free layout -- WITHOUT
# folding either hairpin. Because this depends only on the raw coords + the kept pair set
# (never on which hairpin will fold in), two conformations that keep the same pairs get a
# byte-identical base. Each graft then folds its own hairpin into the switch region and
# locally declashes THAT region with the stems frozen (`_frozen_anchor`), so the stems never
# move off the shared base -> identical, overlap-free stems in both diagrams. (Pinning the
# terminator to the antiterminator's already-FOLDED declashed layout was tried in #42 and
# over-constrains the differently-shaped terminator hairpin; the no-hairpin base is the seam.)


def _turtle_pts(p0, p1, k: int, med: float, sgn: int) -> list[tuple[float, float]] | None:
    """``k`` equal-chord turtle points from ``p0`` toward anchor ``p1`` (circular arc, side ``sgn``).

    The reflex-safe even-arc construction :func:`_place_arc` uses, factored out so the
    collision-aware router can generate BOTH bow directions as candidates. Returns ``None`` for a
    degenerate (coincident) chord; a straight even line when the residues are too sparse to bulge.
    """
    p0x, p0y = p0
    p1x, p1y = p1
    chord = math.hypot(p1x - p0x, p1y - p0y)
    if chord < 1e-6:
        return None
    if chord / med >= k + 1:  # too sparse to bulge -> even straight line (sgn irrelevant)
        return [(p0x + (t / (k + 1)) * (p1x - p0x), p0y + (t / (k + 1)) * (p1y - p0y)) for t in range(1, k + 1)]
    theta = _loop_half_angle(chord / med, k)
    delta = 2 * theta / (k + 1)
    heading = math.atan2(p1y - p0y, p1x - p0x) + sgn * (delta * k / 2)
    px, py = p0x, p0y
    pts: list[tuple[float, float]] = []
    for _ in range(k):
        px += med * math.cos(heading)
        py += med * math.sin(heading)
        pts.append((px, py))
        heading -= sgn * delta
    return pts


def _clearance(pts: list[tuple[float, float]], obs: "np.ndarray") -> float:
    """Min distance from any candidate point to any obstacle centre (inf if no obstacles)."""
    if obs is None or len(obs) == 0 or not pts:
        return float("inf")
    C = np.asarray(pts, dtype=float)
    d = np.hypot(C[:, 0, None] - obs[None, :, 0], C[:, 1, None] - obs[None, :, 1])
    return float(d.min())


def _max_run_step(xs, ys, a: int, b: int) -> float:
    """Largest backbone step over the inclusive index range ``[a..b]`` (a break detector)."""
    return max((math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]) for k in range(a + 1, b + 1)), default=0.0)


def _route_arc(xs, ys, s, e, lo, hi, med, cen, obs) -> None:
    """Re-route interior unpaired run ``[s..e]`` between anchors lo/hi ONLY if it overlaps or breaks.

    Most single strands carry R2DT's own (locally compact) coordinates and are already clear --
    re-laying those on a fresh arc only wastes space and discards the recognisable layout. So the
    run is KEPT in place when it is break-free AND already clear of every obstacle (stems, hairpin,
    strands routed earlier this pass). Only a run that overlaps something (or carries a graft-
    induced backbone break) is moved -- onto whichever even-arc bow direction sits furthest from
    the obstacles, with its current placement also in the running so routing never makes it worse.
    Deterministic tie-break: clearance (rounded), then keep-current, then bulge-away-from-centroid.
    """
    k = e - s + 1
    p0, p1 = (xs[lo], ys[lo]), (xs[hi], ys[hi])
    cur = [(xs[t], ys[t]) for t in range(s, e + 1)]
    cur_ok = _max_run_step(xs, ys, lo, hi) <= 2.2 * med
    if cur_ok and _clearance(cur, obs) >= VISUAL_OVERLAP * med:
        return  # already clear and continuous -> leave R2DT's layout untouched
    cands = []
    if cur_ok:
        cands.append((round(_clearance(cur, obs), 2), 1, 0.0, cur))  # keep-current (pref rank 1)
    for sgn in (1, -1):
        pts = _turtle_pts(p0, p1, k, med, sgn)
        if pts is None:
            continue
        bx = sum(p[0] for p in pts) / k
        by = sum(p[1] for p in pts) / k
        cands.append((round(_clearance(pts, obs), 2), 0, round(math.hypot(bx - cen[0], by - cen[1]), 2), pts))
    if not cands:
        return
    cands.sort(key=lambda c: (c[0], c[1], c[2]), reverse=True)
    for t, (px, py) in enumerate(cands[0][3], start=1):
        xs[s + t - 1] = px
        ys[s + t - 1] = py


#: Fan of launch bearings (degrees off the seed direction) the tail router scans for a clear exit.
_TAIL_FAN = (0, 20, -20, 40, -40, 60, -60, 90, -90, 120, -120, 150, -150, 180)


def _route_tail(xs, ys, s, e, anchor, med, n, partner, cen, obs, outward, reverse) -> None:
    """Place a dangling 5'/3' tail as the CLEAREST straight ray of even median steps off ``anchor``.

    Scans a fan of launch bearings around the seed direction (OUTWARD from the layout centroid for
    the post-fold reflow, else the backbone rail-exit tangent) and lays the tail as a straight ray
    along whichever bearing keeps its glyphs furthest from all placed structure. A straight ray is
    self-overlap-free by construction (no tail can clash with itself), so the only job is to find
    an open wedge -- which the mostly-empty drawing box reliably has. Tie-break: clearance, then
    alignment with the outward direction.
    """
    k = e - s + 1
    ax, ay = xs[anchor], ys[anchor]
    ox, oy = ax - cen[0], ay - cen[1]
    ol = math.hypot(ox, oy) or 1.0
    ox, oy = ox / ol, oy / ol
    # walk so the residue NEAREST the anchor is placed first -- for a 5' tail (reverse: anchor is
    # hi, one past e) that is residue e, walking inward to s; for a 3' tail it is s walking to e.
    walk = list(range(s, e + 1)) if not reverse else list(range(e, s - 1, -1))
    cur = [(xs[idx], ys[idx]) for idx in walk]
    cur_ok = _max_run_step(xs, ys, min(s, anchor), max(e, anchor)) <= 2.2 * med
    if cur_ok and _clearance(cur, obs) >= VISUAL_OVERLAP * med:
        return  # tail already clear and continuous -> leave it
    if outward:
        seed = (ox, oy)
    else:
        prev = anchor - 1 if not reverse else anchor + 1
        if 1 <= prev <= n:
            rx, ry = ax - xs[prev], ay - ys[prev]
        else:
            p = partner.get(anchor)
            rx, ry = (ax - xs[p], ay - ys[p]) if p is not None else (1.0, 0.0)
        rl = math.hypot(rx, ry) or 1.0
        seed = (rx / rl, ry / rl)
    bang = math.atan2(seed[1], seed[0])
    cands = []
    if cur_ok:
        cands.append((round(_clearance(cur, obs), 2), 1, cur))  # keep-current
    for deg in _TAIL_FAN:
        a = bang + math.radians(deg)
        dx, dy = math.cos(a), math.sin(a)
        pts = [(ax + dx * med * t, ay + dy * med * t) for t in range(1, k + 1)]
        cands.append((round(_clearance(pts, obs), 2), round(dx * ox + dy * oy, 3), pts))
    cands.sort(key=lambda c: (c[0], c[1]), reverse=True)
    for idx, (px, py) in zip(walk, cands[0][2]):
        xs[idx] = px
        ys[idx] = py


def _reflow_single_strands(
    xs: list[float], ys: list[float], pairs: list, n: int, outward_tails: bool = False
) -> None:
    """Route EVERY single-stranded run collision-aware around all placed structure, in place.

    The single biggest source of glyph overlap is single strands (inter-stem connectors + 5'/3'
    tails) drawn with no global collision check -- ~90% of measured overlaps involve one. This
    routes each unpaired run (in fixed 5'->3' order) onto the clearest deterministic candidate:
    an interior run bounded by two anchors goes on the clearer even arc (:func:`_route_arc`); a
    dangling tail goes on the clearest straight ray (:func:`_route_tail`). An OBSTACLE field of
    every placed glyph -- the paired stems/hairpin, plus each run committed as it is routed -- is
    what later runs avoid, so two connectors never bow onto each other (the conn x conn class) and
    the order is deterministic. Anchored (paired) residues are never moved, so the stems stay put.

    Routing every run (not only the broken ones the old reflow touched) also closes any backbone
    break by construction -- each run is re-laid at an even median step. With ``outward_tails``
    (the post-fold reflow) tails seed OUTWARD from the centroid into open 3' space rather than back
    down the helix rail into the frozen stems.
    """
    med = _median_step(xs, ys)
    cen = (sum(xs[1 : n + 1]) / n, sum(ys[1 : n + 1]) / n)
    partner: dict[int, int] = {}
    for i, j in pairs:
        partner[i] = j
        partner[j] = i
    anchored = set(partner)
    # Obstacle field = EVERY OTHER residue at its current position -- paired stems/hairpin AND the
    # unpaired bulges/loops/connectors -- so a routed run avoids ALL placed glyphs, not just the
    # helices. ``pos`` is mutated as each run is placed, so later runs see where earlier ones landed.
    pos = np.array([[xs[r], ys[r]] for r in range(1, n + 1)], dtype=float)  # 0-based: pos[r-1]
    i = 1
    while i <= n:
        if i in anchored:
            i += 1
            continue
        j = i
        while j <= n and j not in anchored:
            j += 1
        s, e = i, j - 1
        lo, hi = s - 1, e + 1
        ha_lo = lo >= 1 and lo in anchored
        ha_hi = hi <= n and hi in anchored
        if ha_lo or ha_hi:
            mask = np.ones(n, dtype=bool)
            mask[s - 1 : e] = False  # exclude the run's own residues from its obstacle field
            obs = pos[mask]
            if ha_lo and ha_hi:
                _route_arc(xs, ys, s, e, lo, hi, med, cen, obs)
            elif ha_lo:
                _route_tail(xs, ys, s, e, lo, med, n, partner, cen, obs, outward_tails, reverse=False)
            else:
                _route_tail(xs, ys, s, e, hi, med, n, partner, cen, obs, outward_tails, reverse=True)
            for t in range(s, e + 1):
                pos[t - 1] = (xs[t], ys[t])  # commit the run so later runs avoid its new position
        i = j


def _helix_clusters(kept: list, n: int) -> list[list[int]]:
    """Maximal contiguous helical segments over the kept pairs (each a rigid body for separation).

    Two paired residues join a cluster if a kept base pair links them, or a backbone step links two
    paired residues -- so a stacked helix (both strands) is one cluster, and a bulge/internal loop
    (an unpaired gap) splits a stem into separate rigid sub-helices that can flex at the loop. This
    is what lets a stem keep R2DT's canonical kinks while each straight segment stays rigid.
    """
    paired = sorted({r for pr in kept for r in pr})
    pset = set(paired)
    adj: dict[int, set] = {r: set() for r in paired}
    for a, b in kept:
        adj[a].add(b)
        adj[b].add(a)
    for r in paired:
        if r + 1 in pset:
            adj[r].add(r + 1)
            adj[r + 1].add(r)
    seen: set[int] = set()
    clusters: list[list[int]] = []
    for r in paired:
        if r in seen:
            continue
        stack, comp = [r], []
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(x)
            stack.extend(y for y in adj[x] if y not in seen)
        clusters.append(sorted(comp))
    return clusters


def _separate_stem_clusters(xs, ys, kept, n, med, iters: int = 40) -> None:
    """Rigid-translate apart any two helix clusters whose glyphs sit within the visual threshold.

    R2DT's compact template can pack two stems within a glyph diameter, and the strong-anchor
    declash can only translate a rigid arm -- it cannot re-pack two crossing stems. This pre-pass
    pushes overlapping clusters apart along their inter-centroid axis by TRANSLATION ONLY (no
    rotation -> the canonical straight helices never bend), iterating in a fixed order until every
    inter-cluster gap clears ~0.92 L or the pass cap is hit. The single strands tethering the
    clusters stretch and are re-routed afterwards. Runs ONCE on the shared no-hairpin base, so both
    conformations inherit a byte-identical separated layout (pinning preserved by construction).
    1-based ``xs``/``ys`` in place.
    """
    clusters = _helix_clusters(kept, n)
    if len(clusters) < 2:
        return
    target = (VISUAL_OVERLAP + 0.04) * med  # ~0.92 L: above the visual-overlap threshold with margin
    P = [(np.array([xs[r] for r in c], dtype=float), np.array([ys[r] for r in c], dtype=float), c) for c in clusters]
    for _ in range(iters):
        moved = False
        for ia in range(len(P)):
            for ib in range(ia + 1, len(P)):
                ax_, ay_, _ = P[ia]
                bx_, by_, _ = P[ib]
                d = np.hypot(ax_[:, None] - bx_[None, :], ay_[:, None] - by_[None, :])
                mn = float(d.min())
                if mn < target:
                    cax, cay = ax_.mean(), ay_.mean()
                    cbx, cby = bx_.mean(), by_.mean()
                    ux, uy = cbx - cax, cby - cay
                    ul = math.hypot(ux, uy) or 1.0
                    ux, uy = ux / ul, uy / ul
                    sh = (target - mn) / 2 + 1e-3
                    ax_ -= ux * sh
                    ay_ -= uy * sh
                    bx_ += ux * sh
                    by_ += uy * sh
                    moved = True
        if not moved:
            break
    for ax_, ay_, c in P:
        for k, r in enumerate(c):
            xs[r] = float(ax_[k])
            ys[r] = float(ay_[k])


def _stems_base(
    xs: list[float], ys: list[float], kept: list, n: int, max_step_ratio: float
) -> tuple[list[float], list[float]] | None:
    """Build the declashed stems-only base both grafts fold their hairpin into.

    ``kept`` is the set of R2DT pairs touching NEITHER hairpin span (Stem I/II/III). Reflows
    the switch-region single strands, applies the same quality gate the graft used (a backbone
    jump the reflow could not close -> the member falls back to fornac, signalled by ``None``),
    declashes the kept stems rigid, rigid-separates any crowded stem clusters, re-routes the
    connectors clear, and -- if the stems-only layout is still too elongated / sparse / severely
    clashing -- re-lays the kept pairs on a compact NAView base. Every step is deterministic, so
    two conformations with the same ``kept`` get a byte-identical base. Returns 1-based
    ``(bx, by)`` (switch residues carry throwaway single-strand positions each graft overwrites
    with its folded hairpin), or ``None`` to drop the member.
    """
    _reflow_single_strands(xs, ys, kept, n)
    # Quality gate on the reflowed stems-only base (pre-declash, like the original graft): a
    # backbone step the reflow could not close means R2DT's own layout was too distorted.
    final = sorted(math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]) for k in range(2, n + 1))
    fmed = (final[len(final) // 2] if final else 1.0) or 1.0
    if final and final[-1] / fmed >= max_step_ratio:
        return None
    # Separate any crossing stems, re-route the stretched connectors, THEN declash last so the
    # inter-stem junctions relax: in the base the stems carry only the soft 0.7 anchor (not the
    # graft's hard freeze), so a loop squeezed between two stem ends can actually spread here --
    # and because both conformations inherit this same declashed base, doing it here keeps the pin.
    _separate_stem_clusters(xs, ys, kept, n, _median_step(xs, ys))
    _reflow_single_strands(xs, ys, kept, n)
    rigid = [[r - 1 for r in c] for c in _helix_clusters(kept, n)]  # each helix a free-floating rigid body
    bx, by = _declash(xs, ys, kept, n, rigid_groups=rigid)
    # Fall back to a compact NAView base ONLY when the canonical R2DT layout still visually overlaps
    # AND NAView is strictly cleaner. The canonical T-box is naturally ELONGATED (the long Stem I), so
    # aspect/fill alone must NOT trigger a relayout -- NAView discards the recognisable template look
    # and (measured) re-introduces junction crowding the declashed R2DT base did not have.
    if _has_visual_overlap(bx, by, n):
        relaid = _naview_relayout(bx, by, kept, n)
        if relaid is not None and _overlap_count(relaid[0], relaid[1], n) < _overlap_count(bx, by, n):
            bx, by = relaid
    return bx, by


def _orient_hairpin_outward(
    xs: list[float], ys: list[float], n: int, p_lo: int, p_hi: int, lx: list[float], ly: list[float], anchored: set
) -> None:
    """Scale, rotate, and place a local hairpin onto ``xs``/``ys[p_lo..p_hi]`` in place.

    ``lx``/``ly`` are the local (unit-scaled) hairpin coordinates (length ``p_hi - p_lo + 1``).
    The hairpin is rescaled to the diagram's own nucleotide spacing and rotated so it radiates
    OUTWARD from the layout centroid -- parallel to the neighbouring stems rather than
    perpendicular to local flow -- then translated so its 5' base sits ``HAIRPIN_CLEARANCE``
    median steps beyond ``xs[p_lo]`` along that outward direction. The extra clearance keeps
    the hairpin off the frozen upstream core (which the stems-frozen step-2 declash cannot move
    out of the way); the stretched connector is respread by the reflow. The same construction
    the antiterminator and terminator grafts share. ``anchored`` is the set of base-paired
    (stem) residues, used to find the exterior flow at the hairpin base.
    """
    length = p_hi - p_lo + 1
    med = _median_step(xs, ys)
    lsteps = sorted(math.hypot(lx[k] - lx[k - 1], ly[k] - ly[k - 1]) for k in range(1, length))
    lstep = lsteps[len(lsteps) // 2] if lsteps else 1.0
    sc = med / (lstep or 1.0)
    lx = [v * sc for v in lx]
    ly = [v * sc for v in ly]
    # exterior flow at the hairpin base (from the nearest anchored residue before it)
    before = [r for r in anchored if r < p_lo]
    pa = max(before) if before else max(1, p_lo - 1)
    fx, fy = xs[p_lo] - xs[pa], ys[p_lo] - ys[pa]
    fl = math.hypot(fx, fy) or 1
    fx, fy = fx / fl, fy / fl
    # Aim the hairpin axis OUTWARD from the layout centroid: rotate the local base->centroid
    # axis onto (hairpin-region centre - layout centroid).
    cx, cy = sum(xs[1 : n + 1]) / n, sum(ys[1 : n + 1]) / n
    span = p_hi - p_lo + 1
    ax, ay = sum(xs[p_lo : p_hi + 1]) / span, sum(ys[p_lo : p_hi + 1]) / span
    ox, oy = ax - cx, ay - cy
    ol = math.hypot(ox, oy) or 1.0
    ox, oy = ox / ol, oy / ol
    mid0 = ((lx[0] + lx[length - 1]) / 2, (ly[0] + ly[length - 1]) / 2)
    cen0 = (sum(lx) / length, sum(ly) / length)
    axis = (cen0[0] - mid0[0], cen0[1] - mid0[1])
    rot = math.atan2(oy, ox) - math.atan2(axis[1], axis[0])
    cr, srot = math.cos(rot), math.sin(rot)
    rx = [lx[k] * cr - ly[k] * srot for k in range(length)]
    ry = [lx[k] * srot + ly[k] * cr for k in range(length)]
    # handedness: base(5')->base(3') should align with +flow so the tail exits forward
    if (rx[length - 1] - rx[0]) * fx + (ry[length - 1] - ry[0]) * fy < 0:
        ux, uy = ox, oy
        for k in range(length):
            dd = rx[k] * ux + ry[k] * uy
            rx[k] = 2 * dd * ux - rx[k]
            ry[k] = 2 * dd * uy - ry[k]
    # Anchor the 5' base at xs[p_lo], then push the whole hairpin HAIRPIN_CLEARANCE steps
    # further out (along the outward direction) so it clears the frozen upstream core.
    dx = xs[p_lo] - rx[0] + ox * HAIRPIN_CLEARANCE * med
    dy = ys[p_lo] - ry[0] + oy * HAIRPIN_CLEARANCE * med
    for k in range(length):
        xs[p_lo + k] = rx[k] + dx
        ys[p_lo + k] = ry[k] + dy


def _clear_hairpin_off_stems(
    xs, ys, n, p_lo, p_hi, kept, step_frac: float = 0.5, target_frac: float = 0.92, cap: int = 16
) -> None:
    """Rigid-translate the folded hairpin further outward until it clears the frozen stems.

    The fixed ``HAIRPIN_CLEARANCE`` push in :func:`_orient_hairpin_outward` clears most members, but
    a long upstream stem (Stem III especially) can still reach into the hairpin -- the measured
    at x iii / hairpin x stem class. This escalator pushes the WHOLE hairpin (rigid -> the ladder
    stays straight, unit tests hold) one ``step_frac * L`` step at a time along the same outward
    direction until every hairpin glyph is >= ``target_frac * L`` from every kept-stem glyph, or the
    cap is reached. Stems are never touched (pin preserved); the stretched stem->hairpin connector is
    re-routed by the following reflow. In place on 1-based ``xs``/``ys``.
    """
    stem_res = sorted({r for pr in kept for r in pr})
    if not stem_res or p_hi < p_lo:
        return
    med = _median_step(xs, ys)
    S = np.array([[xs[r], ys[r]] for r in stem_res], dtype=float)
    cx, cy = sum(xs[1 : n + 1]) / n, sum(ys[1 : n + 1]) / n
    span = p_hi - p_lo + 1
    hx, hy = sum(xs[p_lo : p_hi + 1]) / span, sum(ys[p_lo : p_hi + 1]) / span
    ox, oy = hx - cx, hy - cy
    ol = math.hypot(ox, oy) or 1.0
    ox, oy = ox / ol, oy / ol
    target = target_frac * med
    for _ in range(cap):
        H = np.array([[xs[r], ys[r]] for r in range(p_lo, p_hi + 1)], dtype=float)
        d = np.hypot(H[:, 0, None] - S[None, :, 0], H[:, 1, None] - S[None, :, 1])
        if float(d.min()) >= target:
            return
        sh = step_frac * med
        for r in range(p_lo, p_hi + 1):
            xs[r] += ox * sh
            ys[r] += oy * sh


def _frozen_anchor(n: int, kept: list, hairpin_pairs: list, p_lo: int, anchor_paired: float = 0.7) -> np.ndarray:
    """Per-residue anchor for the step-2 local declash: freeze the shared stems, relax everything else.

    The stem-pinning guarantee (issue #45) only requires the residues PAIRED in a kept stem to
    stay byte-identical to the shared base across the antiterm<->term toggle -- those are exactly
    the residues the pin test compares. So ONLY kept-paired residues are frozen here (anchor 1.0:
    the local declash snaps them back to the base each pass). A bulge/internal loop *enclosed* by a
    kept stem also stays frozen (1.0) so the stem reads identical to the base. The freshly folded
    switch hairpin gets ``anchor_paired`` (rigid but free to translate clear of a clash). Every
    other unpaired residue -- the EXTERIOR inter-stem connectors and the 5'/3' tails -- is FREE
    (0.0) so the collision-aware reflow + this declash can route it clear of all structure.

    This deliberately frees the upstream exterior connectors the old version froze wholesale
    (everything below ``switch_start``): freezing them was the root cause of the unmovable
    connector-on-stem overlaps, and they are never pin-compared, so freeing them is pin-safe.
    ``kept`` pairs are stored ``(i, j)`` with ``i < j``.
    """
    kept_res = {r for pr in kept for r in pr}
    hp_res = {r for pr in hairpin_pairs for r in pr}
    anchor = np.zeros(n)  # default: free (exterior connectors + tails)
    for r in range(1, n + 1):
        if r in kept_res:
            anchor[r - 1] = 1.0  # kept stem helix: frozen -> pins across the toggle
        elif r in hp_res:
            anchor[r - 1] = anchor_paired  # folded switch hairpin: rigid but mobile
        elif any(i < r < j for (i, j) in kept):
            anchor[r - 1] = 1.0  # bulge/loop enclosed by a kept stem -> stays on the base
    return anchor


def graft_member(raw: dict, member: dict, max_step_ratio: float = GRAFT_MAX_STEP_RATIO) -> dict | None:
    """Graft a real antiterminator hairpin onto one raw R2DT compact diagram.

    Returns a grafted compact diagram (same schema as ``ingest``), or ``None`` when
    R2DT's base layout stayed too distorted (longest backbone step >= ``max_step_ratio``
    x median) or produced non-finite coordinates -- the caller falls the member back
    to fornac. Members with no antiterminator pairs are still reflowed and returned.
    """
    n = len(raw["seq"])
    xs = [0.0] + [float(v) for v in raw["x"]]  # 1-based, xs[1..n]
    ys = [0.0] + [float(v) for v in raw["y"]]
    rpairs = [tuple(p) for p in raw["pairs"]]
    wapt = _pair_table(member.get("whole_antiterm_structure") or "")

    # antiterminator hairpin pairs + span (the switch region the AT fold draws as a hairpin)
    at = next((s for s in member.get("stems", []) if s["key"] == "at"), None)
    at_pairs: list = []
    p_lo = p_hi = None
    if at and len(wapt) == n + 1:
        a, b = at["start"], at["end"]
        at_pairs = [(i, wapt[i]) for i in range(a, b + 1) if i < wapt[i] <= b]
        if at_pairs:
            p_lo = min(i for i, _ in at_pairs)
            p_hi = max(j for _, j in at_pairs)

    # Kept Stem I/II/III pairs = raw pairs touching NEITHER end of the AT helix span (which the
    # AT fold replaces). These define the shared declashed base (``_stems_base``) the two
    # conformations pin to. Note the deliberate asymmetry with ``graft_terminator_member``,
    # which additionally drops pairs touching the TERMINATOR span: here we keep them. On the
    # committed corpus a raw pair touches the terminator span but not the AT span ONLY for
    # degenerate *Partial* leaders whose terminator alignment spans (most of) the whole leader
    # -- and there those pairs ARE the real upstream Stem I/III, which the antiterminator
    # conformation genuinely keeps (only the gene-OFF terminator refold sheds them). So for
    # every NON-Partial member the two grafts' kept sets are byte-identical -> identical base
    # -> the stems pin; the Partial leaders differ but legitimately refold and are exempt from
    # the toggle's pin test. (Both invariants are enforced over the committed data:
    # test_artifacts.py test_grafts_keep_identical_stem_pairs_for_non_partial and
    # test_terminator_diagrams_pin_stems_across_the_toggle.)
    if at_pairs:
        a, b = at["start"], at["end"]
        kept = [(min(i, j), max(i, j)) for (i, j) in rpairs if not (a <= i <= b or a <= j <= b)]
    else:
        kept = [(min(i, j), max(i, j)) for (i, j) in rpairs]

    base = _stems_base(xs, ys, kept, n, max_step_ratio)
    if base is None:
        return None  # R2DT's stems-only base too distorted -> fornac fallback
    xs, ys = base
    pairs = kept + at_pairs

    if at_pairs:
        length = p_hi - p_lo + 1
        sub = ["."] * length
        for i, j in at_pairs:
            sub[i - p_lo] = "("
            sub[j - p_lo] = ")"
        local = _ladder_hairpin("".join(sub))
        if local is None:
            local = _naview_hairpin("".join(sub))  # branched AT (none in data) -> NAView
        lx, ly = _spread_coincident(list(local[0]), list(local[1]), 0.5)  # no two hairpin glyphs coincide
        # Fold the real AT hairpin into the shared base, radiating outward like the stems, push it
        # clear of the frozen stems, declash the switch with the stems FROZEN (the toggle's stem-pin
        # guarantee), then give the single strands the LAST word with a final collision-aware route.
        _orient_hairpin_outward(xs, ys, n, p_lo, p_hi, list(lx), list(ly), {r for pr in kept for r in pr})
        _clear_hairpin_off_stems(xs, ys, n, p_lo, p_hi, kept)
        _reflow_single_strands(xs, ys, pairs, n, outward_tails=True)  # route strands clear of all structure
        xs, ys = _declash(xs, ys, pairs, n, anchor=_frozen_anchor(n, kept, at_pairs, p_lo))  # settle local turns

    coords = xs[1 : n + 1] + ys[1 : n + 1]
    if any(not math.isfinite(v) for v in coords):
        return None
    final = sorted(math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]) for k in range(2, n + 1))
    fmed = final[len(final) // 2] if final else 1.0
    if final and final[-1] / (fmed or 1.0) >= max_step_ratio:
        return None

    return {
        "seq": raw["seq"],
        "x": [round(xs[k], 1) for k in range(1, n + 1)],
        "y": [round(ys[k], 1) for k in range(1, n + 1)],
        "pairs": sorted([min(i, j), max(i, j)] for i, j in pairs),
        "template": raw.get("template"),
        "source": raw.get("source"),
    }


def graft(
    raw_path: Path, members: dict, out_dir: Path, max_step_ratio: float = GRAFT_MAX_STEP_RATIO
) -> tuple[int, list[str]]:
    """Graft every raw R2DT diagram in ``raw_path`` -> committed served assets.

    ``raw_path`` is the combined raw snapshot (``data-pipeline/r2dt_raw.json``, the
    untouched ``ingest`` output, kept committed so this stage is reproducible without
    re-running R2DT). Clears stale per-member files in ``out_dir`` first, then writes
    one grafted ``<member_id>.json`` per kept member plus ``manifest.json``. Returns
    ``(n_written, dropped)`` where ``dropped`` lists members sent back to fornac.
    """
    raw = json.loads(raw_path.read_text())
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.json"):
        stale.unlink()
    manifest: dict[str, dict] = {}
    dropped: list[str] = []
    for member_id in sorted(raw):
        member = members.get(member_id)
        if member is None:
            dropped.append(f"{member_id}: not in members.json")
            continue
        # Re-assert the ingest sequence guard: the snapshot must still match
        # members.json (T->U), else the stem-colour overlay would misalign if
        # members.json changed after the raw snapshot was committed.
        expected = to_rna(member.get("fasta_sequence") or "")
        if raw[member_id].get("seq") != expected:
            dropped.append(
                f"{member_id}: raw sequence != fasta_sequence "
                f"(len {len(raw[member_id].get('seq', ''))} vs {len(expected)}) -- colour overlay would misalign"
            )
            continue
        grafted = graft_member(raw[member_id], member, max_step_ratio)
        if grafted is None:
            dropped.append(f"{member_id}: R2DT base layout too distorted -> fornac fallback")
            continue
        with (out_dir / f"{member_id}.json").open("w", encoding="utf-8") as fh:
            json.dump(grafted, fh, separators=(",", ":"), ensure_ascii=True)
        manifest[member_id] = {"template": grafted["template"], "source": grafted["source"]}
    manifest_obj = {"count": len(manifest), "diagrams": dict(sorted(manifest.items()))}
    with (out_dir / "manifest.json").open("w", encoding="utf-8") as fh:
        json.dump(manifest_obj, fh, separators=(",", ":"), ensure_ascii=True)
    return len(manifest), dropped


# --- stage 4: full-length terminator-conformation diagrams ------------------
#
# The R2DT/RF00230 template + graft draw the ANTITERMINATOR (gene-ON) fold. The
# alternative TERMINATOR (gene-OFF) conformation shares Stem I/II/III and differs only in
# the 3' region (the antiterminator helix is replaced by the terminator hairpin); tbdb
# draws both full-length, side by side. ``graft_terminator_member`` builds the SAME shared
# declashed stems-only base ``graft_member`` does (``_stems_base`` over the kept Stem I/II/III
# pairs) and folds the terminator hairpin in where the antiterminator sat, so toggling
# antiterm<->term pins the (declashed) stems and only the 3' hairpin swaps. Committed under
# ``public/data/r2dt/term/`` for the in-app conformation toggle; members without raw R2DT
# coords (or whose reflow stays too distorted) fall back to fornac, which also renders the
# full-length terminator (from the derived ``whole_term_structure``). A simple terminator
# hairpin uses the deterministic ``_ladder_hairpin``; a branched terminator (a second
# hairpin / multiloop, ~1/3 of members) uses ``_naview_hairpin`` (lazy ViennaRNA).


def _balanced_round(dot: str) -> bool:
    """True iff ``dot`` is balanced round-bracket dot-bracket (``(`` ``)`` ``.`` only)."""
    depth = 0
    for ch in dot:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth < 0:
                return False
        elif ch != ".":
            return False
    return depth == 0


def _spread_coincident(
    cx: list[float], cy: list[float], min_dist: float, passes: int = 6
) -> tuple[list[float], list[float]]:
    """Push residues that landed on (nearly) the same point apart so no two glyphs overlap.

    A degenerate sub-structure -- a lone base pair flanked by an unpaired run on EACH
    strand -- makes the two flanking bulges bow to the same point, so two residues can
    share a coordinate. Separate any pair closer than ``min_dist`` along their offset
    (or, when exactly coincident, perpendicular to the local backbone), iterating a few
    passes so a cascade settles. Operates on 0-based ``cx``/``cy`` in place; returns them.
    """
    n = len(cx)
    for _ in range(passes):
        moved = False
        for i in range(n):
            for j in range(i + 1, n):
                dx, dy = cx[j] - cx[i], cy[j] - cy[i]
                d = math.hypot(dx, dy)
                if d >= min_dist:
                    continue
                moved = True
                if d < 1e-9:  # exactly coincident -> separate along the backbone normal
                    bx, by = 0.0, 0.0
                    for k in (i - 1, i + 1, j - 1, j + 1):  # nearest non-degenerate neighbour
                        if 0 <= k < n and math.hypot(cx[k] - cx[i], cy[k] - cy[i]) > 1e-9:
                            bx, by = cx[k] - cx[i], cy[k] - cy[i]
                            break
                    bl = math.hypot(bx, by)
                    ux, uy = (-by / bl, bx / bl) if bl > 1e-9 else (1.0, 0.0)
                else:
                    ux, uy = dx / d, dy / d
                shift = (min_dist - d) / 2 + 1e-3
                cx[i] -= ux * shift
                cy[i] -= uy * shift
                cx[j] += ux * shift
                cy[j] += uy * shift
        if not moved:
            break
    return cx, cy


def graft_terminator_member(
    raw: dict, member: dict, max_step_ratio: float = GRAFT_MAX_STEP_RATIO
) -> dict | None:
    """Graft a member's TERMINATOR hairpin onto its raw R2DT layout -> a FULL-LENGTH
    terminator-conformation diagram (PLAN section 9).

    The terminator (gene-OFF) and antiterminator (gene-ON) folds share Stem I/II/III and
    differ only in the 3' region; tbdb draws both full-length, side by side. This builds the
    SAME shared declashed stems-only base ``graft_member`` does (``_stems_base`` over the kept
    Stem I/II/III pairs), then folds the terminator hairpin in where the antiterminator helix
    sat, so toggling antiterm<->term pins the stems and only the 3' hairpin swaps:

      * locate the terminator in the leader (``term_sequence`` T->U is an exact substring of
        ``raw["seq"]``), giving its leader span ``[tlo, thi]`` and pairs (``term_structure``
        shifted into leader coordinates);
      * drop R2DT template pairs touching the switch region (AT span U terminator span) and
        declash the rest (Stem I/II/IIA-B/III) into the shared base;
      * lay the terminator core on the deterministic ladder (simple hairpin) or NAView
        (branched -- ~1/3 of terminators), orient it OUTWARD from the layout centroid like
        ``graft_member`` does, reflow the single strands, and declash the switch with the
        stems FROZEN so they stay byte-identical to the base.

    Returns the compact diagram (schema as ``ingest``/``graft``) with ``seq`` = the FULL
    leader, or ``None`` when the member has no drawable terminator (no alignment / pairless)
    or the stems-only base stays too distorted (longest step >= ``max_step_ratio`` x median)
    -- the caller falls those back to fornac. Shares the ``_stems_base`` / hairpin-fold
    helpers with ``graft_member``; wherever both grafts keep the same pairs, the stems come
    out byte-identical (the toggle's stem-pinning guarantee).
    """
    seq = raw["seq"]
    n = len(seq)
    tseq = to_rna(member.get("term_sequence") or "")
    tdot = member.get("term_structure") or ""
    if not tseq or not tdot or len(tseq) != len(tdot) or not _balanced_round(tdot) or "(" not in tdot:
        return None
    t0 = seq.find(tseq)
    if t0 < 0 or seq.find(tseq, t0 + 1) >= 0:
        return None  # terminator absent, or not a UNIQUE substring -> can't place it unambiguously
    tlo, thi = t0 + 1, t0 + len(tseq)  # 1-based, inclusive

    xs = [0.0] + [float(v) for v in raw["x"]]  # 1-based, xs[1..n]
    ys = [0.0] + [float(v) for v in raw["y"]]
    rpairs = [tuple(p) for p in raw["pairs"]]

    tpt = _pair_table(tdot)
    term_pairs = [(i + t0, tpt[i] + t0) for i in range(1, len(tdot) + 1) if i < tpt[i]]
    if not term_pairs:
        return None
    p_lo = min(i for i, _ in term_pairs)
    p_hi = max(j for _, j in term_pairs)

    # Keep R2DT template pairs that touch NEITHER the antiterminator-helix span NOR the
    # terminator span (each region SEPARATELY -- not their contiguous union, which would
    # swallow a stem sitting between a disjoint terminator + antiterminator, e.g. T0396.m2).
    # These kept Stem I/II/IIA-B/III pairs are the SAME shared base graft_member declashes.
    at = next((s for s in member.get("stems", []) if s["key"] == "at"), None)

    def _in_switch(p: int) -> bool:
        return (tlo <= p <= thi) or (at is not None and at["start"] <= p <= at["end"])

    kept = [(min(i, j), max(i, j)) for (i, j) in rpairs if not (_in_switch(i) or _in_switch(j))]

    base = _stems_base(xs, ys, kept, n, max_step_ratio)
    if base is None:
        return None  # R2DT's stems-only base too distorted -> fornac fallback
    xs, ys = base

    # local terminator-core coords: deterministic ladder (simple) or NAView (branched)
    length = p_hi - p_lo + 1
    sub = ["."] * length
    for i, j in term_pairs:
        sub[i - p_lo] = "("
        sub[j - p_lo] = ")"
    local = _ladder_hairpin("".join(sub))
    if local is None:
        local = _naview_hairpin_declashed("".join(sub))  # branched terminator (multiloop) -> NAView
    lx, ly = local
    # separate any coincident local residues (degenerate lone-pair-between-bulges) BEFORE
    # placing, so no two glyphs overlap; touches only the terminator core, never the stems.
    lx, ly = _spread_coincident(list(lx), list(ly), 0.5)

    pairs = kept + term_pairs

    # Fold the terminator hairpin into the shared base (radiating outward like the stems), push it
    # clear of the frozen stems, declash the switch with the stems FROZEN (so the kept Stem I/II/III
    # stay byte-identical to the base graft_member also pins to), then settle local turns.
    _orient_hairpin_outward(xs, ys, n, p_lo, p_hi, list(lx), list(ly), {r for pr in kept for r in pr})
    _clear_hairpin_off_stems(xs, ys, n, p_lo, p_hi, kept)
    _reflow_single_strands(xs, ys, pairs, n, outward_tails=True)  # route strands clear of all structure
    xs, ys = _declash(xs, ys, pairs, n, anchor=_frozen_anchor(n, kept, term_pairs, p_lo))  # settle local turns

    coords = xs[1 : n + 1] + ys[1 : n + 1]
    if any(not math.isfinite(v) for v in coords):
        return None
    final = sorted(math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]) for k in range(2, n + 1))
    fmed = final[len(final) // 2] if final else 1.0
    if final and final[-1] / (fmed or 1.0) >= max_step_ratio:
        return None

    return {
        "seq": seq,
        "x": [round(xs[k], 1) for k in range(1, n + 1)],
        "y": [round(ys[k], 1) for k in range(1, n + 1)],
        "pairs": sorted([min(i, j), max(i, j)] for i, j in pairs),
        "template": raw.get("template"),
        "source": raw.get("source"),
    }


def terminator(
    raw_path: Path, members: dict, out_dir: Path, max_step_ratio: float = GRAFT_MAX_STEP_RATIO
) -> tuple[int, list[str]]:
    """Graft every member's terminator hairpin onto its full-length R2DT layout.

    Mirrors :func:`graft`: reads the combined raw R2DT snapshot (``r2dt_raw.json``), keeps
    members with both raw coords and a drawable terminator, and writes one full-length
    terminator diagram per kept member under ``out_dir`` + ``manifest.json`` (clearing stale
    per-member files first). Returns ``(n_written, dropped)`` where ``dropped`` lists members
    sent back to fornac. Members with no raw coords are simply absent from the snapshot and
    never appear here (the frontend falls them back to fornac too).
    """
    raw = json.loads(raw_path.read_text())
    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("*.json"):
        stale.unlink()
    manifest: dict[str, dict] = {}
    dropped: list[str] = []
    for member_id in sorted(raw):
        member = members.get(member_id)
        if member is None:
            dropped.append(f"{member_id}: not in members.json")
            continue
        # Same colour-overlay guard as graft(): the snapshot must still match members.json
        # (T->U), else the stem-colour overlay would misalign.
        expected = to_rna(member.get("fasta_sequence") or "")
        if raw[member_id].get("seq") != expected:
            dropped.append(
                f"{member_id}: raw sequence != fasta_sequence "
                f"(len {len(raw[member_id].get('seq', ''))} vs {len(expected)}) -- colour overlay would misalign"
            )
            continue
        grafted = graft_terminator_member(raw[member_id], member, max_step_ratio)
        if grafted is None:
            dropped.append(f"{member_id}: no drawable terminator graft -> fornac fallback")
            continue
        with (out_dir / f"{member_id}.json").open("w", encoding="utf-8") as fh:
            json.dump(grafted, fh, separators=(",", ":"), ensure_ascii=True)
        manifest[member_id] = {"template": grafted["template"], "source": grafted["source"]}
    manifest_obj = {"count": len(manifest), "diagrams": dict(sorted(manifest.items()))}
    with (out_dir / "manifest.json").open("w", encoding="utf-8") as fh:
        json.dump(manifest_obj, fh, separators=(",", ":"), ensure_ascii=True)
    return len(manifest), dropped


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

    default_raw = repo / "data-pipeline" / "r2dt_raw.json"
    p_graft = sub.add_parser("graft", help="fold a real antiterminator hairpin into each R2DT diagram")
    p_graft.add_argument("--raw", type=Path, default=default_raw, help="combined raw R2DT snapshot")
    p_graft.add_argument("--members", type=Path, default=default_members)
    p_graft.add_argument("--out", type=Path, default=default_out, help="public/data/r2dt output dir")
    p_graft.add_argument("--max-step-ratio", type=float, default=GRAFT_MAX_STEP_RATIO)

    p_term = sub.add_parser(
        "terminator", help="graft each member's terminator hairpin onto its full-length R2DT diagram"
    )
    p_term.add_argument("--raw", type=Path, default=default_raw, help="combined raw R2DT snapshot")
    p_term.add_argument("--members", type=Path, default=default_members)
    p_term.add_argument("--out", type=Path, default=default_out / "term", help="public/data/r2dt/term output dir")
    p_term.add_argument("--max-step-ratio", type=float, default=GRAFT_MAX_STEP_RATIO)

    args = parser.parse_args(argv)
    members = load_members(args.members)

    if args.cmd == "fasta":
        n = write_input_fasta(members, args.out)
        print(f"wrote {n} records -> {args.out}")
        return 0

    if args.cmd == "graft":
        n, dropped = graft(args.raw, members, args.out, args.max_step_ratio)
        print(f"wrote {n} grafted R2DT diagrams + manifest.json -> {args.out}")
        for d in dropped:
            print(f"  DROPPED {d}")
        if dropped:
            print(f"{len(dropped)} member(s) fall back to fornac (see above).")
        return 0

    if args.cmd == "terminator":
        n, dropped = terminator(args.raw, members, args.out, args.max_step_ratio)
        print(f"wrote {n} full-length terminator R2DT diagrams + manifest.json -> {args.out}")
        for d in dropped:
            print(f"  DROPPED {d}")
        if dropped:
            print(f"{len(dropped)} member(s) fall back to fornac (see above).")
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
