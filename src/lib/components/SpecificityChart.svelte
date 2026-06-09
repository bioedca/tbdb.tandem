<script lang="ts">
  // Specificity overview (PLAN §9②) — the first Plotly view. A horizontal
  // locus-level specifier-AA bar PLUS a SYMMETRIC element-pair matrix (folded on
  // the transcript-5′ ordinal from members.json, never the alphabetized
  // specifier_aa), with the 9 triple-core loci surfaced as a separate list. Plotly
  // is dynamically import()-ed so it never enters the boot bundle (§7.1). Clicking
  // a bar or a matrix cell cross-filters the shared store (§7.3) — the only filter
  // brain; the table (and, from S2.6, every other panel) narrows in step.
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import type {
    PlotData,
    PlotMouseEvent,
    PlotlyHTMLElement,
    PlotlyStatic,
  } from 'plotly.js-dist-min'

  import { store } from '../stores/filters.svelte'
  import { aaColor, withAlpha } from '../color'
  import { brand, fontFamily, neutral } from '../design/tokens'
  import { fitOnResize } from '../plotly'
  import { observeElementSize } from '../responsive'
  import { graphPrimitiveScale, scalePx } from '../text/graphScale'
  import {
    barModel,
    buildSpecMatrix,
    cellFacetValue,
    tripleEntries,
    type SpecMatrix,
  } from '../specificity'
  import Card from './Card.svelte'
  import InfoTip from './InfoTip.svelte'
  import Spinner from './Spinner.svelte'

  // ── Derived models (bar boots from summary; matrix waits for members) ───────────
  const bar = $derived(store.summary ? barModel(store.summary.distributions.specifier) : null)
  const matrix = $derived(
    store.membersStatus === 'ready' ? buildSpecMatrix(store.loci, store.membersByLocus) : null,
  )
  const triples = $derived(
    store.membersStatus === 'ready' ? tripleEntries(store.loci, store.membersByLocus) : [],
  )
  const activeSpec = $derived(store.filter.specifier)

  // ── Plotly (dynamically imported; §7.1) ─────────────────────────────────────────
  let plotly = $state<PlotlyStatic | null>(null)
  let barEl: HTMLDivElement
  let matrixEl: HTMLDivElement
  let barBound = false
  let matrixBound = false
  let barSize = $state({ w: 0, h: 0 })
  let matrixSize = $state({ w: 0, h: 0 })

  // No `responsive: true` — its window 'resize' listener survives `purge` and leaks
  // per dashboard mount; we refit via fitOnResize() instead (see ../plotly).
  const CONFIG = { displayModeBar: false }
  // Count color scale — a quantitative blue ramp (chrome, NOT a specifier hue, so
  // the §8.2 chrome⟂data invariant holds: cells encode COUNTS, not specifiers).
  const COUNT_SCALE: [number, string][] = [
    [0, '#eef5f9'],
    [0.15, '#cfe5f0'],
    [0.6, '#92c4dc'],
    [1, '#5ba0c4'],
  ]

  /** Single-select-from-chart: clicking the sole active value clears it, else sets
   *  the specifier facet to exactly that value (so it "narrows to those N"; §9). */
  function selectSpecifier(value: string): void {
    const cur = store.filter.specifier
    if (cur.size === 1 && cur.has(value)) store.clearFacet('specifier')
    else store.setFacet('specifier', [value])
  }

  function onBarClick(ev: PlotMouseEvent): void {
    const label = ev.points?.[0]?.y
    if (typeof label === 'string') selectSpecifier(label)
  }

  function onMatrixClick(ev: PlotMouseEvent): void {
    const p = ev.points?.[0]
    if (!p || p.z == null) return // skip empty cells (no loci)
    if (typeof p.x === 'string' && typeof p.y === 'string') {
      selectSpecifier(cellFacetValue(p.y, p.x))
    }
  }

  /** Brand-accent outline around every cell whose locus-value is currently active. */
  function selectionShapes(m: SpecMatrix, active: Set<string>, lineWidth = 2): Record<string, unknown>[] {
    if (active.size === 0) return []
    const shapes: Record<string, unknown>[] = []
    for (let i = 0; i < m.axis.length; i++) {
      for (let j = 0; j < m.axis.length; j++) {
        if (m.z[i][j] == null) continue
        if (!active.has(cellFacetValue(m.axis[i], m.axis[j]))) continue
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

  // ── Render effects (re-run on plotly load, data change, or selection change) ─────
  $effect(() => {
    if (!plotly || !barEl || !bar) return
    void barSize.w
    void barSize.h
    const active = activeSpec
    const anySel = active.size > 0
    const g = graphPrimitiveScale(
      barSize.w || barEl.clientWidth || 600,
      barSize.h || barEl.clientHeight || 360,
      `400 12px ${fontFamily.sans}`,
      { targetChars: 78, referenceWidth: 600, referenceHeight: 360, maxScale: 1.55 },
    )
    const fontPx = scalePx(12, g, { min: 11, max: 17 })
    const tickPx = scalePx(11, g, { min: 10, max: 16 })
    const titlePx = scalePx(11, g, { min: 10, max: 15 })
    const colors = bar.colors.map((c, i) =>
      anySel && !active.has(bar.labels[i]) ? withAlpha(c, 0.25) : c,
    )
    const data: Partial<PlotData>[] = [
      {
        type: 'bar',
        orientation: 'h',
        x: bar.counts,
        y: bar.labels,
        marker: { color: colors, line: { width: 0 } },
        hovertemplate: '%{y}: %{x} loci<extra></extra>',
      },
    ]
    const layout = {
      autosize: true,
      margin: {
        l: scalePx(64, g, { min: 58, max: 94 }),
        r: scalePx(14, g, { min: 12, max: 24 }),
        t: scalePx(6, g, { min: 6, max: 12 }),
        b: scalePx(34, g, { min: 30, max: 52 }),
      },
      font: { family: fontFamily.sans, size: fontPx, color: neutral.text },
      paper_bgcolor: neutral.surface,
      plot_bgcolor: neutral.surface,
      bargap: 0.22,
      xaxis: {
        title: { text: 'loci', font: { size: titlePx, color: neutral.muted } },
        zeroline: false,
        gridcolor: neutral.hairline,
        fixedrange: true,
      },
      yaxis: {
        autorange: 'reversed',
        tickfont: { family: fontFamily.mono, size: tickPx },
        fixedrange: true,
      },
    }
    void plotly.react(barEl, data, layout, CONFIG).then(() => {
      if (!barBound) {
        barBound = true
        ;(barEl as unknown as PlotlyHTMLElement).on('plotly_click', onBarClick)
      }
    })
  })

  $effect(() => {
    if (!plotly || !matrixEl || !matrix) return
    void matrixSize.w
    void matrixSize.h
    const m = matrix
    const g = graphPrimitiveScale(
      matrixSize.w || matrixEl.clientWidth || 720,
      matrixSize.h || matrixEl.clientHeight || 360,
      `400 10px ${fontFamily.mono}`,
      { targetChars: 82, referenceWidth: 720, referenceHeight: 360, maxScale: 1.55 },
    )
    const tickPx = scalePx(10, g, { min: 9, max: 16 })
    const cellPx = scalePx(9, g, { min: 8, max: 15 })
    const gapPx = scalePx(1.5, g, { min: 1.2, max: 2.8 })
    const outlinePx = scalePx(2, g, { min: 1.5, max: 3.2 })
    const data: Partial<PlotData>[] = [
      {
        type: 'heatmap',
        x: m.axis,
        y: m.axis,
        z: m.z,
        text: m.text,
        texttemplate: '%{text}',
        textfont: { family: fontFamily.mono, size: cellPx, color: neutral.ink },
        xgap: gapPx,
        ygap: gapPx,
        colorscale: COUNT_SCALE,
        zmin: 0,
        zmax: Math.min(m.max, 12),
        showscale: false,
        hoverongaps: false,
        hovertemplate: '%{y} × %{x}: %{z} loci<extra></extra>',
      },
    ]
    const layout = {
      autosize: true,
      margin: {
        l: scalePx(52, g, { min: 48, max: 82 }),
        r: scalePx(8, g, { min: 8, max: 16 }),
        t: scalePx(6, g, { min: 6, max: 12 }),
        b: scalePx(52, g, { min: 48, max: 84 }),
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
        // The matrix is square (scaleanchor below), so on a wide column its domain is
        // height-bound; center it horizontally (§4.5) so any slack is symmetric padding
        // rather than a single empty gap on the right.
        constraintoward: 'center',
      },
      yaxis: {
        autorange: 'reversed',
        scaleanchor: 'x',
        scaleratio: 1,
        tickfont: { family: fontFamily.mono, size: tickPx },
        showgrid: false,
        zeroline: false,
        fixedrange: true,
        constrain: 'domain',
      },
      shapes: selectionShapes(m, activeSpec, outlinePx),
    }
    void plotly.react(matrixEl, data, layout, CONFIG).then(() => {
      if (!matrixBound) {
        matrixBound = true
        ;(matrixEl as unknown as PlotlyHTMLElement).on('plotly_click', onMatrixClick)
      }
    })
  })

  onMount(() => {
    let disposed = false
    let teardown: (() => void) | null = null
    const unobserveBar = observeElementSize(barEl, (s) => (barSize = s), { fontsReady: true })
    const unobserveMatrix = observeElementSize(matrixEl, (s) => (matrixSize = s), { fontsReady: true })
    void import('plotly.js-dist-min').then((mod) => {
      if (disposed) return
      plotly = mod.default ?? (mod as unknown as PlotlyStatic)
      teardown = fitOnResize(plotly, [barEl, matrixEl])
    })
    return () => {
      disposed = true
      unobserveBar()
      unobserveMatrix()
      teardown?.()
    }
  })
</script>

<Card
  title="Specificity overview"
  subtitle="Each T-box element senses one amino acid via a specifier codon in its Stem I: the “specifier” shown here is that amino acid (3-letter code). The bar counts loci by specifier; the matrix counts two-element loci by the specifiers of their two elements. Click a bar or cell to cross-filter."
>
  <!-- grid-cols-1 makes the mobile track minmax(0,1fr) (not an `auto` track sized to
       the Plotly plot's max-content), and min-w-0 lets each panel shrink below the
       plot's intrinsic width so Plotly refits to the real column width instead of
       overflowing the page. -->
  <div class="grid grid-cols-1 gap-6 lg:grid-cols-5">
    <!-- Specifier-AA bar (locus-level; boots from summary.json) -->
    <div class="min-w-0 lg:col-span-2">
      <div class="mb-1 flex items-center gap-1">
        <h3 class="text-small font-medium text-ink">Specifier (per locus)</h3>
        <InfoTip term="specifier" />
      </div>
      <div bind:this={barEl} class="h-[clamp(18rem,46vh,26rem)] w-full 2xl:h-[clamp(26rem,40vh,40rem)]"></div>
      <p class="mt-2 text-caption text-muted">
        Each locus counted once by its overall specifier; mixed loci appear as
        <span class="font-mono">A;B</span> (e.g. ILE;LEU).
      </p>
    </div>

    <!-- Symmetric element-pair matrix (element-level; needs members.json) -->
    <div class="min-w-0 lg:col-span-3">
      <div class="mb-1 flex items-center gap-1">
        <h3 class="text-small font-medium text-ink">Element-pair matrix (symmetric)</h3>
        <InfoTip
          label="Element-pair matrix"
          tip="Each cell counts the two-element loci whose two elements carry those two specifiers (row × column). The grid is folded, so every pair appears on both sides of the diagonal."
        />
      </div>
      <div class="relative h-[clamp(18rem,46vh,26rem)] w-full 2xl:h-[clamp(26rem,40vh,40rem)]">
        <div bind:this={matrixEl} class="h-full w-full"></div>
        {#if store.membersStatus !== 'ready'}
          <div class="absolute inset-0 grid place-items-center">
            {#if store.membersStatus === 'error'}
              <p class="text-small text-muted">Element data unavailable.</p>
            {:else}
              <Spinner label="Loading members…" />
            {/if}
          </div>
        {/if}
      </div>
      <p class="mt-2 text-caption text-muted">
        Each cell = number of two-element loci with those two specifiers (row × column); darker blue = more
        loci, <span class="font-mono">?</span> = an element whose specifier is unresolved.
        <span class="font-medium text-body">Diagonal</span> cells = same-specifier loci (both elements sense
        the same amino acid); <span class="font-medium text-body">off-diagonal</span> = mixed. Cell color is
        count only. Read the amino acids from the row and column labels. The largest off-diagonal
        cell, <span class="font-mono">ILE×LEU</span> (10 loci), pairs an isoleucine-sensing element with a
        leucine-sensing one, both branched-chain amino acids.
      </p>
    </div>
  </div>

  <!-- Triple-core loci — surfaced as a list, not forced into 2D cells (§9②) -->
  {#if triples.length}
    <div class="mt-5 border-t border-hairline pt-4">
      <h3 class="mb-1 text-small font-medium text-ink">
        Triple-core loci <span class="font-normal text-muted">({triples.length})</span>
      </h3>
      <p class="mb-2 text-caption text-muted">
        These {triples.length} loci hold three T-box elements, too many for the 2-D matrix above, so they
        are listed here. Each dot is one element's specifier amino acid in 5′→3′ order; grey
        <span class="font-mono">?</span> = unresolved.
      </p>
      <ul class="flex flex-wrap gap-2">
        {#each triples as t (t.tandem_id)}
          <li>
            <button
              type="button"
              class="flex items-center gap-2 rounded-md border border-hairline bg-surface px-2.5 py-1.5 text-small transition-colors duration-150 ease-standard hover:bg-surface-subtle"
              title="{t.organism ?? t.tandem_id}: open locus detail"
              onclick={() => push(`/locus/${t.tandem_id}`)}
            >
              <span class="font-mono font-medium text-brand">{t.tandem_id}</span>
              <span class="flex items-center gap-1" aria-hidden="true">
                {#each t.specs as s, i (i)}
                  <span
                    class="size-3 rounded-sm ring-1 ring-ink/10"
                    style:background={aaColor(s)}
                  ></span>
                {/each}
              </span>
              <span class="font-mono text-caption text-muted">{t.specs.join(' · ')}</span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</Card>
