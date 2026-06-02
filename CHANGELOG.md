# Changelog

All notable changes to **TandemView** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Tandem-architecture diagram** (`ArchitectureDiagram`) — the signature view: a to-scale, biological-5′→3′ locus track rendering per element the T-box body (tinted by its own specifier, so mixed loci read two-tone), Stem-I with a notched terminal loop, the specifier-codon tick + amino-acid code, the antiterminator outline, the terminator hairpin (a schematic anti-SD sequestrator for translational elements), and the discriminator — plus dashed inter-element spacers labelled with their bp gap, strand chevrons, a scale bar, and a function-class-tagged downstream-ORF block arrow. Hand-rolled SVG with D3 supplying only the linear position scale.
- **Element-comparison panel** (`ElementComparison`) — per-element specifier/codon, tRNA family, ΔΔG and terminator-energy as in-cell bars, completeness dots, and tbdb.io / NCBI deep-links, with the intra-locus pairwise %-identity (from `identity.json`); collapse-recovered shared-leader loci are flagged where their leader identity saturates at 100%.
- **Full per-locus detail page** (`/locus/:id`) — wires the complete detail flow from the in-memory members map with no per-locus network call: the tandem-architecture diagram, the element-comparison panel, and **feature-highlighted member sequences** (`MemberSequence`) that render each element's gap-free leader with its Stem-I, specifier-codon, antiterminator, terminator, and discriminator spans highlighted (specifier-tinted fill for the Stem-I/codon, neutral chrome rules for the regulatory features). Intra-locus identity loads lazily and degrades gracefully when unavailable.
- **In-app RNA secondary structure** (`RnaStructure`) on the detail page — a best-effort [fornac](https://github.com/pkerpedjiev/fornac) render of each element's whole-leader antiterminator fold, one tab per element, with the tbdb.io VARNA structure view always offered per element as the guaranteed deep-link. The legacy fornac UMD loads lazily as a classic `<script>` (kept off the boot path and out of ESM strict mode); its injected global `svg` styles and its otherwise-permanent window resize listener are both neutralized so they cannot affect the rest of the app. Honors `prefers-reduced-motion`.

## [0.1.0] - 2026-06-02

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

[Unreleased]: https://github.com/bioedca/tandem-tbox-explorer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bioedca/tandem-tbox-explorer/releases/tag/v0.1.0
