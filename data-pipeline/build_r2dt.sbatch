#!/bin/bash
# build_r2dt.sbatch -- tbdb.tandem R2DT structure-diagram build (PLAN section 9; Track B).
#
# Draws every canonical T-box element on the RF00230 / T-box template with R2DT
# (https://github.com/r2dt-bio/R2DT), offline on the lab cluster (`two` login node,
# ProxyJump via zero.biochem.northwestern.edu) via SLURM `sbatch`. The job is
# CPU-only and offline; only the resulting RNA-2D-JSON (ingested by build_r2dt.py
# into public/data/r2dt/) enters the repo. Submission is gated on a one-shot
# go-ahead after a resource probe (CLAUDE.md section 5).
#
# ONE-TIME LOGIN-NODE SETUP (not in the batch job, so the run node needs no network):
#   R2DT ships only as a container image and the cluster has NO system
#   singularity/apptainer -- but the node allows unprivileged user namespaces, so a
#   ROOTLESS conda-forge Apptainer runs the image. Once:
#       source ~/miniconda3/etc/profile.d/conda.sh
#       conda create -y -n apptainer -c conda-forge apptainer
#       conda activate apptainer
#       apptainer pull ~/r2dt.sif docker://rnacentral/r2dt:latest   # ~GB; the current R2DT release
#   (The r2dt:2.2 image bundles the template / covariance-model library, so the
#   compute node needs no further downloads.)
#
# DEVIATION from PLAN section 6.1's `--partition=compute` (= node `zero`), carried
# over from build_tree.sbatch (user-approved 2026-06-02 live probe): SLURM
# step-launch on `zero` fails and gpu node `one` is DOWN, so the only runnable node
# is the `gpu`-partition login node `two`. This job is CPU-only and requests NO
# --gres, so it co-tenants politely (probe 2026-06-04: no cryoSPARC, 96 cores idle,
# 230 GB available; this job needs 8c / 32G).
#
# Run-dir inputs (staged before submission):
#   r2dt_input.fasta -- one RNA leader per canonical member (build_r2dt.py fasta)
#   ~/r2dt.sif    -- the R2DT image (pulled once at setup, above)
# Outputs retrieved + ingested by build_r2dt.py ingest:
#   r2dt_out/results/json/<member_id>.json   -- per-element RNA-2D-JSON
#   r2dt_out/results/metadata.tsv            -- matched template per element
#
#SBATCH --job-name=tbdb-tandem-r2dt
#SBATCH --partition=gpu              # node `two` (see DEVIATION note); CPU-only, NO --gres
#SBATCH --nodelist=two               # `compute`/`zero` step-launch broken; `one` DOWN
#SBATCH --cpus-per-task=8 --mem=32G --time=08:00:00
#SBATCH --output=r2dt_%j.log
set -euo pipefail
source ~/miniconda3/etc/profile.d/conda.sh && conda activate apptainer
# R2DT auto-classifies each T-box leader to the RF00230 template and draws it there
# (the canonical, reproducible layout). --bind the run dir so the container reads the
# FASTA and writes results back to the host filesystem.
RUNDIR="$(pwd)"
rm -rf "${RUNDIR}/r2dt_out"
apptainer exec --bind "${RUNDIR}:${RUNDIR}" ~/r2dt.sif \
  r2dt.py draw "${RUNDIR}/r2dt_input.fasta" "${RUNDIR}/r2dt_out"
echo "R2DT done; $(ls "${RUNDIR}/r2dt_out/results/json" 2>/dev/null | wc -l) JSON diagrams written."
