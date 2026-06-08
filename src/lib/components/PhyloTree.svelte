<script lang="ts">
  // The sequence-similarity map (PLAN §9④, §6) — the real Stem-I tree on `/tree`.
  //
  // EXPLORATORY similarity map, displayed UNROOTED (PLAN §6): the stored Newick is
  // midpoint-rooted for stable LAYOUT ONLY; phylotree renders it equal-angle
  // unrooted so no root/polarity is implied. Nothing here reads or shows ancestry
  // (§6, §13). Built element-level (keyed by `unique_name`) and collapsed to a
  // per-locus default view (PLAN §6) — `tree.ts` does the pure collapse; sisters
  // fold to one locus tip, dispersed copies stay separate (the element toggle
  // reveals which). Controls: locus/element view, main↔fallback tree, a support-
  // collapse slider (FastTree SH-like supports), and a non-Firmicutes-only filter
  // for the 16 outliers. Tip fill = specifier (the primary color axis, §8.2); a
  // thin outer ring = the neutral phylum context (§8.2 separate ramp).
  //
  // phylotree.js is legacy + heavy (d3 v7 + lodash/underscore); it is dynamically
  // import()-ed so it never enters the boot bundle (§7.1), and renders into a plain
  // container we own (its small base CSS is imported, class-scoped so it can't leak
  // like fornac's did — see S2.3).
  import 'phylotree/dist/phylotree.css'
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'

  import { store } from '../stores/filters.svelte'
  import { fontFamily, neutral } from '../design/tokens'
  import { observeElementSize } from '../responsive'
  import { graphPrimitiveScale, scalePx } from '../text/graphScale'
  import {
    buildElementTipMeta,
    buildLocusTipMeta,
    collapseToLoci,
    isNonFirmicutes,
    parseNewick,
    parseSupport,
    phylumRing,
    scaleBranchLengths,
    serializeNewick,
    specifierFill,
    tipTandemMap,
    type ElementTipMeta,
    type LocusTipMeta,
  } from '../tree'
  import { PHYLUM_COLORS, SPECIFIER_COLORS, UNKNOWN_SPECIFIER_COLOR } from '../color'
  import Card from './Card.svelte'
  import InfoTip from './InfoTip.svelte'
  import Spinner from './Spinner.svelte'

  // ── phylotree interop (loose types; the package is legacy vanilla JS) ────────────
  /* eslint-disable @typescript-eslint/no-explicit-any */
  type PhyloNode = { children?: PhyloNode[]; data: { name: string } }
  type PhyloLink = { source: PhyloNode; target: PhyloNode }
  type D3Sel = {
    selectAll: (s: string) => any
    style: (k: string, v: unknown) => D3Sel
    [k: string]: any
  }
  type PhyloDisplay = { show: () => SVGSVGElement; update: () => void }
  type PhyloInstance = { render: (o: Record<string, unknown>) => PhyloDisplay }
  type PhyloCtor = new (nwk: string) => PhyloInstance
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ── Props (S3.2) ─────────────────────────────────────────────────────────────────
  interface Props {
    /** Dashboard panel: clicking a tip narrows the shared store by that locus's
     *  specifier (toggle-clear, mirroring the specifier bar — §7.3 keeps the tree
     *  inside the existing facet model). The full /tree page leaves this false, so
     *  a tip click opens its detail page (the S3.1 behavior). */
    selectable?: boolean
    /** Canvas height (set inline; e.g. '68vh' on /tree, a shorter value on the
     *  dashboard panel). */
    height?: string
  }
  let { selectable = false, height = 'clamp(26rem, 68vh, 52rem)' }: Props = $props()

  // ── Controls (local to this view; the dashboard cross-filter is the store) ───────
  let mode = $state<'locus' | 'element'>('locus')
  let which = $state<'main' | 'fallback'>('main')
  let supportThreshold = $state(0.5) // PLAN §6: "default collapse < 0.5"
  let nonFirmicutesOnly = $state(false)
  // Branch-length scale: 'true' = distance-proportional (default); 'sqrt' = compress the
  // long branches so a single divergent tip stops stretching the map (§4.4). Layout-only.
  let branchScale = $state<'true' | 'sqrt'>('true')

  let Phylo = $state<PhyloCtor | null>(null)
  let containerEl: HTMLDivElement
  let size = $state({ w: 0, h: 0 })
  const graphScale = $derived(
    graphPrimitiveScale(size.w || 800, size.h || 600, `400 12px ${fontFamily.sans}`, {
      targetChars: 120,
      referenceWidth: 900,
      referenceHeight: 620,
      maxScale: 1.65,
    }),
  )

  // Kick the lazy tree-artifact load (PLAN §7.3); show a spinner until ready.
  onMount(() => {
    void store.ensureTrees()
    let disposed = false
    void import('phylotree').then((mod) => {
      if (disposed) return
      Phylo = ((mod as any).phylotree ?? (mod as any).default) as PhyloCtor
    })
    // Track the container size so layout and primitive scale refit on resize. A
    // trailing debounce coalesces a drag-resize burst into one rebuild.
    const unobserve = observeElementSize(containerEl, (s) => (size = s), { fontsReady: true })
    return () => {
      disposed = true
      unobserve()
    }
  })

  // ── Dashboard cross-filter (PLAN §9, §7.3) ───────────────────────────────────────
  // RESPONDER (always): when the shared store is filtered, tips whose locus is NOT
  // in `store.selected` are dimmed, so a selection in any panel narrows the tree to
  // those loci (the §9 "narrows … tree … to those 10 loci" guarantee). SELECTOR
  // (only when `selectable`): a tip click sets the specifier facet — see onTipClick.
  const selectedTandemIds = $derived(new Set(store.selected.map((l) => l.tandem_id)))
  const crossFiltered = $derived(store.isFiltered)
  /** tandem_id → locus-level `specifier_aa`, for the specifier selector. */
  const specifierByLocus = $derived(
    new Map(store.loci.map((l) => [l.tandem_id, l.specifier_aa])),
  )

  // ── Derived render inputs (parse/collapse are pure; PLAN §6) ─────────────────────
  const activeNewick = $derived(which === 'main' ? store.newickMain : store.newickFallback)

  const renderedNewick = $derived.by<string | null>(() => {
    const nwk = activeNewick
    if (!nwk || !store.treeTips) return null
    // Default (linear) element view: emit the artifact verbatim (byte-faithful, unchanged).
    if (mode === 'element' && branchScale === 'true') return nwk
    let tree =
      mode === 'element'
        ? parseNewick(nwk)
        : collapseToLoci(parseNewick(nwk), tipTandemMap(store.treeTips, which))
    // √-compress the branch extents so the dense core isn't crushed by one long branch.
    if (branchScale === 'sqrt') tree = scaleBranchLengths(tree, Math.sqrt)
    return serializeNewick(tree)
  })

  const elementMeta = $derived(store.treeTips ? buildElementTipMeta(store.treeTips, which) : null)
  const locusMeta = $derived(store.treeTips ? buildLocusTipMeta(store.treeTips, which) : null)

  /** Visible tip count of the current render (locus collapse vs element). */
  const tipCount = $derived.by<number>(() => {
    const nwk = renderedNewick
    if (!nwk) return 0
    return (nwk.match(/[(,][^(),:;]+(?=[:,)])/g) ?? []).length
  })

  // ── Tooltip ─────────────────────────────────────────────────────────────────────
  let tip = $state<{ visible: boolean; x: number; y: number; lines: string[] }>({
    visible: false,
    x: 0,
    y: 0,
    lines: [],
  })
  function moveTip(ev: MouseEvent): void {
    tip = { ...tip, x: ev.clientX + 14, y: ev.clientY + 14 }
  }
  function hideTip(): void {
    tip = { ...tip, visible: false }
  }
  function showElementTip(ev: MouseEvent, m: ElementTipMeta): void {
    tip = {
      visible: true,
      x: ev.clientX + 14,
      y: ev.clientY + 14,
      lines: [
        `${m.tandem_id} · element ${m.ordinal}`,
        `Specifier: ${m.specifier ?? '?'}`,
        `Phylum: ${m.phylum ?? 'unassigned'}`,
        m.unique_name,
      ],
    }
  }
  function showLocusTip(ev: MouseEvent, m: LocusTipMeta): void {
    tip = {
      visible: true,
      x: ev.clientX + 14,
      y: ev.clientY + 14,
      lines: [
        m.tandem_id,
        `Specifier: ${m.specifier ?? '?'}`,
        `Phylum: ${m.phylum ?? 'unassigned'}`,
        `${m.memberCount} T-box element${m.memberCount === 1 ? '' : 's'} in this locus (one dot here)`,
      ],
    }
  }

  // ── Tip click: select-by-specifier (dashboard) or open detail (/tree) ────────────
  function onTipClick(tandemId: string): void {
    if (!selectable) {
      push(`/locus/${tandemId}`)
      return
    }
    // Narrow the shared store by this locus's specifier (toggle-clear, the §9②
    // bar convention). Specifier is an existing facet dimension, so no new §7.3
    // dimension is introduced; a null specifier (none on real data) no-ops.
    const spec = specifierByLocus.get(tandemId)
    if (spec == null) return
    const cur = store.filter.specifier
    if (cur.size === 1 && cur.has(spec)) store.clearFacet('specifier')
    else store.setFacet('specifier', [spec])
  }

  // ── Stylers (closures: read live control state at each (re)draw) ─────────────────
  function nodeStyler(element: D3Sel, node: PhyloNode): void {
    const isLeaf = !node.children || node.children.length === 0
    if (!isLeaf) return // internal-node circles are hidden via scoped CSS
    const name = node.data.name

    let specifier: string | null = null
    let phylum: string | null = null
    let tandemId = name
    let onEnter: ((ev: MouseEvent) => void) | null = null

    if (mode === 'element') {
      const m = elementMeta?.get(name)
      if (m) {
        specifier = m.specifier
        phylum = m.phylum
        tandemId = m.tandem_id
        onEnter = (ev) => showElementTip(ev, m)
      }
    } else {
      const m = locusMeta?.get(name)
      if (m) {
        specifier = m.specifier
        phylum = m.phylum
        tandemId = m.tandem_id
        onEnter = (ev) => showLocusTip(ev, m)
      }
    }

    const outlier = isNonFirmicutes(phylum)
    // Dim a tip if the local non-Firmicutes filter excludes it OR the shared
    // cross-filter selection does (PLAN §9 — the dashboard narrows the tree).
    const outOfSelection = crossFiltered && !selectedTandemIds.has(tandemId)
    const dim = (nonFirmicutesOnly && !outlier) || outOfSelection
    const emphasize = nonFirmicutesOnly && outlier
    const rBase = dim ? 1.6 : emphasize ? 4 : mode === 'locus' ? 3 : 2.3
    const r = scalePx(rBase, graphScale, { min: dim ? 1.4 : 2.1, max: emphasize ? 7 : 5.2 })
    const ringWidth = scalePx(outlier ? 1.6 : 1, graphScale, { min: outlier ? 1.4 : 0.9, max: outlier ? 2.8 : 2 })

    const join = element.selectAll('circle.tv-tip').data([node])
    const merged = join.enter().append('circle').classed('tv-tip', true).merge(join)
    merged
      .attr('r', r)
      .attr('cx', 0)
      .attr('cy', 0)
      .style('fill', specifierFill(specifier))
      .style('fill-opacity', dim ? 0.12 : 1)
      .style('stroke', phylumRing(phylum))
      .style('stroke-width', ringWidth)
      .style('stroke-opacity', dim ? 0.15 : 0.9)
      .style('cursor', 'pointer')
      .on('mouseenter', (ev: MouseEvent) => onEnter?.(ev))
      .on('mousemove', (ev: MouseEvent) => moveTip(ev))
      .on('mouseleave', () => hideTip())
      .on('click', () => onTipClick(tandemId))
  }

  function edgeStyler(element: D3Sel, edge: PhyloLink): void {
    const t = edge.target
    const isInternalChild = !!t.children && t.children.length > 0
    let faded = false
    if (isInternalChild) {
      const s = parseSupport(t.data?.name)
      if (s != null && s < supportThreshold) faded = true
    }
    element
      .style('fill', 'none')
      .style('stroke', neutral.muted)
      .style('stroke-width', `${scalePx(faded ? 0.6 : 1, graphScale, { min: faded ? 0.55 : 0.9, max: faded ? 1.1 : 1.9 })}px`)
      .style('stroke-opacity', faded ? 0.18 : 0.7)
      .style('stroke-dasharray', faded ? '2,2' : null)
  }

  // ── Render lifecycle ─────────────────────────────────────────────────────────────
  let display: PhyloDisplay | null = null

  function renderTree(): void {
    if (!Phylo || !containerEl) return
    const nwk = renderedNewick
    if (!nwk) return
    const w = Math.max(containerEl.clientWidth || size.w || 800, 200)
    const h = Math.max(containerEl.clientHeight || size.h || 600, 200)
    containerEl.replaceChildren()
    const treeInstance = new Phylo(nwk)
    display = treeInstance.render({
      container: containerEl,
      width: w,
      height: h,
      'is-unrooted': true, // PLAN §6: display UNROOTED
      'show-scale': false,
      'show-labels': false, // 847 tips — labels would be unreadable; hover instead
      'show-menu': false, // no jQuery/d3 context menu
      selectable: false,
      collapsible: false,
      brush: false,
      reroot: false,
      zoom: true, // pan/zoom to inspect the dense map
      'draw-size-bubbles': false,
      'node-styler': nodeStyler,
      'edge-styler': edgeStyler,
    })
    containerEl.appendChild(display.show())
  }

  // Topology rebuild — on the tree, the view mode, or the canvas size changing.
  $effect(() => {
    // touch deps explicitly so the effect re-runs when any changes
    void Phylo
    void renderedNewick
    void size.w
    void size.h
    renderTree()
  })

  // Styling-only refresh (support slider / non-Firmicutes filter) — reuse the
  // existing layout, just re-run the stylers. rAF-coalesced for smooth dragging.
  let restyleRaf = 0
  $effect(() => {
    void supportThreshold
    void nonFirmicutesOnly
    void selectedTandemIds // respond to the shared cross-filter (PLAN §9)
    void crossFiltered
    if (!display) return
    cancelAnimationFrame(restyleRaf)
    const d = display
    restyleRaf = requestAnimationFrame(() => {
      try {
        d.update()
      } catch {
        /* torn down mid-frame — ignore */
      }
    })
    // Cancel a pending restyle if the view is torn down (or deps change) before the
    // frame fires, so update() never runs against a stale/torn-down display.
    return () => cancelAnimationFrame(restyleRaf)
  })

  // Legend: the specifiers actually present, in the §8.2 family order.
  const legendSpecifiers = $derived.by<string[]>(() => {
    const meta = mode === 'element' ? elementMeta : locusMeta
    if (!meta) return []
    const present = new Set<string>()
    for (const m of meta.values()) {
      for (const part of (m.specifier ?? '?').split(';')) present.add(part)
    }
    const order = Object.keys(SPECIFIER_COLORS)
    return [...present].sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  })
</script>

<Card>
  {#snippet children()}
    <!-- Controls -->
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3">
      <fieldset class="flex items-center gap-2">
        <legend class="sr-only">Tip granularity</legend>
        <span class="text-small text-muted">View</span>
        <InfoTip
          label="View"
          tip="Each tandem locus holds two or more T-box elements. Locus shows one dot per locus; Element shows every element separately, so when a locus's elements sit far apart in Element view, their Stem I sequences are markedly different."
        />
        <div class="inline-flex overflow-hidden rounded-md border border-hairline">
          <button
            type="button"
            class="px-3 py-1 text-small {mode === 'locus' ? 'bg-brand text-white' : 'bg-surface text-text'}"
            aria-pressed={mode === 'locus'}
            onclick={() => (mode = 'locus')}>Locus</button
          >
          <button
            type="button"
            class="border-l border-hairline px-3 py-1 text-small {mode === 'element' ? 'bg-brand text-white' : 'bg-surface text-text'}"
            aria-pressed={mode === 'element'}
            onclick={() => (mode = 'element')}>Element</button
          >
        </div>
      </fieldset>

      <fieldset class="flex items-center gap-2">
        <legend class="sr-only">Which tree</legend>
        <span class="text-small text-muted">Tree</span>
        <InfoTip
          label="Tree"
          tip="Main · Stem I builds the map from each element's Stem I, the region carrying the specifier codon that base-pairs the cognate tRNA's anticodon. Fallback maps the shorter, length-gated elements by their antiterminator region instead; positions are not comparable across the two trees."
        />
        <div class="inline-flex overflow-hidden rounded-md border border-hairline">
          <button
            type="button"
            class="px-3 py-1 text-small {which === 'main' ? 'bg-brand text-white' : 'bg-surface text-text'}"
            aria-pressed={which === 'main'}
            onclick={() => (which = 'main')}>Main · Stem I</button
          >
          <button
            type="button"
            class="border-l border-hairline px-3 py-1 text-small {which === 'fallback' ? 'bg-brand text-white' : 'bg-surface text-text'}"
            aria-pressed={which === 'fallback'}
            onclick={() => (which = 'fallback')}>Fallback · antiterminator</button
          >
        </div>
      </fieldset>

      <fieldset class="flex items-center gap-2">
        <legend class="sr-only">Branch length scale</legend>
        <span class="text-small text-muted">Branches</span>
        <InfoTip
          label="Branches"
          tip="True draws each branch proportional to its sequence distance, so a single very divergent tip can stretch the whole map and squeeze the dense core. Compressed (√) shrinks the long branches so the core spreads out and reads more legibly. It is a display aid only; distances are then no longer to scale."
        />
        <div class="inline-flex overflow-hidden rounded-md border border-hairline">
          <button
            type="button"
            class="px-3 py-1 text-small {branchScale === 'true' ? 'bg-brand text-white' : 'bg-surface text-text'}"
            aria-pressed={branchScale === 'true'}
            onclick={() => (branchScale = 'true')}>True</button
          >
          <button
            type="button"
            class="border-l border-hairline px-3 py-1 text-small {branchScale === 'sqrt' ? 'bg-brand text-white' : 'bg-surface text-text'}"
            aria-pressed={branchScale === 'sqrt'}
            onclick={() => (branchScale = 'sqrt')}>√ compressed</button
          >
        </div>
      </fieldset>

      <div class="flex items-center gap-2 text-small text-text">
        <span>Fade support &lt;</span>
        <InfoTip term="branch_support" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={supportThreshold}
          class="accent-brand"
          aria-label="Fade branches with support below this value"
        />
        <span class="w-9 font-mono text-muted">{supportThreshold.toFixed(2)}</span>
      </div>

      <div class="flex items-center gap-2">
        <label class="flex items-center gap-2 text-small text-text">
          <input type="checkbox" bind:checked={nonFirmicutesOnly} class="accent-brand" />
          Non-Firmicutes only
        </label>
        <InfoTip
          label="Non-Firmicutes only"
          tip="Isolate the 16 non-Firmicutes loci (of 470). T-box riboswitches are predominantly found in Firmicutes, so these are the notable minority."
        />
      </div>

      <span class="ml-auto text-small text-muted">
        {tipCount} tip{tipCount === 1 ? '' : 's'}
        <span class="text-caption">({mode === 'locus' ? 'loci' : 'elements'}, {which})</span>
        {#if crossFiltered}
          <span class="text-caption text-brand">· cross-filtered</span>
        {/if}
      </span>
    </div>

    <!-- Tree canvas -->
    <div
      class="relative mt-3 min-h-[28rem] w-full overflow-hidden rounded-md border border-hairline bg-surface"
      style:height
    >
      <div bind:this={containerEl} class="tv-phylotree h-full w-full"></div>
      {#if store.treesStatus !== 'ready' || !Phylo}
        <div class="absolute inset-0 grid place-items-center">
          {#if store.treesStatus === 'error'}
            <p class="text-small text-muted">Tree data unavailable.</p>
          {:else}
            <Spinner label="Loading similarity map…" />
          {/if}
        </div>
      {/if}
    </div>

    <!-- Legend -->
    <div class="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-caption text-muted">
      <span class="inline-flex items-center gap-1">
        <span class="font-medium text-text">Specifier</span>
        <InfoTip term="specifier" />
      </span>
      {#each legendSpecifiers as s (s)}
        <span class="inline-flex items-center gap-1.5">
          <span
            class="inline-block size-3 rounded-full"
            style:background={s === '?' ? UNKNOWN_SPECIFIER_COLOR : specifierFill(s)}
          ></span>
          <span class="font-mono">{s}</span>{#if s === '?'}<span>unassigned</span>{/if}
        </span>
      {/each}
      <span class="ml-2 inline-flex items-center gap-1.5">
        <span class="inline-block size-3 rounded-full border-2" style:border-color={PHYLUM_COLORS.Firmicutes}></span>
        outer ring = phylum (a separate neutral scale; tips with a different ring are the non-Firmicutes minority)
      </span>
    </div>
    <p class="mt-2 max-w-measure text-caption text-muted">
      An exploratory sequence-similarity map, displayed unrooted: branch positions reflect sequence
      similarity, not ancestry. A long branch is a sequence markedly different from the rest (often a
      non-Firmicutes locus); the dense centre holds many similar ones. Scroll or drag to zoom and pan;
      hover a tip for its locus;
      {selectable
        ? 'click to filter the dashboard by its specifier.'
        : 'click to open its detail page.'}
    </p>
  {/snippet}
</Card>

{#if tip.visible}
  <div
    class="pointer-events-none fixed z-50 rounded-md border border-hairline bg-ink px-2.5 py-1.5 text-caption text-white shadow-md"
    style:left="{tip.x}px"
    style:top="{tip.y}px"
  >
    {#each tip.lines as line, i (i)}
      <div class={i === 0 ? 'font-medium' : 'text-chrome-fg'}>{line}</div>
    {/each}
  </div>
{/if}

<style>
  /* phylotree draws internal/root node circles by default; hide them so only our
     custom specifier tip markers show. Scoped to this view's container. */
  .tv-phylotree :global(g.internal-node circle),
  .tv-phylotree :global(g.root-node circle) {
    display: none;
  }
  /* Empty tip text labels (show-labels:false) leave inert <text> nodes — hide them. */
  .tv-phylotree :global(text.phylotree-node-text) {
    display: none;
  }
</style>
