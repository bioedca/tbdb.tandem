<script lang="ts">
  // Per-locus detail (PLAN §7.2 /locus/:id). At S1.5 this is the BARE-but-real
  // page: the locus's key fields + every element's tbdb.io / NCBI deep-link
  // (PLAN §9 tbdb integration). The full tandem-architecture diagram, element
  // comparison, and in-app RNA land at S2.1/S2.2 — all from the same in-memory
  // members Map (§7.3), with NO per-locus network call. URLs are read straight
  // from members.json, where the build already resolved tbdb (or the NCBI
  // coordinate fallback when a unique_name is missing).
  import { link } from 'svelte-spa-router'
  import { store } from '../lib/stores/filters.svelte'
  import { aaColor, swatchBackground } from '../lib/color'
  import Card from '../lib/components/Card.svelte'
  import Badge from '../lib/components/Badge.svelte'
  import Spinner from '../lib/components/Spinner.svelte'
  import TbdbLink from '../lib/components/TbdbLink.svelte'

  let { params }: { params?: { id?: string } } = $props()
  const id = $derived(params?.id ?? '')

  const locus = $derived(store.loci.find((l) => l.tandem_id === id) ?? null)
  const members = $derived(store.membersByLocus.get(id) ?? [])
  const membersLoading = $derived(store.membersStatus !== 'ready')

  /** Ordinal → biological position label (PLAN §5.1 transcript-5′ → 3′). */
  function ordinalLabel(ordinal: number, n: number): string {
    if (ordinal === 1) return "5′ (1)"
    if (ordinal === n) return "3′ (" + ordinal + ")"
    return "mid (" + ordinal + ")"
  }

  function fmt(value: number | null | undefined, suffix = ''): string {
    return value === null || value === undefined ? '—' : value + suffix
  }
</script>

<section class="space-y-5">
  <a use:link href="/browse" class="inline-flex items-center gap-1 text-small text-brand hover:text-brand-strong">
    <svg viewBox="0 0 16 16" class="size-3.5" aria-hidden="true">
      <path d="M10 3.5L5.5 8l4.5 4.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    Back to browse
  </a>

  {#if !locus}
    <Card>
      <p class="text-body text-muted">
        No locus <span class="font-mono text-ink">{id || '—'}</span> found.
        <a use:link href="/browse" class="text-brand hover:text-brand-strong">Browse all 470 loci.</a>
      </p>
    </Card>
  {:else}
    <!-- Header: identity + at-a-glance chips -->
    <header class="space-y-2">
      <div class="flex flex-wrap items-center gap-3">
        <h1 class="text-h1 font-mono text-ink">{locus.tandem_id}</h1>
        <span class="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface px-2 py-0.5 text-small">
          <span
            class="size-3 rounded-sm ring-1 ring-ink/10"
            style:background={swatchBackground(locus.specifier_aa)}
            aria-hidden="true"
          ></span>
          <span class="font-mono font-medium text-ink">{locus.specifier_aa ?? '?'}</span>
          <span class="text-muted">· {locus.same_specifier ? 'same' : 'mixed'}</span>
        </span>
        {#if locus.confidence}
          <Badge variant={locus.confidence === 'high' ? 'high' : 'low'} />
        {/if}
        <span class="rounded-sm border border-hairline bg-surface px-2 py-0.5 text-small text-muted">
          {locus.type}
        </span>
        <span class="rounded-sm border border-hairline bg-surface px-2 py-0.5 text-small text-muted">
          {locus.n_cores} cores
        </span>
      </div>
      <p class="text-body text-body">
        {locus.organism ?? '—'}
        {#if locus.phylum}<span class="text-muted"> · {locus.phylum}</span>{/if}
      </p>
    </header>

    <!-- Locus key fields -->
    <Card title="Locus">
      <dl class="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Accession</dt>
          <dd class="font-mono text-small text-ink">{locus.accession}</dd>
        </div>
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Strand</dt>
          <dd class="font-mono text-small text-ink">{locus.strand}</dd>
        </div>
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Function class</dt>
          <dd class="text-small text-ink">
            {locus.func_class}{#if locus.func_source === 'text'}<span title="Inferred from downstream-protein text (not EC)">*</span>{/if}
          </dd>
        </div>
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Downstream gene</dt>
          <dd class="text-small text-ink">{locus.downstream_gene ?? '—'}</dd>
        </div>
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Mean %id</dt>
          <dd class="font-mono text-small text-ink">{locus.mean_pairwise_identity === null ? '—' : locus.mean_pairwise_identity.toFixed(1)}</dd>
        </div>
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Complete cores</dt>
          <dd class="font-mono text-small text-ink">{fmt(locus.n_complete_cores)}</dd>
        </div>
        <div>
          <dt class="text-caption uppercase tracking-wide text-muted">Core span</dt>
          <dd class="font-mono text-small text-ink">{fmt(locus.core_span, ' bp')}</dd>
        </div>
      </dl>
    </Card>

    <!-- Elements: per-member fields + tbdb / NCBI deep-links (§9) -->
    <Card title="Elements ({locus.n_cores})" subtitle="Biological 5′ → 3′ order">
      {#if membersLoading}
        <Spinner label="Loading elements…" />
      {:else if members.length === 0}
        <p class="text-small text-muted">No element data for this locus.</p>
      {:else}
        <ul class="space-y-3">
          {#each members as m (m.member_id)}
            <li class="rounded-md border border-hairline bg-surface-subtle p-3">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span class="font-mono text-caption font-medium text-muted">{ordinalLabel(m.ordinal, members.length)}</span>
                <span class="inline-flex items-center gap-1.5">
                  <span class="size-3 rounded-sm ring-1 ring-ink/10" style:background={aaColor(m.specifier.aa)} aria-hidden="true"></span>
                  <span class="font-mono font-medium text-ink">{m.specifier.aa ?? '?'}</span>
                  {#if m.specifier.codon}<span class="font-mono text-caption text-muted">{m.specifier.codon}</span>{/if}
                </span>
                {#if m.trna}<span class="font-mono text-caption text-muted">tRNA {m.trna}</span>{/if}
                {#if m.completeness}<span class="text-caption text-muted">{m.completeness}</span>{/if}
                <span class="font-mono text-caption text-muted">ΔΔG {fmt(m.deltadelta_g)}</span>
                <span class="ml-auto flex items-center gap-3 text-small">
                  {#if m.tbdb_url}
                    <TbdbLink href={m.tbdb_url} title="tbdb.io entry for {m.unique_name}">
                      tbdb.io{#if m.unique_name}<span class="text-muted"> / {m.unique_name}</span>{/if}
                    </TbdbLink>
                  {/if}
                  <TbdbLink href={m.ncbi_url} title="NCBI Nucleotide (coordinate fallback)">NCBI</TbdbLink>
                </span>
              </div>
              {#if m.downstream.protein}
                <p class="mt-1.5 text-caption text-muted">
                  Downstream: {m.downstream.protein}
                  {#if m.downstream.func_source === 'text'}
                    <Badge variant="inferred" />
                  {/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </Card>

    <p class="text-caption text-muted">
      Tandem architecture, element comparison, and in-app RNA structure arrive in Phase 2.
    </p>
  {/if}
</section>
