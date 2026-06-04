<script lang="ts">
  // Specifier × phylum heatmap (PLAN §9, §7.5) — a locus-level count grid of
  // `specifier_aa` (x) × `phylum` (y). Cells use the SEPARATE neutral phylum ramp,
  // NOT the 20-AA specifier palette (§8.2): phylum is the near-monochrome context
  // axis (454/470 Firmicutes), so the cells are a quiet chrome magnitude scale and
  // the 16 non-Firmicutes outliers are the signal. The grid renders from the
  // cross-filtered selection so it narrows live (S2.6), and clicking a cell sets
  // the specifier + phylum facets on the one shared store (§7.3). Plotly is
  // dynamically import()-ed so it never enters the boot bundle (§7.1).
  import { onMount } from 'svelte'
  import type {
    PlotData,
    PlotMouseEvent,
    PlotlyHTMLElement,
    PlotlyStatic,
  } from 'plotly.js-dist-min'

  import { store } from '../stores/filters.svelte'
  import { PHYLUM_COUNT_RAMP } from '../color'
  import { brand, fontFamily, neutral } from '../design/tokens'
  import { fitOnResize } from '../plotly'
  import {
    buildSpecPhylumHeatmap,
    PHYLUM_UNASSIGNED,
    type SpecPhylumGrid,
  } from '../specPhylum'
  import Card from './Card.svelte'
  import Spinner from './Spinner.svelte'

  // Axes from the FULL locus set (stable layout); z counts from the cross-filtered
  // selection (narrows live). Boots with loci.json — needs no members.json.
  const grid = $derived<SpecPhylumGrid | null>(
    store.status === 'ready' ? buildSpecPhylumHeatmap(store.loci, store.selected) : null,
  )

  // ── Plotly (dynamically imported; §7.1) ─────────────────────────────────────────
  let plotly = $state<PlotlyStatic | null>(null)
  let el: HTMLDivElement
  let bound = false
  // No `responsive: true` — its window 'resize' listener survives `purge` and leaks
  // per dashboard mount; we refit via fitOnResize() instead (see ../plotly).
  const CONFIG = { displayModeBar: false }

  /** Cross-filter on a cell: set the specifier + phylum facets (toggle to clear).
   *  The `unassigned` row sets only the specifier — a null phylum is not a
   *  selectable facet value — so it clears the phylum facet instead. */
  function selectCell(specifier: string, phylum: string): void {
    const named = phylum !== PHYLUM_UNASSIGNED
    const fs = store.filter.specifier
    const fp = store.filter.phylum
    const specMatch = fs.size === 1 && fs.has(specifier)
    const phyMatch = named ? fp.size === 1 && fp.has(phylum) : fp.size === 0
    if (specMatch && phyMatch) {
      store.clearFacet('specifier')
      if (named) store.clearFacet('phylum')
      return
    }
    store.setFacet('specifier', [specifier])
    if (named) store.setFacet('phylum', [phylum])
    else store.clearFacet('phylum')
  }

  function onClick(ev: PlotMouseEvent): void {
    const p = ev.points?.[0]
    if (!p || p.z == null) return // skip empty cells (no loci)
    if (typeof p.x === 'string' && typeof p.y === 'string') selectCell(p.x, p.y)
  }

  /** Brand-accent outline on cells matching BOTH active facets — the heatmap's own
   *  2D selection. (When only one facet is active the narrowed z already makes the
   *  selection visually obvious, so no outline is drawn.) */
  function selectionShapes(g: SpecPhylumGrid): Record<string, unknown>[] {
    const fs = store.filter.specifier
    const fp = store.filter.phylum
    if (fs.size === 0 || fp.size === 0) return []
    const shapes: Record<string, unknown>[] = []
    for (let i = 0; i < g.phyla.length; i++) {
      if (!fp.has(g.phyla[i])) continue
      for (let j = 0; j < g.specifiers.length; j++) {
        if (!fs.has(g.specifiers[j])) continue
        if (g.z[i][j] == null) continue
        shapes.push({
          type: 'rect',
          xref: 'x',
          yref: 'y',
          x0: j - 0.5,
          x1: j + 0.5,
          y0: i - 0.5,
          y1: i + 0.5,
          line: { color: brand.accent, width: 2 },
          fillcolor: 'rgba(0,0,0,0)',
          layer: 'above',
        })
      }
    }
    return shapes
  }

  // ── Render effect (re-runs on plotly load, selection change, or facet change) ────
  $effect(() => {
    if (!plotly || !el || !grid) return
    const g = grid
    const data: Partial<PlotData>[] = [
      {
        type: 'heatmap',
        x: g.specifiers,
        y: g.phyla,
        z: g.z,
        text: g.text,
        texttemplate: '%{text}',
        textfont: { family: fontFamily.mono, size: 9, color: neutral.ink },
        xgap: 1.5,
        ygap: 1.5,
        colorscale: PHYLUM_COUNT_RAMP,
        zmin: 0,
        zmax: Math.min(g.max, 12),
        showscale: false,
        hoverongaps: false,
        hovertemplate: '%{y} × %{x}: %{z} loci<extra></extra>',
      },
    ]
    const layout = {
      autosize: true,
      margin: { l: 128, r: 8, t: 6, b: 56 },
      font: { family: fontFamily.mono, size: 10, color: neutral.text },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: neutral.surfaceSubtle,
      xaxis: {
        side: 'bottom',
        tickangle: -90,
        tickfont: { family: fontFamily.mono, size: 10 },
        showgrid: false,
        zeroline: false,
        fixedrange: true,
        constrain: 'domain',
      },
      yaxis: {
        autorange: 'reversed',
        tickfont: { family: fontFamily.mono, size: 10 },
        showgrid: false,
        zeroline: false,
        fixedrange: true,
        constrain: 'domain',
      },
      shapes: selectionShapes(g),
    }
    void plotly.react(el, data, layout, CONFIG).then(() => {
      if (!bound) {
        bound = true
        ;(el as unknown as PlotlyHTMLElement).on('plotly_click', onClick)
      }
    })
  })

  onMount(() => {
    let disposed = false
    let teardown: (() => void) | null = null
    void import('plotly.js-dist-min').then((mod) => {
      if (disposed) return
      plotly = mod.default ?? (mod as unknown as PlotlyStatic)
      teardown = fitOnResize(plotly, [el])
    })
    return () => {
      disposed = true
      teardown?.()
    }
  })
</script>

<Card
  title="Specifier × phylum"
  subtitle="Loci by specifier amino acid (the amino acid each T-box senses) and phylum. The dataset is near-monochrome (454/470 Firmicutes) — cells use a neutral grey ramp, so the 16 non-Firmicutes loci stand out. Click a cell to cross-filter."
>
  <div class="relative h-[22rem] w-full">
    <div bind:this={el} class="h-full w-full"></div>
    {#if store.status !== 'ready'}
      <div class="absolute inset-0 grid place-items-center">
        {#if store.status === 'error'}
          <p class="text-small text-muted">Locus data unavailable.</p>
        {:else}
          <Spinner label="Loading loci…" />
        {/if}
      </div>
    {/if}
  </div>
  <p class="mt-2 text-caption text-muted">
    Counts shown in-cell; shade encodes magnitude (capped). Blank = no loci. A semicolon (e.g.
    <span class="font-mono">ILE;LEU</span>) marks a mixed-specifier locus — its elements sense different
    amino acids. The <span class="font-mono">unassigned</span> row holds the 3 loci whose phylum could
    not be assigned (counted among the 16 non-Firmicutes).
  </p>
</Card>
