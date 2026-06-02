# Changelog

All notable changes to **TandemView** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Data pipeline** (`data-pipeline/build_json.py`) — deterministic offline build turning the read-only TBDB sources into the committed static artifacts: **470 loci · 949 canonical members · 488 intra-locus identity pairs**. Member resolution with the 60-bp core collapse, transcript-5′ ordinals, per-column WUSS→dot-bracket structure conversion, the two-tier (EC → regex) `func_class` classifier, the Stem-I length-gate, and `tree_input.fasta` emission. Locked behind 10 validation gates + golden tests.
- **Sequence-derived similarity tree** — built on the lab cluster (full-leader `cmalign` → RF00230 → Stem-I column slice → FastTree, midpoint-rooted for layout only): `tree.nwk`, `tree_fallback.nwk`, `tree_tips.json`, `tree_locus_map.json` (**847 main-tree tips / 102 fallback**). An exploratory similarity map, not an ancestral-state reconstruction.
- **App shell** — Vite + Svelte 5 (runes) + Tailwind v4 + TypeScript SPA with hash routing across five routes (Dashboard, Browse, LocusDetail, Tree, About).
- **Design system** — branded identity: `@theme` + `tokens.ts` design tokens, a 20-AA colorblind-aware specifier palette kept provably disjoint from the chrome palette, self-hosted Inter + JetBrains Mono, and base components (Kpi, FacetChip, Badge, Spinner, TbdbLink, NoPolarityBanner, Card, Button).
- **Data layer + cross-filter store** — typed staged loading (`loci`/`summary` on boot, `members` in parallel, `identity`/tree lazy) and a single in-memory `$state` filter store with `$derived` selection across every facet (no crossfilter.js).
- **Faceted table** (Tabulator 6) — all 470 loci with sort, multi-facet filter, free-text search, and CSV export, plus the dashboard KPI strip.
- **Specificity views** — locus-level specifier-AA bar chart + a symmetric element-pair matrix (preserving the ILE×LEU branched-chain cluster) with click cross-filtering, and a bare per-locus detail page with tbdb.io / NCBI deep-links.
- **Tests** — the Python build-gate + artifact-integrity suite (`pytest`) and the Phase-1 frontend unit + component suite (Vitest + Testing Library).
- **CI/CD** — GitHub Actions CI (`data` + `web` jobs) and a Pages deploy workflow, with Dependabot and CodeRabbit configuration.
