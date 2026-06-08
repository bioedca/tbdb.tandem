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
  import { fitOnResize, widthTier } from '../plotly'
  import { observeElementSize } from '../responsive'
  import { graphPrimitiveScale, scalePx } from '../text/graphScale'
  import { naturalWidthPx, truncateToWidth } from '../text/measure'
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
  // Live container size (debounced) so the render effect can adapt margins, font,
  // cell gaps, and phylum-label truncation to the available space (responsive).
  let containerSize = $state({ w: 0, h: 0 })

  // Floor cell size (px) so cells stay legible/tappable on a phone (§4.3). Below the
  // resulting min-width the plot scrolls horizontally instead of squeezing ~25 specifier
  // columns into 360px.
  const MIN_CELL_PX = 16
  // Reflow-free scroll min-width derived from the data + the MEASURED widest phylum label
  // (pretext) rather than a magic constant, so it tracks the real font/dataset: enough room
  // for the y-axis label reserve plus a legible cell per specifier column. On desktop the
  // container is wider than this, so it never binds (no scroll); on a phone it engages.
  const heatmapMinW = $derived.by<number>(() => {
    const g = grid
    if (!g) return 0
    const scale = graphPrimitiveScale(
      containerSize.w || 600,
      containerSize.h || 320,
      `400 10px ${fontFamily.mono}`,
      { targetChars: 78, referenceWidth: 720, referenceHeight: 340, maxScale: 1.5 },
    )
    const minCellPx = scalePx(MIN_CELL_PX, scale, { min: MIN_CELL_PX, max: 24, precision: 0 })
    const labelPx = scalePx(10, scale, { min: 10, max: 15 })
    const labelFont = `${labelPx}px ${fontFamily.mono}`
    let labelMax = 0
    for (const p of g.phyla) labelMax = Math.max(labelMax, naturalWidthPx(p, labelFont))
    const marginL = Math.min(
      labelMax + scalePx(10, scale, { min: 10, max: 16 }),
      scalePx(128, scale, { min: 128, max: 190 }),
    )
    return Math.round(marginL + g.specifiers.length * minCellPx + scalePx(16, scale, { min: 16, max: 28 }))
  })

  // ── Plotly (dynamically imported; §7.1) ─────────────────────────────────────────
  let plotly = $state<PlotlyStatic | null>(null)
  let el: HTMLDivElement
  let scrollWrap: HTMLDivElement
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
  function selectionShapes(g: SpecPhylumGrid, lineWidth = 2): Record<string, unknown>[] {
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
          line: { color: brand.accent, width: lineWidth },
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
    // Adapt left margin, fonts, and phylum-label truncation to the container width
    // (responsive). On phones the long phylum names are truncated with pretext (no
    // mid-word cut) and the freed margin gives the cells more room; the full names
    // stay on the y data, so hover + cross-filter still read the real phylum.
    void containerSize.w
    void containerSize.h
    const w = containerSize.w || el.clientWidth || 600
    const h = containerSize.h || el.clientHeight || 320
    const tier = widthTier(w)
    const scale = graphPrimitiveScale(w, h, `400 10px ${fontFamily.mono}`, {
      targetChars: 78,
      referenceWidth: 720,
      referenceHeight: 340,
      maxScale: 1.5,
    })
    const tickPx = scalePx(tier === 'sm' ? 9 : 10, scale, { min: tier === 'sm' ? 9 : 10, max: 15 })
    const cellPx = scalePx(tier === 'sm' ? 8 : 9, scale, { min: tier === 'sm' ? 8 : 9, max: 14 })
    const gapPx = scalePx(1.5, scale, { min: 1.2, max: 2.8 })
    const outlinePx = scalePx(2, scale, { min: 1.5, max: 3.2 })
    const labelFont = `${tickPx}px ${fontFamily.mono}`
    const capLBase = tier === 'sm' ? 70 : tier === 'md' ? 104 : 128
    const capL = scalePx(capLBase, scale, { min: capLBase, max: 190 })
    let labelMax = 0
    for (const p of g.phyla) labelMax = Math.max(labelMax, naturalWidthPx(p, labelFont))
    // Desktop keeps the original fixed margin (deliberate design); only phone/tablet
    // tighten it to the measured label width to reclaim cell space.
    const marginL =
      tier === 'lg'
        ? scalePx(128, scale, { min: 128, max: 190 })
        : Math.round(Math.min(labelMax + scalePx(10, scale, { min: 10, max: 16 }), capL))
    // The x labels are rotated -90, so the bottom margin (not the width) bounds their
    // length; keep it full so composite specifiers (e.g. ARG;VAL) aren't clipped. At
    // phone widths the ~25 specifier columns are inherently dense — the cells, in-cell
    // counts, and hover carry the data there; the y-axis truncation below is the win.
    const marginB = scalePx(56, scale, { min: 52, max: 86 })
    const yTickVals = g.phyla.map((_, i) => i)
    const yTickText = g.phyla.map((p) => truncateToWidth(p, labelFont, capL - 12))
    const data: Partial<PlotData>[] = [
      {
        type: 'heatmap',
        x: g.specifiers,
        y: g.phyla,
        z: g.z,
        text: g.text,
        texttemplate: '%{text}',
        textfont: { family: fontFamily.mono, size: cellPx, color: neutral.ink },
        xgap: gapPx,
        ygap: gapPx,
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
      // Responsive margin/font (this branch) + solid white chart backgrounds (#27).
      margin: {
        l: marginL,
        r: scalePx(8, scale, { min: 8, max: 16 }),
        t: scalePx(6, scale, { min: 6, max: 12 }),
        b: marginB,
      },
      font: { family: fontFamily.mono, size: tickPx, color: neutral.text },
      paper_bgcolor: neutral.surface,
      plot_bgcolor: neutral.surface,
      xaxis: {
        side: 'bottom',
        tickangle: -90,
        tickfont: { family: fontFamily.mono, size: tickPx },
        showgrid: false,
        zeroline: false,
        fixedrange: true,
        constrain: 'domain',
      },
      yaxis: {
        autorange: 'reversed',
        // Show pretext-truncated names while keeping full phyla as the category data.
        tickmode: 'array',
        tickvals: yTickVals,
        ticktext: yTickText,
        tickfont: { family: fontFamily.mono, size: tickPx },
        showgrid: false,
        zeroline: false,
        fixedrange: true,
        constrain: 'domain',
      },
      shapes: selectionShapes(g, outlinePx),
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
    // Track the WRAPPER size (the viewport-bound scroll box), not `el` — `el` is pinned to
    // `heatmapMinW` when it overflows on a phone, so observing it would peg containerW to that
    // min-width and the phone ('sm') width tier (tighter margins/fonts) could never apply.
    const unobserve = observeElementSize(scrollWrap, (s) => (containerSize = s), { fontsReady: true })
    return () => {
      disposed = true
      unobserve()
      teardown?.()
    }
  })
</script>

<Card
  title="Specifier × phylum"
  subtitle="Loci by specifier amino acid (the amino acid each T-box senses) and phylum. The dataset is strongly Firmicutes-dominated (454/470 Firmicutes), so cells use a neutral grey ramp and the 16 non-Firmicutes loci stand out. Click a cell to cross-filter."
>
  <!-- overflow-x-auto + a measured min-width: on a phone the cells keep a tappable size
       and the plot scrolls horizontally; on desktop the min never binds, so it fills. -->
  <div bind:this={scrollWrap} class="relative h-[clamp(17rem,44vh,24rem)] w-full overflow-x-auto">
    <div
      bind:this={el}
      class="h-full w-full"
      style:min-width={heatmapMinW > 0 ? `${heatmapMinW}px` : undefined}
    ></div>
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
    <span class="font-mono">ILE;LEU</span>) marks a mixed-specifier locus: its elements sense different
    amino acids. The <span class="font-mono">unassigned</span> row holds the 3 loci whose phylum could
    not be assigned (counted among the 16 non-Firmicutes).
  </p>
</Card>
