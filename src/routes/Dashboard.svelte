<script lang="ts">
  // Dashboard — the centerpiece (PLAN §9). At S1.4 it carries the KPI strip + the
  // faceted table over the one shared filter state; the four cross-filtered viz
  // panels land in Phase 2 (S2.x) on the same store.
  import KpiStrip from '../lib/components/KpiStrip.svelte'
  import SpecificityChart from '../lib/components/SpecificityChart.svelte'
  import FacetTable from '../lib/components/FacetTable.svelte'
</script>

<section class="space-y-6">
  <header>
    <h1 class="text-h1 text-ink">Dashboard</h1>
    <p class="mt-1 text-small text-muted">
      Explore the 470 tandem T-box loci. Filter once — the table (and, from Phase 2, every panel)
      shares a single cross-filter state.
    </p>
  </header>

  <KpiStrip />

  <SpecificityChart />

  <FacetTable height="56vh" />
</section>
