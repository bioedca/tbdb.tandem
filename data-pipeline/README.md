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
  `biopython==1.85` (pairwise %-identity), and `pytest` (test runner).

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

## Run the tests

The pipeline test suite (PLAN §10.1) runs from this directory:

```bash
cd data-pipeline && pytest            # or, from the repo root:  pytest data-pipeline
```

- `tests/test_wuss.py` — WUSS→dot-bracket converter golden + balance tests.
- `tests/test_build.py` — build gates 1–10 + golden values on a fixture subset (S0.7).
- `tests/test_artifacts.py` — integrity checks over the committed `public/data/*.json` (S0.7).
