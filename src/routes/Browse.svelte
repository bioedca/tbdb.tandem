<script lang="ts">
  // Browse — the full-screen faceted table + CSV export (PLAN §7.2). All filtering
  // lives in the shared cross-filter store (§7.3) via FacetTable.
  import FacetTable from '../lib/components/FacetTable.svelte'
  import { fitText } from '../lib/actions/fitText'
  import { fitMeasure } from '../lib/actions/fitMeasure'
</script>

<section class="space-y-5">
  <!-- Banner (PLAN §8 responsive): the title is a fitText hero (scales to the band,
       never overflows); the lead runs the FULL banner width with `fitMeasure` scaling
       the font so each line holds a steady measure — no narrow ribbon, no empty band. -->
  <header>
    <h1 use:fitText={{ minPx: 18 }} class="text-hero text-ink">Browse</h1>
    <p use:fitMeasure class="mt-1 text-lead text-muted">
      All 470 tandem T-box loci — sort any column, stack facet filters, search, and export the
      current selection as CSV. Click a row for its locus detail.
    </p>
  </header>

  <FacetTable height="clamp(26rem, 72vh, 56rem)" />
</section>
