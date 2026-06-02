<script lang="ts">
  // Per-locus detail (PLAN §7.2 /locus/:id). S2.2 wires the full detail flow
  // (PLAN §9): tandem-architecture diagram → element comparison → feature-
  // highlighted member sequences — all from the same in-memory members Map (§7.3)
  // with NO per-locus network call, plus the lazily-loaded intra-locus identity
  // (§7.3) for the comparison's pairwise %-identity. In-app RNA arrives at S2.3.
  // Member URLs are read straight from members.json, where the build already
  // resolved tbdb (or the NCBI coordinate fallback when a unique_name is missing).
  import { link } from 'svelte-spa-router'
  import { store } from '../lib/stores/filters.svelte'
  import { swatchBackground } from '../lib/color'
  import Card from '../lib/components/Card.svelte'
  import Badge from '../lib/components/Badge.svelte'
  import Spinner from '../lib/components/Spinner.svelte'
  import ArchitectureDiagram from '../lib/components/ArchitectureDiagram.svelte'
  import ElementComparison from '../lib/components/ElementComparison.svelte'
  import MemberSequence from '../lib/components/MemberSequence.svelte'

  let { params }: { params?: { id?: string } } = $props()
  const id = $derived(params?.id ?? '')

  const locus = $derived(store.loci.find((l) => l.tandem_id === id) ?? null)
  const members = $derived(store.membersByLocus.get(id) ?? [])
  const membersLoading = $derived(store.membersStatus !== 'ready')

  // Lazily pull identity.json once (idempotent; §7.3 "identity.json lazy on detail
  // pages"), then read this locus's pairwise %-identity rows for the comparison.
  $effect(() => {
    void store.ensureIdentity()
  })
  const pairs = $derived(store.identityByLocus?.get(id) ?? [])

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

    <!-- Detail flow (PLAN §9): architecture → comparison → highlighted sequences.
         Every view reads the in-memory members Map — no per-locus network call. -->
    {#if membersLoading}
      <Card title="Elements ({locus.n_cores})">
        <Spinner label="Loading elements…" />
      </Card>
    {:else if members.length === 0}
      <Card title="Elements ({locus.n_cores})">
        <p class="text-small text-muted">No element data for this locus.</p>
      </Card>
    {:else}
      <!-- ① Tandem architecture (PLAN §9①, the signature view) -->
      <Card
        title="Tandem architecture"
        subtitle="To-scale, biological 5′ → 3′ — each element tinted by its own specifier"
      >
        <ArchitectureDiagram
          {members}
          strand={locus.strand}
          funcClass={locus.func_class}
          funcSource={locus.func_source}
          downstreamGene={locus.downstream_gene}
        />
      </Card>

      <!-- ② Element comparison (PLAN §9①) — per-element metrics, deep links, and the
           intra-locus pairwise %-identity (identity.json, lazily loaded above). -->
      <Card
        title="Element comparison"
        subtitle="Specifier · tRNA · ΔΔG · terminator energy · pairwise identity · deep links"
      >
        <ElementComparison {members} {pairs} />
      </Card>

      <!-- ③ Feature-highlighted member sequences (PLAN §9 detail flow) -->
      <Card title="Member sequences" subtitle="Per-element leader (gap-free) — feature spans highlighted">
        <MemberSequence {members} />
      </Card>

      <p class="text-caption text-muted">In-app RNA secondary structure arrives next (S2.3).</p>
    {/if}
  {/if}
</section>
