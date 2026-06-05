<script lang="ts">
  // /cloud — the 3D Stem-I similarity cloud (PLAN /cloud). A WebGL companion to the
  // 2D `/tree` map: the same no-polarity guardrail (NoPolarityBanner) sits above the
  // viewer, which is lazy (three is dynamically imported; cloud.json is lazy-fetched).
  import SimilarityCloud from '../lib/components/SimilarityCloud.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'
</script>

<section class="space-y-4">
  <header>
    <h1 class="text-h1 text-ink">Similarity cloud</h1>
    <p class="mt-1 max-w-measure text-lead text-muted">
      A 3D view of the same Stem I sequence-similarity relationships as the 2D map — embedded so that
      points which sit close together have similar Stem I sequences. A flat 2D layout can only show a
      fraction of that structure (the dense Firmicutes core becomes an unreadable hairball precisely
      because it is not flat); the third dimension recovers more of it. Like the 2D map it is unrooted
      and has no time axis, so nearness means “these sequences resemble each other,” not lineage or
      order of appearance. Use the controls to color and size points by the metadata each locus
      carries, and the spread slider to gently de-pile the crowded core for clicking — a navigation
      aid, never a measurement.
    </p>
  </header>

  <NoPolarityBanner />

  <SimilarityCloud />
</section>
