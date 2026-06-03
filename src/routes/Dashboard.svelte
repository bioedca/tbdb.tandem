<script lang="ts">
  // Dashboard — the centerpiece (PLAN §9). The KPI strip, the three viz panels
  // (specificity bar + symmetric matrix, specifier×phylum heatmap, operon
  // breakdown + Sankey), the sequence-similarity tree, and the faceted table all
  // share ONE cross-filter store (§7.3): selecting a value in any panel narrows
  // every other panel + the table live (S2.6/S3.2). The tree panel (S3.2) RESPONDS
  // to the shared selection (dims loci outside it) and SELECTS by specifier on a
  // tip click. The KPI strip stays the dataset overview (470/949/488 are fixed
  // facts, §3.1); the live selection count lives in the table toolbar.
  import KpiStrip from '../lib/components/KpiStrip.svelte'
  import SpecificityChart from '../lib/components/SpecificityChart.svelte'
  import SpecPhylumHeatmap from '../lib/components/SpecPhylumHeatmap.svelte'
  import OperonBreakdown from '../lib/components/OperonBreakdown.svelte'
  import PhyloTree from '../lib/components/PhyloTree.svelte'
  import FacetTable from '../lib/components/FacetTable.svelte'
</script>

<section class="space-y-6">
  <header>
    <h1 class="text-h1 text-ink">Dashboard</h1>
    <p class="mt-1 text-small text-muted">
      Explore the 470 tandem T-box loci. Filter once — every panel and the table share a single
      cross-filter state, so a selection in any chart narrows the whole dashboard live.
    </p>
  </header>

  <KpiStrip />

  <SpecificityChart />

  <SpecPhylumHeatmap />

  <OperonBreakdown />

  <PhyloTree selectable height="52vh" />

  <FacetTable height="56vh" />
</section>
