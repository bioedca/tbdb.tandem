<script lang="ts">
  // Dashboard KPI strip (PLAN §9, §3.1). Boots from `summary.json` (already in the
  // store after the §7.3 core fetch) and surfaces the load-bearing counts —
  // 470 loci · 949 members · 488 intra-locus pairs (CLAUDE §2) — plus the
  // confidence / specifier-agreement / non-Firmicutes context figures (§3.1).
  // Each tile is the shared `Kpi` surface so the strip inherits the design system.
  import { store } from '../stores/filters.svelte'
  import Kpi from './Kpi.svelte'

  const s = $derived(store.summary)
</script>

{#if s}
  <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
    <Kpi label="Loci" value={s.counts.loci} hint="tandem T-box loci" />
    <Kpi label="Members" value={s.counts.members} hint="canonical cores" />
    <Kpi label="Intra-locus pairs" value={s.counts.intra_locus_pairs} hint="%-identity pairs" />
    <Kpi label="Triples" value={s.counts.triples} hint="{s.counts.pairs} pairs" />
    <Kpi
      label="Mixed specifier"
      value={s.specifier_agreement.mixed}
      hint="{s.specifier_agreement.same} same"
    />
    <Kpi label="Non-Firmicutes" value={s.counts.non_firmicutes} hint="outlier loci" />
  </div>
{/if}
