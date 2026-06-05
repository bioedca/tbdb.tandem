<script lang="ts">
  // Browse — the full-screen faceted table + CSV export (PLAN §7.2). All filtering
  // lives in the shared cross-filter store (§7.3) via FacetTable.
  import FacetTable from '../lib/components/FacetTable.svelte'
</script>

<section class="space-y-5">
  <header>
    <h1 class="text-h1 text-ink">Browse</h1>
    <p class="mt-1 text-small text-muted">
      All 470 tandem T-box loci — sort any column, stack facet filters, search, and export the
      current selection as CSV. Click a row for its locus detail.
    </p>
  </header>

  <FacetTable height="clamp(26rem, 72vh, 56rem)" />
</section>
