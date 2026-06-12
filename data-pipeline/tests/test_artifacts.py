"""Integrity checks over the committed public/data/*.json (PLAN section 10.1; S0.7).

Independent of any rebuild: these guard against a stale or corrupt **committed**
artifact set (the files GitHub Pages serves directly, PLAN section 2.3/11.4). They
assert the absolute load-bearing counts (470 / 949 / 488, CLAUDE.md section 2),
re-derive gate #10 from the committed ``members.json`` with the build's own
:func:`build_json.partition_for_tree`, and re-check the URL / balance / golden gates
over the real data -- the full-scale complement to ``test_build.py``'s fixture run.
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import pytest

import build_json as bj
import build_r2dt as br
from wuss import is_balanced

DATA = Path(__file__).resolve().parents[2] / "public" / "data"

#: Members the conformation toggle enables = non-null ``whole_term_structure`` (PLAN
#: section 9). 949 - 14 (no term_sequence) - 13 (balanced but pairless) = 922.
N_TERMINATOR = 922
#: Committed FULL-LENGTH terminator R2DT diagrams (build_r2dt.py terminator graft): the
#: members with both raw R2DT coords AND a drawable terminator whose reflow passes the
#: quality gate. The rest of the 922 fall back to fornac (also full-length). A regen that
#: moves this must update the constant consciously (CLAUDE.md section 2). (The clash-elimination
#: overhaul -- collision-aware single-strand routing, rigid-body stem separation, and dropping the
#: aspect/fill NAView relayout that was discarding clean elongated layouts -- recovers a few members
#: the old quality gate rejected, 778 -> 784.)
N_TERMINATOR_R2DT = 784

#: Corpus ceiling on the number of NON-adjacent glyph pairs that visually overlap (centres < 0.88 x
#: median step) summed over every committed antiterm + term diagram. The committed set sits at ~661
#: (212 antiterm + 449 term -- pre-existing structural crowding the single-strand reflow already
#: minimises); the compact serpentine fold of long tails left it slightly LOWER, not higher. This is
#: a regression ceiling against a future routing change flooding overlaps -- a conscious constant: a
#: regen that legitimately moves it updates it (like N_TERMINATOR_R2DT).
N_R2DT_VISUAL_OVERLAP_CEILING = 720

# Load-bearing counts (PLAN section 3.1, 5.4; CLAUDE.md section 2). The main-tree
# tip count is the value the S0.6 build emitted and PROGRESS.md recorded -- never
# assumed (CLAUDE.md section 2). A legitimate source change that moves it must
# update this constant consciously.
N_LOCI, N_MEMBERS, N_PAIRS = 470, 949, 488
N_MAIN_TIPS, N_FALLBACK = 847, 102


# --- fixtures: the committed artifacts --------------------------------------

@pytest.fixture(scope="module")
def loci():
    return json.loads((DATA / "loci.json").read_text())


@pytest.fixture(scope="module")
def members():
    return json.loads((DATA / "members.json").read_text())


@pytest.fixture(scope="module")
def identity():
    return json.loads((DATA / "identity.json").read_text())


@pytest.fixture(scope="module")
def summary():
    return json.loads((DATA / "summary.json").read_text())


# --- presence ---------------------------------------------------------------

def test_all_artifacts_present():
    for name in ("summary.json", "loci.json", "members.json", "identity.json",
                 "members.csv", "tree_input.fasta", "antiterm_fallback.fasta"):
        assert (DATA / name).exists(), f"missing committed artifact: {name}"


# --- members.csv : the member-level base table with flattened stem spans -----

@pytest.fixture(scope="module")
def members_csv():
    with (DATA / "members.csv").open(newline="") as fh:
        rows = list(csv.reader(fh))
    return rows[0], rows[1:]


def test_members_csv_shape(members_csv):
    header, rows = members_csv
    assert header == bj._MEMBER_CSV_HEADER
    assert len(rows) == N_MEMBERS
    for key in bj._STEM_KEYS:  # every stem key contributes a start/end column pair
        assert f"stem_{key}_start" in header and f"stem_{key}_end" in header


def test_members_csv_stem_spans_match_members_json(members_csv, members):
    """The flat stem columns reproduce members.json['stems'] exactly -- so the CSV
    carries the same spans the web app colours the RNA structure by (PLAN section 9)."""
    header, rows = members_csv
    idx = {c: i for i, c in enumerate(header)}
    for row in rows:
        mid = row[idx["member_id"]]
        assert mid in members, f"members.csv references unknown member {mid}"
        expected = {s["key"]: (s["start"], s["end"]) for s in members[mid]["stems"]}
        for key in bj._STEM_KEYS:
            lo, hi = row[idx[f"stem_{key}_start"]], row[idx[f"stem_{key}_end"]]
            got = (int(lo), int(hi)) if lo != "" else None
            assert got == expected.get(key), f"{mid} stem {key}: {got} != {expected.get(key)}"


@pytest.fixture(scope="module")
def committed_context():
    """The committed per-locus NCBI genomic context, keyed by tandem_id (or None)."""
    return bj.load_locus_context_dir(DATA / "locus_context")


def test_members_csv_is_current(loci, members, committed_context, tmp_path):
    """The committed members.csv is exactly what build_json.write_members_csv emits
    from the committed JSON + the committed locus_context -- guards against a stale
    hand-edited table (incl. the NCBI-derived genomic-context columns)."""
    bj.write_members_csv(loci["loci"], members, tmp_path, context_by_locus=committed_context)
    regenerated = (tmp_path / "members.csv").read_bytes()
    committed = (DATA / "members.csv").read_bytes()
    assert regenerated == committed, "public/data/members.csv is stale; rerun build_json.py"


def _oracle_primary_gene(genes, locus_strand):
    """INDEPENDENT reimplementation of the proximal-co-oriented primary-gene rule (not
    bj._pick_primary_gene) -- so the genomic-column check below cannot be tautological."""
    if not genes:
        return None
    co = [g for g in genes if g["strand"] == locus_strand]
    pool = co or genes
    return sorted(pool, key=lambda g: (g["offset"], g["protein_id"] or ""))[0]


def _oracle_gene_span(gene, locus_strand, interval):
    """INDEPENDENT inverse-offset genomic span (not bj._gene_genomic_span)."""
    lo, hi = interval
    g5 = lo + gene["offset"] if locus_strand == "+" else hi - gene["offset"]
    other = g5 + (gene["length"] - 1) if locus_strand == "+" else g5 - (gene["length"] - 1)
    return (min(g5, other), max(g5, other))


def test_members_csv_genomic_columns_match_locus_context(members_csv, committed_context):
    """The NCBI-derived genomic columns are faithful to public/data/locus_context/<id>.json,
    re-derived by an INDEPENDENT oracle (resolved flag, interval, per-element offset, and the
    proximal-co-oriented downstream gene incl. the inverse-offset genomic span). This proves
    the CSV is not tautological AND guards members.csv <-> locus_context staleness (the CSV
    depends on a separately-generated artifact: a regenerated context with no CSV refill
    would diverge here)."""
    assert committed_context, "committed locus_context/ missing"
    header, rows = members_csv
    idx = {c: i for i, c in enumerate(header)}
    for row in rows:
        tid, mid = row[idx["tandem_id"]], row[idx["member_id"]]
        ctx = committed_context.get(tid)
        assert ctx is not None, f"{tid}: no locus_context record"
        assert row[idx["genomic_resolved"]] == ("true" if ctx["resolved"] else "false")
        assert row[idx["locus_interval_start"]] == str(ctx["interval"][0])
        assert row[idx["locus_interval_end"]] == str(ctx["interval"][1])
        off = next(e["offset"] for e in ctx["elements"] if e["member_id"] == mid)
        assert row[idx["element_offset"]] == str(off), f"{mid} element_offset"
        genes = ctx["downstream_genes"]
        assert row[idx["downstream_gene_count"]] == str(len(genes)), f"{tid} gene count"
        gene = _oracle_primary_gene(genes, ctx["strand"])
        if gene is None:
            for col in ("downstream_gene_name", "downstream_gene_id", "downstream_gene_locus_tag",
                        "downstream_gene_strand", "downstream_gene_offset",
                        "downstream_gene_start", "downstream_gene_end"):
                assert row[idx[col]] == "", f"{tid} {col} should be blank (no primary gene)"
        else:
            assert row[idx["downstream_gene_name"]] == (gene.get("name") or "")
            assert row[idx["downstream_gene_id"]] == (gene["protein_id"] or "")
            assert row[idx["downstream_gene_locus_tag"]] == (gene["locus_tag"] or "")
            assert row[idx["downstream_gene_strand"]] == (gene["strand"] or "")
            assert row[idx["downstream_gene_offset"]] == str(gene["offset"])
            start, end = _oracle_gene_span(gene, ctx["strand"], ctx["interval"])
            assert row[idx["downstream_gene_start"]] == str(start), f"{tid} gene start"
            assert row[idx["downstream_gene_end"]] == str(end), f"{tid} gene end"


def _frontend_window(window: dict, feat: str, length: int):
    """The span the VIEWERS keep for a feature -- an INDEPENDENT oracle (not the CSV
    producer): validSpan (ascending + >= 1) AND the hi <= length drop, mirroring
    src/lib/sequence.ts featureSpans/markerSpans/overlayFeatures. Used to prove the CSV
    matches what the app actually highlights (so the check can't be tautological)."""
    span = (window or {}).get(feat) or [None, None]
    a, b = span[0], span[1]
    if a is None or b is None or a < 1 or b < 1:
        return None
    lo, hi = min(a, b), max(a, b)
    return (lo, hi) if hi <= length else None


def test_members_csv_feature_windows_match_what_viewers_highlight(members_csv, members):
    """The feature-window columns (specifier loop, codon, UGGN/discrim, terminator) +
    term_sequence carry the EXACT spans the viewers highlight by (PLAN section 9). Checked
    against an INDEPENDENT frontend oracle (leader-length bounded), so an off-the-3'-end
    span the app drops (e.g. T0299.m2's corrupt term = [153, 143] over 143 bp) must be
    blank in the CSV too -- the case the old _csv_window self-comparison could not catch."""
    header, rows = members_csv
    idx = {c: i for i, c in enumerate(header)}
    for row in rows:
        mid = row[idx["member_id"]]
        member = members[mid]
        window = member["coords"]["window"]
        length = len(member["fasta_sequence"])
        for feat in bj._FEATURE_CSV_FEATS:
            lo, hi = row[idx[f"{feat}_start"]], row[idx[f"{feat}_end"]]
            got = (int(lo), int(hi)) if lo != "" else None
            assert got == _frontend_window(window, feat, length), f"{mid} {feat}: {got}"
        ts = row[idx["term_sequence"]] or None
        assert ts == member["term_sequence"], f"{mid} term_sequence CSV != members.json"


def _to_rna(seq: str | None) -> str:
    return (seq or "").upper().replace("T", "U")


def test_terminator_manifest_matches_committed_diagrams():
    """The committed term/manifest.json count == the number of committed term/<id>.json
    files == N_TERMINATOR_R2DT. Guards against the terminator data being untracked /
    partially staged (a fresh checkout would otherwise ship a dead terminator R2DT viewer)."""
    term = DATA / "r2dt" / "term"
    manifest = json.loads((term / "manifest.json").read_text())
    files = {p.stem for p in term.glob("*.json")} - {"manifest"}
    assert manifest["count"] == N_TERMINATOR_R2DT
    assert len(files) == N_TERMINATOR_R2DT
    assert set(manifest["diagrams"]) == files
    # the terminator graft uses the same raw coords as the antiterminator graft, so almost
    # every term diagram is also an antiterm diagram (a few differ where one graft's quality
    # gate dropped the member and the other's did not).
    antiterm = set(json.loads((DATA / "r2dt" / "manifest.json").read_text())["diagrams"])
    assert len(files - antiterm) <= 5  # only a handful of term-only diagrams


def test_terminator_diagrams_full_length_current_and_consistent(members):
    """Every committed terminator diagram is the FULL-LENGTH conformation, internally
    consistent AND current vs members.json: seq == toRna(fasta_sequence) (the whole leader,
    not the hairpin), the terminator-hairpin pairs (term_structure shifted into leader
    coordinates) are all present, equal-length finite coords, never pairless."""
    term = DATA / "r2dt" / "term"
    for p in term.glob("*.json"):
        if p.stem == "manifest":
            continue
        mid = p.stem
        m = members[mid]
        d = json.loads(p.read_text())
        n = len(d["seq"])
        assert len(d["x"]) == n and len(d["y"]) == n
        assert all(math.isfinite(v) for v in d["x"] + d["y"])
        assert d["seq"] == _to_rna(m["fasta_sequence"])  # FULL leader, current (not stale)
        # the terminator hairpin pairs, shifted into leader coordinates, are all drawn
        t0 = _to_rna(m["fasta_sequence"]).find(_to_rna(m["term_sequence"]))
        assert t0 >= 0, f"{mid}: term_sequence must align into the leader"
        pt = br._pair_table(m["term_structure"])
        want = {(i + t0, pt[i] + t0) for i in range(1, len(m["term_structure"]) + 1) if i < pt[i]}
        drawn = {tuple(pr) for pr in d["pairs"]}
        assert want <= drawn, f"{mid}: terminator pairs missing from the diagram"
        assert d["pairs"], f"{mid}: a terminator diagram must have >= 1 base pair"


def test_terminator_diagrams_pin_stems_across_the_toggle(members):
    """The headline guarantee on the COMMITTED data (issue #45): a member's terminator diagram
    shares the antiterminator diagram's Stem I/II/III coordinates (only the 3' hairpin swaps).
    Both grafts declash the SAME stems-only base, so for every member drawn in BOTH r2dt/ and
    r2dt/term/, the residues paired in both (the kept stems) must have identical coords --
    except a handful of degenerate Partial leaders whose terminator spans almost the whole
    molecule (those legitimately refold)."""
    at_dir, tm_dir = DATA / "r2dt", DATA / "r2dt" / "term"
    at_ids = {p.stem for p in at_dir.glob("*.json")} - {"manifest"}
    tm_ids = {p.stem for p in tm_dir.glob("*.json")} - {"manifest"}
    both = sorted(at_ids & tm_ids)
    assert len(both) > 700  # the bulk of the committed terminator set is drawn in both
    mismatched = []
    for mid in both:
        a = json.loads((at_dir / f"{mid}.json").read_text())
        t = json.loads((tm_dir / f"{mid}.json").read_text())
        a_res = {i for pr in a["pairs"] for i in pr}
        t_res = {i for pr in t["pairs"] for i in pr}
        stem_res = {
            p for s in members[mid]["stems"] if s["key"] != "at"
            for p in range(s["start"], s["end"] + 1)
        }
        cmp_res = [r for r in stem_res if r in a_res and r in t_res]
        if cmp_res and not all(
            abs(a["x"][r - 1] - t["x"][r - 1]) <= 0.1 and abs(a["y"][r - 1] - t["y"][r - 1]) <= 0.1
            for r in cmp_res
        ):
            mismatched.append(mid)
    # the only members whose stems move are degenerate Partial leaders (terminator ≈ whole leader)
    assert all(members[mid]["completeness"] == "Partial" for mid in mismatched), mismatched
    assert len(mismatched) <= 20, f"too many members with non-pinned stems: {mismatched}"


def test_grafts_keep_identical_stem_pairs_for_non_partial(members):
    """The MECHANISM behind the toggle's stem-pinning (issue #45): for every member that is NOT
    a degenerate Partial leader, ``graft_member`` (antiterminator) and ``graft_terminator_member``
    (terminator) drop the SAME raw R2DT pairs -- so ``_stems_base`` declashes a byte-identical
    stems-only base for both, and the kept Stem I/II/III come out byte-identical across the toggle.

    ``graft_member`` excludes the AT span only; ``graft_terminator_member`` the AT span U the
    terminator span. The two ``kept`` sets coincide UNLESS a raw pair touches the terminator span
    but not the AT span -- which on the committed corpus happens ONLY for *Partial* leaders whose
    terminator alignment spans (most of) the whole leader (there those pairs are the real upstream
    stems the antiterminator keeps and the terminator refold sheds; such leaders legitimately do
    not pin and are exempt). This guards against a future member silently breaking the pin by
    having differing kept sets while being non-Partial. Scoped to the members drawn in BOTH
    conformations (those that actually pin): a member dropped from one graft never appears in the
    toggle, so its kept set is free to differ regardless of completeness."""
    raw = json.loads((Path(__file__).resolve().parents[1] / "r2dt_raw.json").read_text())
    at_ids = set(json.loads((DATA / "r2dt" / "manifest.json").read_text())["diagrams"])
    tm_ids = set(json.loads((DATA / "r2dt" / "term" / "manifest.json").read_text())["diagrams"])
    checked, differing = 0, []
    for mid in sorted(at_ids & tm_ids):
        m, r = members.get(mid), raw.get(mid)
        if m is None or r is None:
            continue
        seq, rpairs = r["seq"], [tuple(p) for p in r["pairs"]]
        at = next((s for s in m["stems"] if s["key"] == "at"), None)
        tseq, tdot = _to_rna(m.get("term_sequence") or ""), m.get("term_structure") or ""
        if not tseq or not tdot or len(tseq) != len(tdot):
            continue  # no terminator -> graft_terminator_member returns None (not in `both`)
        t0 = seq.find(tseq)
        if t0 < 0 or seq.find(tseq, t0 + 1) >= 0:
            continue  # terminator absent or not a UNIQUE substring -> term graft skips it too
        tlo, thi = t0 + 1, t0 + len(tseq)
        a0, a1 = (at["start"], at["end"]) if at else (1, 0)  # a0 > a1 -> empty AT span
        # graft_member drops AT-touching pairs; graft_terminator_member also the terminator span
        kept_at = {
            (min(i, j), max(i, j)) for (i, j) in rpairs if not (a0 <= i <= a1 or a0 <= j <= a1)
        }
        kept_tm = {
            (min(i, j), max(i, j))
            for (i, j) in rpairs
            if not (a0 <= i <= a1 or a0 <= j <= a1 or tlo <= i <= thi or tlo <= j <= thi)
        }
        checked += 1
        if kept_at != kept_tm:
            differing.append(mid)
    assert checked > 700
    assert all(members[mid]["completeness"] == "Partial" for mid in differing), differing


def test_whole_term_structure_current_balanced_and_counted(members):
    """The committed members.json ``whole_term_structure`` is current (re-derivable from the
    same member fields by the build), balanced, leader-length, and non-null for exactly
    N_TERMINATOR members -- the conformation toggle's enabled set."""
    nonnull = 0
    for mid, m in members.items():
        wts = bj.derive_whole_term_structure(
            m["fasta_sequence"], m["whole_antiterm_structure"],
            m["term_sequence"], m["term_structure"], m["stems"],
        )
        assert m["whole_term_structure"] == wts, f"{mid}: committed whole_term_structure is stale"
        if wts is not None:
            nonnull += 1
            assert is_balanced(wts) and len(wts) == len(m["fasta_sequence"])
    assert nonnull == N_TERMINATOR


def test_members_csv_drops_off_3prime_term_like_the_viewers(members_csv, members):
    """Regression anchor for the off-the-3'-end drop: T0299.m2's term window is corrupt
    ([153, 143] over a 143 bp leader); the viewers drop it, so the CSV term columns must
    be blank (not the phantom 143..153 the low-end-only rule used to write)."""
    header, rows = members_csv
    idx = {c: i for i, c in enumerate(header)}
    row = next(r for r in rows if r[idx["member_id"]] == "T0299.m2")
    assert row[idx["term_start"]] == "" and row[idx["term_end"]] == ""
    # the member's raw window is indeed off the end (guards the fixture's intent)
    assert members["T0299.m2"]["coords"]["window"]["term"][0] > len(members["T0299.m2"]["fasta_sequence"])


def test_term_sequence_pairs_with_term_structure(members):
    """term_sequence is equal-length with term_structure wherever both are present, and
    term_structure stays round-bracket balanced -- the invariant the terminator render
    relies on (the sequence threads onto the structure base-for-base)."""
    paired = 0
    for mid, m in members.items():
        ts, td = m["term_sequence"], m["term_structure"]
        if ts is None:
            continue
        assert td is not None, f"{mid}: term_sequence without term_structure"
        assert len(ts) == len(td), f"{mid}: term_sequence/term_structure length mismatch"
        assert set(td) <= set("().") and is_balanced(td), f"{mid}: term_structure not balanced round-brackets"
        paired += 1
    assert paired >= 900  # ~935 members carry a complete terminator on the committed data


# --- compact serpentine folding of long single strands ----------------------
#
# The final reflow folds long 5'/3' tails (straight rays of k*L that inflate the drawing box) into a
# compact serpentine. These guard the COMMITTED artifacts: the bulk of long tails are actually folded
# (the feature acted, the box shrank) AND each fold is clean -- continuous backbone, no self-overlap --
# so compaction never traded the bloat for a clash. Stem pinning across the toggle is guarded
# separately by test_terminator_diagrams_pin_stems_across_the_toggle (folding is confined to the
# final pass, so the stems-only base is unchanged).


def _r2dt_diagram_paths():
    for d in (DATA / "r2dt", DATA / "r2dt" / "term"):
        for p in d.glob("*.json"):
            if p.stem != "manifest":
                yield p


def _end_tails(d: dict) -> list[tuple[int, int]]:
    """The 5' and 3' maximal UNPAIRED end-runs (1-based inclusive) of a committed diagram."""
    n = len(d["seq"])
    paired = {i for pr in d["pairs"] for i in pr}
    out: list[tuple[int, int]] = []
    i = 1
    while i <= n and i not in paired:
        i += 1
    if i - 1 >= 1:
        out.append((1, i - 1))
    j = n
    while j >= 1 and j not in paired:
        j -= 1
    if j + 1 <= n and j + 1 != 1:  # avoid double-counting an all-unpaired diagram
        out.append((j + 1, n))
    return out


def test_long_tails_are_folded_compactly():
    """The committed diagrams show the compaction acted: the overwhelming majority of long end-tails
    (k >= SERPENTINE_MIN_TAIL_NT) are FOLDED -- bbox diagonal well under the k*L of a straight ray --
    and every fold is clean: continuous backbone (no break) and no self-overlap (the serpentine rows
    stay apart). A tail that could not fold clear of the structure stays a straight ray (do no harm),
    so the fraction is a high floor, not 100%."""
    long_tails, folded = 0, 0
    for p in _r2dt_diagram_paths():
        d = json.loads(p.read_text())
        n = len(d["seq"])
        if n < 3:
            continue
        xs = [0.0] + list(d["x"])
        ys = [0.0] + list(d["y"])
        med = br._median_step(xs, ys)
        for s, e in _end_tails(d):
            k = e - s + 1
            if k < br.SERPENTINE_MIN_TAIL_NT:
                continue
            long_tails += 1
            pts = [(d["x"][r - 1], d["y"][r - 1]) for r in range(s, e + 1)]
            if br._run_extent(pts) < 0.7 * k * med:  # clearly not a straight ray
                folded += 1
                step = max(math.hypot(pts[t][0] - pts[t - 1][0], pts[t][1] - pts[t - 1][1])
                           for t in range(1, len(pts)))
                assert step <= 1.6 * med, f"{p.stem}: folded tail has a backbone break ({step / med:.2f}*L)"
                assert br._self_clear(pts, med, factor=0.85), f"{p.stem}: folded tail overlaps itself"
    assert long_tails > 1000  # the corpus really does carry many long tails (median ~42 nt antiterm)
    assert folded / long_tails >= 0.9, f"only {folded}/{long_tails} long tails folded"


def test_committed_r2dt_overlap_within_ceiling():
    """No-new-clash regression guard: the total visual glyph overlap across every committed antiterm +
    term diagram stays at or below N_R2DT_VISUAL_OVERLAP_CEILING -- so a future single-strand routing
    change (e.g. a more aggressive fold) cannot silently flood the diagrams with overlapping glyphs."""
    total = 0
    for p in _r2dt_diagram_paths():
        d = json.loads(p.read_text())
        n = len(d["seq"])
        if n < 3:
            continue
        xs = [0.0] + list(d["x"])
        ys = [0.0] + list(d["y"])
        total += br._overlap_count(xs, ys, n)
    assert total <= N_R2DT_VISUAL_OVERLAP_CEILING, f"corpus visual overlap {total} exceeds ceiling"


# --- Gate #1 / #2 / #9 : absolute counts ------------------------------------

def test_counts(loci, members, identity):
    assert len(loci["loci"]) == N_LOCI
    assert len(members) == N_MEMBERS
    assert len(identity) == N_PAIRS


def test_gate2_member_reconciliation(loci, members):
    referenced = [mid for lo in loci["loci"] for mid in lo["member_ids"]]
    assert len(referenced) == N_MEMBERS
    assert set(referenced) == set(members)
    assert sum(lo["n_cores"] for lo in loci["loci"]) == N_MEMBERS
    for lo in loci["loci"]:
        assert len(lo["member_ids"]) == lo["n_cores"]


def test_pairs_and_triples(loci):
    n2 = sum(1 for lo in loci["loci"] if lo["n_cores"] == 2)
    n3 = sum(1 for lo in loci["loci"] if lo["n_cores"] == 3)
    assert (n2, n3) == (461, 9)


# --- Gate #3 : URL resolution -----------------------------------------------

def test_gate3_url_resolution(members):
    for mid, m in members.items():
        assert m["tbdb_url"] or m["ncbi_url"], f"{mid} resolves to no URL"
    # On the real data every member has a unique_name -> a tbdb_url.
    assert all(m["tbdb_url"] for m in members.values())


# --- Gate #4 / #5 : sequence presence + leader length -----------------------

def test_gate4_nonempty(members):
    for mid, m in members.items():
        assert m["fasta_sequence"], f"{mid} empty fasta_sequence"
        assert m["structure"], f"{mid} empty structure"


def test_gate5_leader_length(members):
    for mid, m in members.items():
        a, b = m["coords"]["leader"]
        assert len(m["fasta_sequence"]) == abs(b - a) + 1, mid


# --- Gate #7 : every structure balanced -------------------------------------

def test_gate7_balanced_structures(members):
    for mid, m in members.items():
        assert is_balanced(m["structure"]), f"{mid} structure not balanced"
        for col in ("whole_antiterm_structure", "term_structure"):
            if m[col] is not None:
                assert is_balanced(m[col]), f"{mid} {col} not balanced"


def test_structure_has_no_wuss_marks(members):
    # The Stem-I structure was converted WUSS -> dot-bracket in the build.
    for mid, m in members.items():
        assert set(m["structure"]) <= set("()."), f"{mid} has un-converted WUSS"


# --- Gate #8 : golden CP045927 ----------------------------------------------

def test_gate8_golden(loci, members):
    golden = next(lo for lo in loci["loci"] if lo["accession"] == "CP045927")
    assert golden["tandem_id"] == "T0342"
    ms = [members[mid] for mid in golden["member_ids"]]
    aas = [m["specifier"]["aa"] for m in ms]
    names = [m["unique_name"] for m in ms]
    assert set(aas) == {"VAL", "TRP"}
    assert aas == ["TRP", "VAL"]                # transcript-5' order
    assert names == ["GYROCCC", "AWVAOC5"]      # distinct
    assert len(set(names)) == 2


# --- Gate #9 : identity pairs ------------------------------------------------

def test_gate9_identity_pairs(loci, identity, members):
    import math
    expected = sum(math.comb(lo["n_cores"], 2) for lo in loci["loci"])
    assert len(identity) == expected == N_PAIRS
    for p in identity:
        assert p["a"].split(".")[0] == p["b"].split(".")[0]   # intra-locus
        assert p["a"] in members and p["b"] in members
        assert 0.0 <= p["identity"] <= 100.0


def test_mean_pairwise_identity_backfilled(loci):
    # The S0.4 null placeholder must be backfilled (non-null) in every locus.
    assert all(lo["mean_pairwise_identity"] is not None for lo in loci["loci"])


def test_collapse_recovered_pairs_saturate_at_100(identity):
    # Exactly the 44 collapse-recovered loci have leaders that share one window ->
    # their single pair is 100.0 (PLAN S0.5 note; drift guard). A change here means
    # the collapse set drifted.
    assert sum(1 for p in identity if p["identity"] == 100.0) == 44


# --- Gate #10 : tree_input.fasta == the gate over members.json --------------

def test_gate10_tree_input_matches_partition(members):
    main_ids, fallback_ids = bj.partition_for_tree(members)
    assert len(main_ids) == N_MAIN_TIPS
    assert len(fallback_ids) == N_FALLBACK
    records = bj._read_fasta(DATA / "tree_input.fasta")
    headers = [h for h, _ in records]
    # Every header is the gated member's unique_name, in order (gate #10).
    assert headers == [members[mid]["unique_name"] for mid in main_ids]
    # Every header is a known unique_name.
    known = {m["unique_name"] for m in members.values() if m["unique_name"]}
    assert set(headers) <= known
    # Each record's SEQUENCE body is the member's full leader (catches a stale
    # committed FASTA whose headers still line up but whose bodies drifted).
    assert [s for _, s in records] == [members[mid]["fasta_sequence"] for mid in main_ids]
    # Every main-tree record meets the native Stem-I length gate.
    for mid in main_ids:
        span = bj._native_stemI_span(members[mid])
        assert span is not None and span >= bj.STEMI_MIN_SPAN


def test_fallback_fasta_count(members):
    records = bj._read_fasta(DATA / "antiterm_fallback.fasta")
    assert len(records) == N_FALLBACK


def test_fallback_fasta_content_matches_members(members):
    # Re-derive the fallback FASTA from members.json exactly as write_tree_fastas
    # does (header = unique_name or member_id, body = antiterminator-core slice) and
    # assert the committed file matches record-for-record. This gives _antiterm_core
    # real coverage over all 102 fallback members and catches a stale fallback FASTA.
    _main_ids, fallback_ids = bj.partition_for_tree(members)
    expected = []
    for mid in fallback_ids:
        core = bj._antiterm_core(members[mid])
        assert core, f"{mid} fallback member has no antiterminator core"
        expected.append((members[mid]["unique_name"] or mid, core))
    assert bj._read_fasta(DATA / "antiterm_fallback.fasta") == expected


def test_tree_input_record_count(members):
    records = bj._read_fasta(DATA / "tree_input.fasta")
    assert len(records) == N_MAIN_TIPS
    # No duplicate headers (unique_name keys the tree tips, PLAN section 6).
    headers = [h for h, _ in records]
    assert len(headers) == len(set(headers))


# --- summary.json reconciles with PLAN section 3.1 facts --------------------

def test_summary_counts(summary):
    c = summary["counts"]
    assert c["loci"] == N_LOCI
    assert c["members"] == N_MEMBERS
    assert c["intra_locus_pairs"] == N_PAIRS
    assert (c["pairs"], c["triples"]) == (461, 9)
    assert c["non_firmicutes"] == 16


def test_summary_confidence_and_agreement(summary):
    assert summary["confidence"] == {"high": 394, "low": 76}
    assert summary["specifier_agreement"] == {"same": 428, "mixed": 42}


def test_summary_specifier_bar_order(summary):
    # PLAN section 9 (2) bar order: TRP, THR, MET, LEU, HIS, TYR, ILE, ?, ARG, ...
    spec = [d["value"] for d in summary["distributions"]["specifier"]]
    assert spec[:7] == ["TRP", "THR", "MET", "LEU", "HIS", "TYR", "ILE"]


def test_loci_facets_specifier_frequency_order(loci):
    # facets.specifier is frequency-descending, == the summary bar order.
    spec = loci["facets"]["specifier"]
    assert spec[:5] == ["TRP", "THR", "MET", "LEU", "HIS"]


# --- SB.4 tree artifacts (committed; Pages-served) --------------------------

@pytest.fixture(scope="module")
def tree_tips():
    return json.loads((DATA / "tree_tips.json").read_text())


@pytest.fixture(scope="module")
def tree_locus_map():
    return json.loads((DATA / "tree_locus_map.json").read_text())


def test_tree_artifacts_present():
    for name in ("tree.nwk", "tree_fallback.nwk", "tree_tips.json", "tree_locus_map.json"):
        assert (DATA / name).exists(), f"missing tree artifact: {name}"


def test_tree_tips_cover_all_members(tree_tips, members):
    # One tip per canonical member, keyed by unique_name; tree distribution matches
    # the S0.6 length-gate (PLAN section 6, gate #10). 0 absent on the real data.
    from collections import Counter
    assert len(tree_tips) == N_MEMBERS
    assert set(tree_tips) <= {m["unique_name"] for m in members.values()}
    dist = Counter(t["tree"] for t in tree_tips.values())
    assert dist["main"] == N_MAIN_TIPS
    assert dist["fallback"] == N_FALLBACK
    assert dist.get("absent", 0) == 0


def test_tree_nwk_tip_sets_match_partition(members):
    # The committed Newicks' tip sets must equal the length-gate partition (gate #10),
    # re-derived from members.json with the build's own partition_for_tree.
    import build_tree_artifacts as bta
    main_ids, fallback_ids = bj.partition_for_tree(members)
    main_tips = bta.parse_newick_tips((DATA / "tree.nwk").read_text())
    fb_tips = bta.parse_newick_tips((DATA / "tree_fallback.nwk").read_text())
    assert main_tips == {members[mid]["unique_name"] for mid in main_ids}
    assert fb_tips == {members[mid]["unique_name"] or mid for mid in fallback_ids}
    assert len(main_tips) == N_MAIN_TIPS and len(fb_tips) == N_FALLBACK


def test_tree_locus_map(tree_locus_map, tree_tips):
    assert len(tree_locus_map) == N_LOCI
    # Every member that lives in a tree is mapped exactly once under its locus.
    assert sum(len(v) for v in tree_locus_map.values()) == N_MAIN_TIPS + N_FALLBACK
    for tid, unames in tree_locus_map.items():
        for u in unames:
            assert u in tree_tips and tree_tips[u]["tandem_id"] == tid


def test_tree_golden(tree_tips, tree_locus_map):
    g, a = tree_tips["GYROCCC"], tree_tips["AWVAOC5"]
    assert (g["tree"], g["specifier"], g["tandem_id"], g["ordinal"]) == ("main", "TRP", "T0342", 1)
    assert (a["tree"], a["specifier"], a["tandem_id"], a["ordinal"]) == ("main", "VAL", "T0342", 2)
    assert tree_locus_map["T0342"] == ["GYROCCC", "AWVAOC5"]
