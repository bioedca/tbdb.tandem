# The 3D similarity cloud (`/cloud`)

A WebGL companion to the 2D similarity map (`/tree`) that renders the **same** Stem I
sequence-similarity relationships of the tandem T-box loci as an interactive 3D point
cloud. Like `/tree` it is an **exploratory, unrooted** view — **no polarity, no
ancestry**: a point's position means "this sequence resembles its neighbours," never a
lineage or an order of appearance. It is a **navigation / hypothesis-spotting
instrument, never a measurement instrument**; the locus detail pages remain the source
of truth.

## Why it exists

The 2D layout is lossy and crowded. The patristic-distance structure of the main Stem I
tree is genuinely high-dimensional: a flat 2D embedding preserves only **~32 %** of the
pairwise distance, while a 3D embedding recovers **~41 %**. The dense Firmicutes core is
an unreadable hairball *because* it is not flat. (The shorter antiterminator "fallback"
tree is much flatter: ~75 % in 2D, ~84 % in 3D.) The cloud also surfaces the per-locus /
per-element metadata the 2D map discards (`func_class`, `type`, `confidence`, ΔΔG,
identity, `same_specifier`, …) as vetted color/size presets.

## The embedding (build time)

`data-pipeline/build_cloud.py` reads the already-committed trees + metadata and emits
`public/data/cloud.json` (computed offline so the client only draws):

1. **Patristic distance matrix `D`** per tree — the sum of branch lengths on the path
   between each leaf pair. Computed with a small, dependency-free Newick parser + a
   per-leaf tree walk (the spec sketched `dendropy`; the repo convention is a minimal,
   pure, unit-tested pipeline, so no new dependency is added). Patristic distance is
   **rooting-independent**, so the midpoint root in `tree.nwk` is never read as a root.
2. **Classical MDS / PCoA**: `D2 = D²`; double-centre `B = −½ · J D2 J`
   (`J = I − 11ᵀ/n`); eigendecompose the symmetric `B`; coordinates
   `C = V[:,:3] · √|λ[:3]|`, scaled so `max(|C|) = 100`.
3. **Deterministic sign convention**: eigenvectors are sign-ambiguous, so each axis's
   sign is fixed (its largest-magnitude coordinate is made positive). The embedding
   (`var` / `points` / `edges`) is therefore **byte-stable** across runs — the committed
   file regenerates identically. Only `meta.generated` is wall-clock (`--generated`
   pins it).
4. **Variance ratios** `var = (λ / Σλ₊)[:6]` drive the honest readout (3 axes ≈ 41 %).
5. **k-NN "constellation" edges**: each leaf's `k = 2` nearest by patristic distance,
   deduplicated + undirected (~1.2 k edges for the main tree).

## The spread transform (run time)

The honest tension: you **cannot** simultaneously (a) de-overlap the crowded core and
(b) preserve metric distance — overlap of near-identical sequences *is* the data. The
resolution is an **anchored-repulsion "spread"** (`src/lib/cloud/relax.ts`): each point
feels a short-range repulsion from its neighbours (de-piles the core, evaluated through a
uniform spatial hash — never an O(n²) scan) plus a spring toward its fixed PCoA anchor
(keeps the map anchored to truth). It is:

- **fully reversible** — at `spread = 0` the cloud returns *exactly* to the PCoA
  positions;
- **monotone** — mean pairwise distance only grows as spread grows (it de-crowds);
- **bounded** — no point runs away from its anchor;
- **topology-preserving** — at full spread a point's nearest neighbours still belong to
  the same cluster, so the de-piled view shows the *same* neighbourhoods (note: strict
  k-NN *set identity* among near-coincident points is noise any de-pile reshuffles;
  cluster co-membership is what navigation actually relies on, and it is what the
  `relax.test.ts` invariant asserts).

Every distortion is surfaced in the UI: a persistent readout reports how much pairwise
distance the 3 axes capture; once spread > 0 a warning shows the **mean offset** from
true position and tells the reader to set spread to 0 for true distances.

## Pure, tested modules

All point logic lives in framework-agnostic, unit-tested modules (mirroring how
`tree.ts` stays pure) — the component only wires them to WebGL + the DOM:

- `cloud/relax.ts` — the anchored-repulsion stepper (the invariants above).
- `cloud/encodings.ts` — `pointColor` / `sizeFactor` + the five presets.
- `cloud/aggregate.ts` — element ↔ locus centroid collapse + click semantics.
- `cloud/orbit.ts` — the spherical orbit-camera math (no external `OrbitControls`).

`three` is dynamically `import()`-ed (it never enters the boot bundle), and `cloud.json`
is lazy-fetched through the shared store (`ensureCloud`), so the dashboard's first paint
pays nothing for the cloud.
