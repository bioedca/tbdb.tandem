# data-pipeline

The offline build that turns the two read-only TBDB source files into the static
JSON the tbdb.tandem SPA loads, plus the `tree_input.fasta` the cluster tree build
consumes. This is the **single source of truth** for member resolution and field
provenance (PLAN §4, §5).

```
SOURCE (read-only, outside the repo)            COMMITTED ARTIFACTS          APP
  ../tandem_tbox_FINAL.tsv      ── build_json ─▶  public/data/*.json      ─▶ Svelte SPA
  ../tboxdb-master/Master_tboxes.csv (92 MB)      public/data/tree_input.fasta
                                                          │
                                  build_tree.sbatch (cluster, parallel track)
                                                          ▼
                                     tree.nwk · tree_fallback.nwk · tree_tips.json · tree_locus_map.json
```

The 92 MB `Master_tboxes.csv` is **never** copied into the repo — it is read in
place from `../tboxdb-master/` (PLAN §3, §11.1). Only the small derived artifacts
under `public/data/` are committed.

## Requirements

- **Python 3.12+** (CI pins 3.12; see `.github/workflows/ci.yml`).
- Dependencies pinned in [`requirements.txt`](./requirements.txt): `pandas==3.0.0`,
  `biopython==1.85` (pairwise %-identity), `numpy` (PCoA for `build_cloud.py`), and
  `pytest` (test runner).

## Setup

```bash
# from the repo root (use any Python 3.12+ interpreter)
python3 -m venv data-pipeline/.venv
source data-pipeline/.venv/bin/activate
pip install -r data-pipeline/requirements.txt
```

`.venv/` is gitignored.

## Run the data build

`build_json.py` (lands across S0.3–S0.6) reads the two sources and writes
`summary.json`, `loci.json`, `members.json`, `identity.json`, `members.csv`
(the member-level base table — every per-member field plus the component-stem
colour spans flattened into columns), and `tree_input.fasta` to `public/data/`:

```bash
python3 data-pipeline/build_json.py \
  --master ../tboxdb-master/Master_tboxes.csv \
  --tandem ../tandem_tbox_FINAL.tsv \
  --out public/data
```

The build aborts non-zero on any validation gate failure (PLAN §5.4) and prints
the main-tree tip count emitted for the length-gated `tree_input.fasta`.

## Run the cluster tree build

The similarity tree is built on the lab cluster as a parallel track (PLAN §6,
§6.1). One-time login-node setup (user miniconda env `phylo`):

```bash
# install Infernal + FastTree + MAFFT + gotree, then fetch the RF00230 CM
cmfetch Rfam.cm RF00230 > tbox_RF00230.cm     # redirect is mandatory; name must match the sbatch
```

Then submit the batch job (gated on a resource probe + one-shot go-ahead —
see CLAUDE.md §5), which aligns the full leader to RF00230, slices the Stem-I
consensus columns, and infers the tree with FastTree:

```bash
ssh two sbatch data-pipeline/build_tree.sbatch   # poll with squeue / sacct
```

`build_tree.sbatch` and the post-processing script land in Track B (SB.1+).

## Build the 3D similarity cloud (`/cloud`)

`build_cloud.py` turns the **already-committed** trees + metadata into
`public/data/cloud.json`, the single artifact the lazy `/cloud` route renders. It
reads `tree.nwk` / `tree_fallback.nwk`, computes each tree's patristic distance
matrix with a small pure-Python parser + per-leaf walk (no `dendropy` — the matrix
is rooting-independent, so no ancestry is read), embeds it in 3D by classical MDS /
PCoA (`numpy`), and joins each leaf to its per-element / per-locus metadata:

```bash
python3 data-pipeline/build_cloud.py --out public/data   # defaults read public/data/*
```

The embedding is byte-deterministic (each eigenvector axis's sign is fixed so the
largest-magnitude coordinate is positive); only `meta.generated` is wall-clock —
pass `--generated <iso8601>` for a byte-exact rebuild. The 3 PCoA axes capture ~41%
of the main tree's pairwise distance (a flat 2D layout: ~32%); the `/cloud` view
surfaces that caveat. Run **after** the data build + tree artifacts exist.

## Build the R2DT structure diagrams

The locus detail page renders each element's RNA 2° structure with **R2DT** on the
canonical RF00230 / T-box template (alongside the fornac force layout). R2DT is a
heavyweight templated pipeline (Infernal + a covariance-model template library)
that can't run in the browser, so — like the tree — the diagrams are generated
offline once and committed under `public/data/r2dt/`. `build_r2dt.py` has two
stages, decoupled by the (offline) R2DT run itself:

```bash
# 1. emit the input FASTA (one RNA leader per member; auto-classifies to RF00230)
python3 data-pipeline/build_r2dt.py fasta --out /tmp/r2dt_input.fasta

# 2. run R2DT however is available — the EMBL-EBI R2DT web service, local Docker,
#    or the cluster (Singularity/Apptainer), e.g. Docker (image rnacentral/r2dt):
#    docker run -v /tmp:/work rnacentral/r2dt r2dt.py draw /work/r2dt_input.fasta /work/r2dt_out

# 3. ingest R2DT's RNA-2D-JSON output -> compact committed assets + manifest
python3 data-pipeline/build_r2dt.py ingest \
  --results /tmp/r2dt_out/results/json \
  --metadata /tmp/r2dt_out/results/metadata.tsv \
  --out public/data/r2dt
```

`ingest` writes one compact `<member_id>.json` (per-nucleotide coordinates + base
pairs) plus `manifest.json`, and **skips** any diagram whose sequence does not
match its member's `fasta_sequence` (which would misalign the stem coloring) — so
only elements R2DT draws faithfully on the full leader are committed (800 of 949;
the degenerate or R2DT-clipped leaders fall back to the fornac viewer). The app
colors each nucleotide client-side from `src/lib/color.ts`, not in the assets.

> The published assets were generated via the EMBL-EBI R2DT REST service (the lab
> cluster runs Ubuntu 24.04, which blocks rootless Apptainer; the `build_r2dt.sbatch`
> job is kept for clusters that allow it).

## Run the tests

The pipeline test suite (PLAN §10.1) runs from this directory:

```bash
cd data-pipeline && pytest            # or, from the repo root:  pytest data-pipeline
```

- `tests/test_wuss.py` — WUSS→dot-bracket converter golden + balance tests.
- `tests/test_build.py` — build gates 1–10 + golden values on a fixture subset (S0.7).
- `tests/test_artifacts.py` — integrity checks over the committed `public/data/*.json` + `members.csv` (S0.7).
- `tests/test_build_r2dt.py` — R2DT compact extraction + ingest (sequence-match guard, manifest).
- `tests/test_build_cloud.py` — PCoA embedding on a fixture tree (patristic ordering, deterministic sign convention, k-NN dedup) + committed `cloud.json` integrity.
