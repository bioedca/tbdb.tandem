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

#: RNA nucleotide alphabet R2DT emits (drops the ``5'``/``3'`` end-marker entries).
_NT = frozenset("ACGU")

#: A grafted diagram is rejected (member falls back to fornac) when its longest
#: backbone step exceeds this multiple of the median step -- i.e. R2DT's own base
#: layout was too distorted (a big exterior loop) for the graft to rescue. Chosen
#: empirically: the standard T-box helix-junction kink is ~3.5-4x; the pathological
#: big-circle layouts are >=5x. See PROGRESS (graft step).
GRAFT_MAX_STEP_RATIO = 5.0


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


def _place_tail(xs, ys, s, e, anchor, med, n, partner, reverse=False) -> None:
    """Reattach a dangling 5'/3' tail, retracing R2DT's curve at an even median step.

    The tail residues still carry R2DT's coordinates at graft time. Rather than fan
    them into one long straight ray (which balloons the bounding box and shoots the 3'
    leader off at a steep angle), OR rigid-replay R2DT verbatim (which would carry over
    any interior R2DT jump as a fresh backbone break), we re-trace R2DT's per-step
    HEADINGS at a uniform median step, starting from the anchor along the local exit
    tangent. That keeps R2DT's curve shape while guaranteeing every tail step is ~one
    median apart -- no break survives inside the run. The tangent continues the
    backbone OUT through the anchor (down the helix rail it caps), not across the
    hairpin. A degenerate (coincident) R2DT step falls back to the tangent direction.
    """
    ax, ay = xs[anchor], ys[anchor]
    prev = anchor - 1 if not reverse else anchor + 1
    if 1 <= prev <= n:
        tx, ty = ax - xs[prev], ay - ys[prev]
    else:
        p = partner.get(anchor)
        tx, ty = (ax - xs[p], ay - ys[p]) if p is not None else (1.0, 0.0)
    tl = math.hypot(tx, ty) or 1.0
    tx, ty = tx / tl, ty / tl

    walk = list(range(s, e + 1)) if not reverse else list(range(e, s - 1, -1))
    ox = [xs[k] for k in walk]  # capture R2DT coords before mutating
    oy = [ys[k] for k in walk]
    # rotate R2DT's whole heading field so the tail's launch step aligns with the tangent
    rot = (
        math.atan2(ty, tx) - math.atan2(oy[1] - oy[0], ox[1] - ox[0])
        if len(walk) >= 2
        else 0.0
    )
    c, sn = math.cos(rot), math.sin(rot)
    px, py = ax + tx * med, ay + ty * med  # first residue: one step out along the tangent
    xs[walk[0]], ys[walk[0]] = px, py
    for i in range(1, len(walk)):
        hx, hy = ox[i] - ox[i - 1], oy[i] - oy[i - 1]
        hl = math.hypot(hx, hy)
        if hl < 1e-9:
            ux, uy = tx, ty
        else:
            ux = (hx * c - hy * sn) / hl  # R2DT heading, rotated into place + unit length
            uy = (hx * sn + hy * c) / hl
        px, py = px + ux * med, py + uy * med
        xs[walk[i]], ys[walk[i]] = px, py


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
    pairs = list(rpairs)
    wapt = _pair_table(member.get("whole_antiterm_structure") or "")

    at = next((s for s in member.get("stems", []) if s["key"] == "at"), None)
    if at and len(wapt) == n + 1:
        a, b = at["start"], at["end"]
        at_pairs = [(i, wapt[i]) for i in range(a, b + 1) if i < wapt[i] <= b]
        if at_pairs:
            p_lo = min(i for i, _ in at_pairs)
            p_hi = max(j for _, j in at_pairs)
            length = p_hi - p_lo + 1
            sub = ["."] * length
            for i, j in at_pairs:
                sub[i - p_lo] = "("
                sub[j - p_lo] = ")"
            local = _ladder_hairpin("".join(sub))
            if local is None:
                local = _naview_hairpin("".join(sub))  # branched AT (none in data) → NAView
            lx, ly = local
            # scale the local hairpin to the diagram's own nucleotide spacing
            med = _median_step(xs, ys)
            lsteps = sorted(math.hypot(lx[k] - lx[k - 1], ly[k] - ly[k - 1]) for k in range(1, length))
            lstep = lsteps[len(lsteps) // 2] if lsteps else 1.0
            sc = med / (lstep or 1.0)
            lx = [v * sc for v in lx]
            ly = [v * sc for v in ly]
            # exterior flow at the AT base (from the nearest paired residue before it)
            anchored = {r for pr in rpairs for r in pr}
            before = [r for r in anchored if r < p_lo]
            pa = max(before) if before else max(1, p_lo - 1)
            fx, fy = xs[p_lo] - xs[pa], ys[p_lo] - ys[pa]
            fl = math.hypot(fx, fy) or 1
            fx, fy = fx / fl, fy / fl
            # Aim the hairpin axis OUTWARD from the layout centroid so it radiates
            # parallel to the other stems, instead of perpendicular to local flow. The
            # ladder is built base(level 0) → apex(top), so its local axis runs from the
            # midpoint of the base to the local centroid; rotate that onto the outward
            # direction (the AT region's own centre, in R2DT coords, minus the centroid).
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
            dx, dy = xs[p_lo] - rx[0], ys[p_lo] - ry[0]
            for k in range(length):
                xs[p_lo + k] = rx[k] + dx
                ys[p_lo + k] = ry[k] + dy
            pairs = [(i, j) for i, j in rpairs if not (a <= i <= b or a <= j <= b)] + at_pairs

    # reflow single-stranded runs that carry a (often graft-induced) backbone break
    med = _median_step(xs, ys)
    cen = (sum(xs[1 : n + 1]) / n, sum(ys[1 : n + 1]) / n)
    partner: dict[int, int] = {}
    for i, j in pairs:
        partner[i] = j
        partner[j] = i
    anchored = set(partner)
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
        steps = [math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]) for k in range(max(2, lo + 1), min(n, hi) + 1)]
        if any(st > 2.2 * med for st in steps):
            if ha_lo and ha_hi:
                _place_arc(xs, ys, s, e, lo, hi, med, cen)
            elif ha_lo:
                _place_tail(xs, ys, s, e, lo, med, n, partner)
            elif ha_hi:
                _place_tail(xs, ys, s, e, hi, med, n, partner, reverse=True)
        i = j

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

    n, problems = ingest(args.results, members, args.out, args.metadata)
    print(f"wrote {n} R2DT diagrams + manifest.json -> {args.out}")
    for p in problems:
        print(f"  SKIPPED {p}")
    if problems:
        print(f"{len(problems)} member(s) skipped (see above).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
