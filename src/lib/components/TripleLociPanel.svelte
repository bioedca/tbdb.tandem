<script lang="ts">
  import { push } from 'svelte-spa-router'
  import { fitText } from '../actions/fitText'
  import { aaColor } from '../color'
  import { store } from '../stores/filters.svelte'
  import { tripleEntries } from '../specificity'
  import Card from './Card.svelte'
  import Spinner from './Spinner.svelte'

  const triples = $derived(
    store.membersStatus === 'ready' ? tripleEntries(store.loci, store.membersByLocus) : [],
  )
  const selectedIds = $derived(new Set(store.selected.map((l) => l.tandem_id)))
  const visibleTriples = $derived(triples.filter((t) => selectedIds.has(t.tandem_id)).length)
  const totalLoci = $derived(store.summary?.counts.loci ?? store.loci.length)
</script>

<Card
  title="Three-element loci"
  subtitle="The nine tandem loci with three T-box elements are shown as their own navigation panel, outside the two-element specificity matrix."
>
  {#if store.membersStatus === 'error'}
    <p class="text-small text-muted">Element data unavailable.</p>
  {:else if store.membersStatus !== 'ready'}
    <div class="grid min-h-32 place-items-center">
      <Spinner label="Loading three-element loci…" />
    </div>
  {:else}
    <div class="grid gap-5 xl:grid-cols-[minmax(12rem,16rem)_1fr]">
      <div class="rounded-md border border-brand/20 bg-brand-subtle/45 px-4 py-4">
        <p class="text-caption font-medium uppercase tracking-wide text-brand">Three-element set</p>
        <p
          use:fitText={{ minPx: 30 }}
          class="mt-1 text-display font-semibold leading-none tabular-nums text-ink"
        >
          {triples.length}
        </p>
        <p class="mt-2 text-small text-body">
          of {totalLoci} tandem loci carry three T-box elements.
        </p>
        {#if store.isFiltered}
          <p class="mt-3 text-caption text-muted">
            {visibleTriples} match the current dashboard filter.
          </p>
        {:else}
          <p class="mt-3 text-caption text-muted">
            Element specifiers are listed in transcript 5′→3′ order.
          </p>
        {/if}
      </div>

      <ul class="grid min-w-0 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {#each triples as t (t.tandem_id)}
          {@const isSelected = selectedIds.has(t.tandem_id)}
          <li>
            <button
              type="button"
              class="grid h-full w-full grid-cols-[auto_1fr] items-start gap-3 rounded-md border border-hairline bg-surface px-3 py-3 text-left shadow-sm transition-colors duration-150 ease-standard hover:border-brand/40 hover:bg-brand-subtle/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              class:opacity-40={store.isFiltered && !isSelected}
              class:ring-2={store.isFiltered && isSelected}
              class:ring-brand={store.isFiltered && isSelected}
              title="{t.organism ?? t.tandem_id}: open locus detail"
              aria-label="Open {t.tandem_id}, three-element locus with specifiers {t.specs.join(', ')}"
              onclick={() => push(`/locus/${t.tandem_id}`)}
            >
              <span class="font-mono text-small font-semibold text-brand">{t.tandem_id}</span>
              <span class="min-w-0">
                <span class="block truncate text-small font-medium text-ink">
                  {t.organism ?? 'unassigned organism'}
                </span>
                <span class="mt-2 flex flex-wrap items-center gap-1.5">
                  {#each t.specs as s, i (i)}
                    <span class="inline-flex items-center gap-1 rounded-sm bg-surface-subtle px-1.5 py-0.5">
                      <span
                        class="size-3 rounded-sm ring-1 ring-ink/10"
                        style:background={aaColor(s)}
                        aria-hidden="true"
                      ></span>
                      <span class="font-mono text-caption text-muted">{i + 1}:{s}</span>
                    </span>
                  {/each}
                </span>
                <span class="mt-2 flex flex-wrap items-center gap-1.5 text-caption text-muted">
                  {#if t.phylum}<span>{t.phylum}</span>{/if}
                  <span>{t.func_class}</span>
                  {#if t.confidence}<span>{t.confidence} confidence</span>{/if}
                </span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</Card>
