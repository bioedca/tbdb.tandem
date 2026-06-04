#!/bin/bash
# build_tree.sbatch -- tbdb.tandem similarity-tree build (PLAN section 6, 6.1; Track B).
#
# Runs on the lab cluster (`two` login node, ProxyJump via zero.biochem.northwestern.edu)
# via SLURM `sbatch`. The job is small, CPU-only, and offline -- the toolchain + RF00230
# CM are installed once on the login node at SB.2, so the run node needs no network.
# Submission is gated on a one-shot go-ahead after a resource probe (PLAN section 6.1;
# STEPS SB.3; CLAUDE.md section 5).
#
# DEVIATION from PLAN section 6.1's locked `--partition=compute` (= node `zero`),
# user-approved 2026-06-02 after a live probe: SLURM step-launch on `zero` fails
# ("Communication connection failure" -- architecturally off-limits, see the SSH memory),
# and the alternate gpu node `one` is DOWN. The only runnable node today is the `gpu`-
# partition login node `two`; this job is CPU-only and requests NO --gres, so it co-tenants
# politely (probe: no cryoSPARC, 32 idle cores, 177 GB free; needs 8c/16G).
#
# HARD CONSTRAINT (PLAN section 6): this is an exploratory *similarity map*, not an
# ancestral-state instrument. The midpoint root is stored for STABLE LAYOUT ONLY; the app
# displays the tree UNROOTED (radial). No polarity is read from tips.
#
# Run-dir inputs (staged by SB.3 before submission):
#   tree_input.fasta        -- 847 gated main-tree leaders   (S0.6 build output)
#   antiterm_fallback.fasta -- 102 antiterminator-core slices (S0.6 build output)
#   slice_stemI_columns.py  -- the Stem-I column slicer        (S0.6)
#   tbox_RF00230.cm          -- RF00230 Infernal CM             (fetched at SB.2)
# Outputs retrieved by SB.3 / consumed by build_tree_artifacts.py at SB.4:
#   tree_elements.nwk, tree_elements.midpoint.nwk, tree_fallback.nwk, tree_%j.log
#
#SBATCH --job-name=tbdb-tandem-tree
#SBATCH --partition=gpu              # node `two` (see DEVIATION note above); CPU-only, NO --gres
#SBATCH --nodelist=two               # `compute`/`zero` step-launch broken; `one` DOWN (2026-06-02)
#SBATCH --cpus-per-task=8 --mem=16G --time=01:00:00
#SBATCH --output=tree_%j.log
set -euo pipefail
source ~/miniconda3/etc/profile.d/conda.sh && conda activate phylo
# --- main Stem-I tree: full-leader align to RF00230 (default trunc), then slice Stem-I consensus columns ---
cmalign --cpu "${SLURM_CPUS_PER_TASK}" -o leaders.sto tbox_RF00230.cm tree_input.fasta
esl-reformat afa leaders.sto > leaders.afa
# `esl-reformat afa` STRIPS the #=GC SS_cons that cmalign wrote into leaders.sto, so the
# slice "over the RF00230 SS_cons map" has nothing to slice on if handed only the afa.
# --ss-cons leaders.sto restores it (user-approved reconciliation of the PLAN section 6.1
# snippet, 2026-06-02; see PROGRESS.md S0.6). slice_stemI_columns.py uses the afa for the
# aligned residues and leaders.sto for SS_cons (their column counts match).
python slice_stemI_columns.py leaders.afa --ss-cons leaders.sto > stemI.afa   # extract Stem-I consensus columns (RF00230 SS_cons map)
FastTree -nt -gtr -gamma -pseudo -seed 12345 stemI.afa > tree_elements.nwk
gotree reroot midpoint -i tree_elements.nwk -o tree_elements.midpoint.nwk   # stable layout only
# --- separate antiterminator-core fallback tree (length-gated / Stem-I-less elements) ---
mafft --globalpair --maxiterate 1000 antiterm_fallback.fasta > antiterm.afa
FastTree -nt -gtr -gamma -pseudo -seed 12345 antiterm.afa > tree_fallback.nwk
