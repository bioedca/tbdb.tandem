<script lang="ts">
  // Regulated-operon breakdown (PLAN §9③). Three coordinated pieces over the one
  // shared filter state (§7.3): ① horizontal STACKED BARS of loci by `func_class`,
  // split by the two-tier classifier's provenance — solid (EC-backed) · hatched
  // (text-inferred*) · dotted (no annotation) (§5.3); ② a specifier → func_class
  // SANKEY exposing the observed couplings (TRP→biosynthesis, THR→aaRS, ILE/LEU→
  // biosynthesis); and ③ the regulation `type` shown as CHIPS, never a toggle
  // (§2.2/§9③). Bar colors + Sankey func_class nodes use the neutral FUNC_CLASS
  // chrome ramp (never a specifier hue, §8.2); specifier nodes use the data palette.
  //
  // The bars/chips render their COUNTS from `store.selected` (and the Sankey its
  // flows), so the whole panel narrows live with the dashboard (S2.6); the bar AXIS
  // comes from the full set so its layout stays stable. Every label states an
  // OBSERVED association — NO evolutionary-direction language anywhere (§6/§13).
  // Plotly is dynamically import()-ed so it never enters the boot bundle (§7.1).
  import { onMount } from 'svelte'
  import type {
    PlotData,
    PlotMouseEvent,
    PlotlyHTMLElement,
    PlotlyStatic,
  } from 'plotly.js-dist-min'

  import { store } from '../stores/filters.svelte'
  import { FUNC_CLASS_SHADE } from '../color'
  import { fontFamily, neutral } from '../design/tokens'
  import { fitOnResize } from '../plotly'
  import {
    buildOperonBars,
    buildSankey,
    typeCounts,
    type OperonBars,
    type SankeyModel,
  } from '../operon'
  import type { FuncSource, RegulationType } from '../data/types'
  import Card from './Card.svelte'
  import InfoTip from './InfoTip.svelte'
  import Spinner from './Spinner.svelte'

  // ── Derived models (all boot from loci.json — no members.json needed) ───────────
  const bars = $derived<OperonBars | null>(
    store.status === 'ready' ? buildOperonBars(store.loci, store.selected) : null,
  )
  const sankey = $derived<SankeyModel | null>(
    store.status === 'ready' ? buildSankey(store.selected) : null,
  )
  const types = $derived(store.status === 'ready' ? typeCounts(store.selected) : [])
  const empty = $derived(store.status === 'ready' && store.selected.length === 0)

  // func_source tiers → bar traces (provenance via PATTERN; §5.3). Solid (EC) /
  // hatched (text-inferred*) / dotted (no annotation).
  const TIERS: { key: FuncSource; name: string; shape: string }[] = [
    { key: 'EC', name: 'EC-backed', shape: '' },
    { key: 'text', name: 'text-inferred*', shape: '/' },
    { key: 'none', name: 'no annotation', shape: '.' },
  ]

  // ── Plotly (dynamically imported; §7.1) ─────────────────────────────────────────
  let plotly = $state<PlotlyStatic | null>(null)
  let barEl: HTMLDivElement
  let sankeyEl: HTMLDivElement
  let barBound = false
  // No `responsive: true` — its window 'resize' listener survives `purge` and leaks
  // per dashboard mount; we refit via fitOnResize() instead (see ../plotly).
  const CONFIG = { displayModeBar: false }

  /** Single-select-from-chart on a func_class bar: clicking the sole active class
   *  clears it, else narrows to exactly that class (toggle-clear; §9 centerpiece). */
  function selectFuncClass(value: string): void {
    const cur = store.filter.func_class
    if (cur.size === 1 && cur.has(value)) store.clearFacet('func_class')
    else store.setFacet('func_class', [value])
  }

  function onBarClick(ev: PlotMouseEvent): void {
    const label = ev.points?.[0]?.y
    if (typeof label === 'string') selectFuncClass(label)
  }

  /** Toggle the regulation `type` facet (the chip is a filter, not a view toggle). */
  function toggleType(value: RegulationType): void {
    store.toggleFacet('type', value)
  }

  // ── Bar render effect (re-runs on plotly load or selection change) ──────────────
  $effect(() => {
    if (!plotly || !barEl || !bars) return
    const b = bars
    const colors = b.funcClasses.map((fc) => FUNC_CLASS_SHADE[fc])
    const data: Partial<PlotData>[] = TIERS.map((tier) => ({
      type: 'bar',
      orientation: 'h',
      name: tier.name,
      y: b.funcClasses,
      x: b.counts[tier.key],
      marker: {
        color: colors,
        line: { color: neutral.surface, width: 1 },
        pattern: tier.shape
          ? { shape: tier.shape, fgcolor: neutral.surface, size: 7, solidity: 0.32 }
          : { shape: '' },
      },
      hovertemplate: `%{y} · ${tier.name}: %{x} loci<extra></extra>`,
    }))
    const layout = {
      autosize: true,
      barmode: 'stack',
      margin: { l: 104, r: 14, t: 6, b: 30 },
      font: { family: fontFamily.sans, size: 12, color: neutral.text },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      bargap: 0.34,
      // No Plotly `transition`: these bars carry marker.pattern (the §5.3/§9③
      // provenance hatching), and a `Plots.resize` landing anywhere near a
      // patterned-bar transition — including its finalization phase — throws
      // asynchronously from Plotly's transition frame (verified). Since window
      // resizes can't be fully fenced off, the bars narrow INSTANTLY instead; the
      // §8.4 "feels live" cue is carried by the table's list fade/reflow + the
      // synchronized instant narrowing of every panel.
      xaxis: {
        title: { text: 'loci', font: { size: 11, color: neutral.muted } },
        zeroline: false,
        gridcolor: neutral.hairline,
        fixedrange: true,
      },
      yaxis: {
        autorange: 'reversed',
        tickfont: { family: fontFamily.mono, size: 11 },
        fixedrange: true,
      },
      showlegend: true,
      legend: {
        orientation: 'h',
        x: 0,
        y: 1.16,
        font: { family: fontFamily.sans, size: 11, color: neutral.muted },
      },
    }
    void plotly.react(barEl, data, layout, CONFIG).then(() => {
      if (!barBound) {
        barBound = true
        ;(barEl as unknown as PlotlyHTMLElement).on('plotly_click', onBarClick)
      }
    })
  })

  // ── Sankey render effect (responder only — narrows live with the dashboard) ─────
  $effect(() => {
    if (!plotly || !sankeyEl || !sankey) return
    const s = sankey
    const data: Partial<PlotData>[] = [
      {
        type: 'sankey',
        orientation: 'h',
        arrangement: 'snap',
        node: {
          label: s.nodes.map((n) => n.label),
          color: s.nodes.map((n) => n.color),
          pad: 11,
          thickness: 13,
          line: { color: neutral.hairline, width: 0.5 },
          hovertemplate: '%{label}: %{value} loci<extra></extra>',
        },
        link: {
          source: s.links.map((l) => l.source),
          target: s.links.map((l) => l.target),
          value: s.links.map((l) => l.value),
          color: s.links.map((l) => l.color),
          hovertemplate: '%{source.label} → %{target.label}: %{value} loci<extra></extra>',
        },
      },
    ]
    const layout = {
      autosize: true,
      margin: { l: 6, r: 6, t: 6, b: 6 },
      font: { family: fontFamily.sans, size: 11, color: neutral.text },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
    }
    void plotly.react(sankeyEl, data, layout, CONFIG)
  })

  onMount(() => {
    let disposed = false
    let teardown: (() => void) | null = null
    void import('plotly.js-dist-min').then((mod) => {
      if (disposed) return
      plotly = mod.default ?? (mod as unknown as PlotlyStatic)
      teardown = fitOnResize(plotly, [barEl, sankeyEl])
    })
    return () => {
      disposed = true
      teardown?.()
    }
  })
</script>

<Card
  title="Regulated-operon breakdown"
  subtitle="Each T-box sits in the leader of a downstream gene or operon and toggles its expression by sensing the charging state of one cognate tRNA — uncharged tRNA, which builds up when its amino acid is scarce, flips the switch. Loci are grouped here by the function class of that regulated gene or operon (split by classification source). Observed associations only — no evolutionary direction is implied."
>
  <!-- Regulation type — shown as chips, not a toggle (§2.2/§9③) -->
  <div class="mb-4 flex flex-wrap items-center gap-2">
    <span class="text-small text-muted">Regulation type:</span>
    {#each types as t (t.type)}
      {@const active = store.filter.type.has(t.type)}
      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-caption font-medium transition-colors duration-150 ease-standard {active
          ? 'border-brand/40 bg-brand-subtle text-brand-strong'
          : 'border-hairline bg-surface-subtle text-body hover:bg-surface'}"
        title="Filter by regulation mode ({t.type})"
        onclick={() => toggleType(t.type)}
      >
        {t.type}
        <span class="font-mono text-muted">{t.count}</span>
      </button>
    {/each}
  </div>

  <div class="grid gap-6 lg:grid-cols-5">
    <!-- ① Stacked bars by func_class (solid = EC · hatched = text-inferred* · dotted = none) -->
    <div class="lg:col-span-2">
      <div class="mb-1 flex items-center gap-1">
        <h3 class="text-small font-medium text-ink">By function class</h3>
        <InfoTip term="func_class" />
      </div>
      <p class="mb-2 text-caption text-muted">
        Function of the regulated gene (from its EC number or text annotation) —
        <span class="font-mono">aaRS</span> = aminoacyl-tRNA synthetase · biosynthesis = biosynthetic
        enzyme (transferase/lyase) · transporter = membrane transporter/permease · oxidoreductase =
        oxidation–reduction (redox) enzyme · unknown = no annotation.
      </p>
      <p class="mb-2 text-caption text-muted">
        Classification source — solid = backed by an EC (Enzyme Commission) number · hatched = inferred
        from the gene's text annotation (<span class="font-mono">*</span>lower confidence) · dotted = no
        annotation. Click a bar to cross-filter.
      </p>
      <div class="relative h-[18rem] w-full">
        <div bind:this={barEl} class="h-full w-full"></div>
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
    </div>

    <!-- ② specifier → func_class Sankey (responder; narrows with the dashboard) -->
    <div class="lg:col-span-3">
      <h3 class="mb-1 text-small font-medium text-ink">Specifier → function coupling</h3>
      <p class="mb-2 text-caption text-muted">
        Each band counts the loci whose specifier amino acid (left, colored by amino acid) regulates a
        given function class (right, neutral grey). Width = number of loci — an observed association, not a
        cause.
      </p>
      <div class="relative h-[30rem] w-full">
        <div bind:this={sankeyEl} class="h-full w-full"></div>
        {#if store.status !== 'ready'}
          <div class="absolute inset-0 grid place-items-center">
            {#if store.status === 'error'}
              <p class="text-small text-muted">Locus data unavailable.</p>
            {:else}
              <Spinner label="Loading loci…" />
            {/if}
          </div>
        {:else if empty}
          <div class="absolute inset-0 grid place-items-center">
            <p class="text-small text-muted">No loci match the current filter.</p>
          </div>
        {/if}
      </div>
    </div>
  </div>
</Card>
