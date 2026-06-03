<script lang="ts">
  // Faceted table of all 470 loci (PLAN §7.1 Tabulator 6, §9, §2.1).
  //
  // The cross-filter store (§7.3) is the single source of truth: the facet
  // disclosures, the search box, and the active-filter chips all mutate `store`,
  // and Tabulator renders `store.selected` (the `ALL.filter(...)` selection) —
  // never its own internal filters. That keeps ONE shared filter state so the same
  // selection drives the dashboard's viz panels (wired at S2.6). Tabulator owns
  // column SORT, virtual rendering, and CSV export; row click → the detail page.
  import { onMount } from 'svelte'
  import { push } from 'svelte-spa-router'
  import { TabulatorFull as Tabulator } from 'tabulator-tables'
  import type { CellComponent, ColumnDefinition } from 'tabulator-tables'
  import 'tabulator-tables/dist/css/tabulator.min.css'

  import { store, FACET_KEYS } from '../stores/filters.svelte'
  import { FACET_FIELD, type FacetKey, type Locus } from '../data/types'
  import { swatchBackground } from '../color'
  import FacetChip from './FacetChip.svelte'
  import Button from './Button.svelte'

  let { height = '70vh' }: { height?: string } = $props()

  // ── Facet UI metadata ─────────────────────────────────────────────────────────

  const FACET_LABEL: Record<FacetKey, string> = {
    specifier: 'Specifier',
    phylum: 'Phylum',
    type: 'Type',
    confidence: 'Confidence',
    func_class: 'Function class',
  }

  /** Facet value vocabularies from `loci.json` (specifier is frequency-desc; §5.2). */
  const facetValues = $derived(store.facets)

  /** Total locus count per facet value (over all 470), shown beside each option. */
  const facetCounts = $derived.by(() => {
    const out: Record<FacetKey, Map<string, number>> = {
      specifier: new Map(),
      phylum: new Map(),
      type: new Map(),
      confidence: new Map(),
      func_class: new Map(),
    }
    for (const locus of store.loci) {
      for (const facet of FACET_KEYS) {
        const value = locus[FACET_FIELD[facet]] as string | null
        if (value == null) continue
        const m = out[facet]
        m.set(value, (m.get(value) ?? 0) + 1)
      }
    }
    return out
  })

  // ── Tabulator cell helpers (custom formatters return HTML → escape data) ────────

  function esc(value: unknown): string {
    return String(value).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
    )
  }

  function textOrDash(cell: CellComponent): string {
    const v = cell.getValue()
    return v === null || v === undefined || v === '' ? '—' : esc(v)
  }

  /** Specifier cell: a data-color swatch (two-tone for mixed loci) + the label. */
  function specifierCell(cell: CellComponent): string {
    const v = cell.getValue() as string | null
    const bg = swatchBackground(v) // handles null / `?` (grey) / mixed (two-tone)
    return `<span class="tv-cell-spec"><span class="tv-swatch" style="background:${bg}"></span>${esc(v ?? '?')}</span>`
  }

  /** Function class, with the `*` marker for text-inferred classes (§5.3). */
  function funcCell(cell: CellComponent): string {
    const d = cell.getData() as Locus
    return esc(d.func_class) + (d.func_source === 'text' ? '*' : '')
  }

  // Fixed string literals (no data interpolation) → no HTML escaping needed here.
  function agreementCell(cell: CellComponent): string {
    return cell.getValue() ? 'same' : 'mixed'
  }

  function pctCell(cell: CellComponent): string {
    const v = cell.getValue()
    return v === null || v === undefined ? '—' : Number(v).toFixed(1)
  }

  const columns: ColumnDefinition[] = [
    { title: 'Locus', field: 'tandem_id', width: 92, cssClass: 'tv-id', sorter: 'string' },
    { title: 'Organism', field: 'organism', widthGrow: 3, minWidth: 180, formatter: textOrDash },
    { title: 'Phylum', field: 'phylum', width: 132, formatter: textOrDash },
    { title: 'Specifier', field: 'specifier_aa', width: 132, sorter: 'string', formatter: specifierCell },
    { title: 'Cores', field: 'n_cores', width: 74, hozAlign: 'center', sorter: 'number', cssClass: 'tv-mono' },
    { title: 'Agreement', field: 'same_specifier', width: 110, sorter: 'boolean', formatter: agreementCell },
    { title: 'Confidence', field: 'confidence', width: 116, formatter: textOrDash },
    { title: 'Function', field: 'func_class', width: 150, sorter: 'string', formatter: funcCell },
    {
      title: 'Mean %id',
      field: 'mean_pairwise_identity',
      width: 110,
      hozAlign: 'right',
      sorter: 'number',
      cssClass: 'tv-mono',
      formatter: pctCell,
    },
    { title: 'Accession', field: 'accession', width: 140, sorter: 'string', cssClass: 'tv-mono' },
  ]

  // ── Tabulator lifecycle + store-driven data sync ────────────────────────────────

  let containerEl: HTMLDivElement
  let table: Tabulator | undefined
  let built = $state(false)

  onMount(() => {
    table = new Tabulator(containerEl, {
      data: store.selected,
      index: 'tandem_id',
      layout: 'fitColumns',
      height,
      columns,
      placeholder: 'No loci match the current filters.',
      columnDefaults: { headerHozAlign: 'left', resizable: false },
      movableColumns: false,
    })
    table.on('tableBuilt', () => {
      built = true
    })
    // Row → locus detail (`@types` exposes rowClick via `on`, not as an option).
    table.on('rowClick', (_e, row) => {
      push(`/locus/${(row.getData() as Locus).tandem_id}`)
    })
    return () => {
      table?.destroy()
      table = undefined
      built = false
    }
  })

  // Re-feed Tabulator whenever the cross-filtered selection changes (§7.3). The
  // `built` guard avoids `replaceData` before Tabulator finishes its async build.
  $effect(() => {
    const rows = store.selected
    if (built && table) table.replaceData(rows).catch(() => {})
  })

  function exportCsv(): void {
    table?.download('csv', 'tandemview-loci.csv')
  }
</script>

<div class="space-y-4">
  <!-- Filter bar: free-text search + a disclosure per facet (PLAN §2.1, §7.3) -->
  <div class="flex flex-wrap items-start gap-2">
    <label class="relative">
      <span class="sr-only">Search loci</span>
      <input
        type="search"
        placeholder="Search loci…"
        value={store.filter.search}
        oninput={(e) => store.setSearch(e.currentTarget.value)}
        class="w-64 rounded-md border border-hairline bg-surface px-3 py-1.5 text-small text-ink placeholder:text-muted"
      />
    </label>

    {#each FACET_KEYS as facet (facet)}
      {@const active = store.filter[facet].size}
      <details class="tv-facet group relative">
        <summary
          class="flex cursor-pointer list-none items-center gap-1.5 rounded-md border px-3 py-1.5 text-small transition-colors duration-150 ease-standard
          {active > 0
            ? 'border-brand/40 bg-brand-subtle text-brand-strong'
            : 'border-hairline bg-surface text-body hover:bg-surface-subtle'}"
        >
          <span class="font-medium">{FACET_LABEL[facet]}</span>
          {#if active > 0}
            <span
              class="grid min-w-4 place-items-center rounded-sm bg-brand px-1 text-caption font-semibold text-white"
              >{active}</span
            >
          {/if}
          <svg viewBox="0 0 12 12" class="size-3 text-muted" aria-hidden="true">
            <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </summary>
        <div
          class="absolute z-10 mt-1 max-h-72 w-60 overflow-auto rounded-md border border-hairline bg-surface p-1 shadow-lg"
          role="group"
          aria-label="{FACET_LABEL[facet]} filter"
        >
          {#each facetValues?.[facet] ?? [] as value (value)}
            <label
              class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-small hover:bg-surface-subtle"
            >
              <input
                type="checkbox"
                class="accent-brand"
                checked={store.isActive(facet, value)}
                onchange={() => store.toggleFacet(facet, value)}
              />
              {#if facet === 'specifier'}
                <span
                  class="size-3 shrink-0 rounded-sm ring-1 ring-ink/10"
                  style:background={swatchBackground(value)}
                  aria-hidden="true"
                ></span>
              {/if}
              <span class="flex-1 truncate text-body" class:font-mono={facet === 'specifier'}>{value}</span>
              <span class="text-caption tabular-nums text-muted">{facetCounts[facet].get(value) ?? 0}</span>
            </label>
          {/each}
        </div>
      </details>
    {/each}
  </div>

  <!-- Active filter chips + the removable cross-filter state (PLAN §8.5) -->
  {#if store.isFiltered}
    <div class="flex flex-wrap items-center gap-2">
      {#each store.activeFilters as f (f.facet + ':' + f.value)}
        <FacetChip
          label={FACET_LABEL[f.facet]}
          value={f.value}
          swatch={f.facet === 'specifier' ? swatchBackground(f.value) : undefined}
          onremove={() => store.toggleFacet(f.facet, f.value)}
        />
      {/each}
      <Button variant="ghost" onclick={() => store.reset()}>Clear all</Button>
    </div>
  {/if}

  <!-- Toolbar: result count + CSV export (PLAN §2.1) -->
  <div class="flex items-center justify-between gap-4">
    <p class="text-small text-muted">
      Showing <strong class="font-mono tabular-nums text-ink">{store.selected.length}</strong>
      of <span class="font-mono tabular-nums">{store.loci.length}</span> loci
    </p>
    <Button variant="ghost" onclick={exportCsv} title="Download the current selection as CSV">
      Export CSV
    </Button>
  </div>

  <!-- The Tabulator table (PLAN §7.1). Styled to the design tokens below. -->
  <div class="tv-table overflow-hidden rounded-panel border border-hairline bg-surface shadow-sm">
    <div bind:this={containerEl}></div>
  </div>
</div>

<style>
  /* Tabulator renders its DOM dynamically (outside Svelte's compile-time scope), so
     the overrides below target it via :global, anchored to the .tv-table wrapper.
     Colors/fonts read the §8 design tokens (the @theme custom properties). */
  :global(.tv-table .tabulator) {
    font-family: var(--font-sans);
    font-size: 0.875rem;
    border: none;
    background: var(--color-surface);
  }
  :global(.tv-table .tabulator .tabulator-header) {
    background: var(--color-surface-subtle);
    border-bottom: 1px solid var(--color-hairline);
    color: var(--color-ink);
    font-weight: 600;
  }
  :global(.tv-table .tabulator .tabulator-header .tabulator-col) {
    background: transparent;
    border-right: none;
  }
  /* Anchor BOTH row parities to the surface token (don't rely on Tabulator's
     default #fff) so the flat look survives a surface re-theme. */
  :global(.tv-table .tabulator-row) {
    border-bottom: 1px solid var(--color-hairline);
    background: var(--color-surface);
    cursor: pointer;
    /* List fade/reflow (§8.4): rows the cross-filter brings into view ease in, so a
       narrow reads as live. Opacity-only + brief so it stays calm under Tabulator's
       virtual scroll. The global prefers-reduced-motion rule (app.css) neutralizes
       it. `-global-` keeps the keyframes name un-scoped so the :global rule matches. */
    animation: tv-row-in 150ms var(--ease-standard) both;
  }
  @keyframes -global-tv-row-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  :global(.tv-table .tabulator-row:hover) {
    background: var(--color-surface-subtle);
  }
  :global(.tv-table .tabulator-cell) {
    border-right: none;
    color: var(--color-body);
  }
  :global(.tv-table .tv-id) {
    font-family: var(--font-mono);
    font-weight: 500;
    color: var(--color-brand);
  }
  :global(.tv-table .tv-mono) {
    font-family: var(--font-mono);
  }
  :global(.tv-table .tv-cell-spec) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  :global(.tv-table .tv-swatch) {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-ink) 12%, transparent);
    flex: 0 0 auto;
  }

  /* Native <details> facet menu: hide the default marker, keep it above the table. */
  .tv-facet > summary::-webkit-details-marker {
    display: none;
  }
  .tv-facet[open] {
    z-index: 20;
  }
</style>
