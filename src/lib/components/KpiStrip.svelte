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
  <!-- The KPI strip reads as ONE instrument panel, not six floating cards: the cells sit on
       the raised surface and are split only by the grid's 1px hairline gaps (`gap-px` over a
       `bg-hairline` track). The `lg:grid-cols-6` grid is the visual-regression anchor. -->
  <div class="overflow-hidden rounded-panel border border-hairline shadow-md">
  <div class="grid grid-cols-2 gap-px bg-hairline sm:grid-cols-3 lg:grid-cols-6">
    <Kpi label="Loci" value={s.counts.loci} hint="tandem T-box loci" term="locus" />
    <Kpi label="Members" value={s.counts.members} hint="individual T-box elements" term="element" />
    <Kpi
      label="Intra-locus pairs"
      value={s.counts.intra_locus_pairs}
      hint="element pairs within a locus"
      term="intra_locus_pair"
    />
    <Kpi
      label="Triples"
      value={s.counts.triples}
      hint="3-element loci · {s.counts.pairs} are pairs"
      tip="A triple is a locus with three T-box elements. {s.counts.triples} of the {s.counts
        .loci} loci are triples; the other {s.counts.pairs} are pairs (two elements)."
    />
    <Kpi
      label="Mixed specifier"
      value={s.specifier_agreement.mixed}
      hint="elements differ · {s.specifier_agreement.same} share one"
      term="same_mixed"
    />
    <Kpi
      label="Non-Firmicutes"
      value={s.counts.non_firmicutes}
      hint="loci outside Firmicutes"
      term="non_firmicutes"
    />
  </div>
  </div>
{/if}
