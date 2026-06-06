<script lang="ts">
  // Browse — the full-screen faceted table + CSV export (PLAN §7.2). All filtering
  // lives in the shared cross-filter store (§7.3) via FacetTable.
  import FacetTable from '../lib/components/FacetTable.svelte'
  import PageHeader from '../lib/components/PageHeader.svelte'
</script>

<section class="space-y-6">
  <!-- Masthead (PLAN §8): shared PageHeader — kicker, fitText hero, measure-capped lead. -->
  <PageHeader kicker="Data table" title="Browse">
    <p class="max-w-measure text-lead text-muted">
      All 470 tandem T-box loci: sort any column, stack facet filters, search, and export the
      current selection as CSV. Click a row for its locus detail.
    </p>
  </PageHeader>

  <FacetTable height="clamp(26rem, 72vh, 56rem)" />
</section>
