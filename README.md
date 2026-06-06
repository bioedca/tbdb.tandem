# tbdb.tandem

A static web app for exploring **tandem T-box riboswitch loci** — a companion to [tbdb.io](https://tbdb.io).

Browse, facet, and visualize the **470 tandem loci** derived from the TBDB master table: tandem-element architecture, specificity pairing (incl. the mixed-specifier `ILE;LEU` cluster), regulated-operon coupling, and a sequence-derived similarity tree. Each element deep-links to its canonical tbdb.io entry.

Once built, the app lives at **https://bioedca.github.io/tbdb.tandem/** — one URL, no install.

> **Status:** In active development. See `CHANGELOG.md` for milestone history.

## Layout (planned)
- `data-pipeline/` — offline Python build: `tandem_tbox_FINAL.tsv` + `Master_tboxes.csv` → static JSON in `public/data/`.
- `src/` — Vite + Svelte 5 + Tailwind frontend.
- `public/data/` — baked JSON artifacts the app loads (~330 KB gzipped total).

## Data sources (read-only inputs)
- `../tandem_tbox_FINAL.tsv` — 470 tandem loci.
- `../tboxdb-master/Master_tboxes.csv` — full TBDB.

## Provenance
Built on TBDB (Marchand et al. 2021, *NAR* 49(D1):D229–D235, [`doi:10.1093/nar/gkaa721`](https://doi.org/10.1093/nar/gkaa721)). The tandem set was derived and independently verified; the sequence-derived tree is an **exploratory similarity map, not an ancestral-state reconstruction**.

For the T-box mechanism and the tandem (historically "double" / "partially double") T-box arrangement, see the two foundational comparative-genomics analyses:
- Vitreschak, Mironov, Lyubetsky & Gelfand (2008). *Comparative genomic analysis of T-box regulatory systems in bacteria.* RNA 14(4):717–735. [`doi:10.1261/rna.819308`](https://doi.org/10.1261/rna.819308)
- Gutiérrez-Preciado, Henkin, Grundy, Yanofsky & Merino (2009). *Biochemical features and functional implications of the RNA-based T-box regulatory mechanism.* MMBR 73(1):36–61. [`doi:10.1128/MMBR.00026-08`](https://doi.org/10.1128/MMBR.00026-08)

## License
Code: **MIT** (see `LICENSE`). Data: TBDB is **CC-BY** — cited and attributed in-app.
