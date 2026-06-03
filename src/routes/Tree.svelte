<script lang="ts">
  // /tree — the sequence-similarity map (PLAN §9④, §6). S3.1 stands up the viewer;
  // the persistent NoPolarityBanner + dashboard cross-filter land at S3.2.
  import PhyloTree from '../lib/components/PhyloTree.svelte'
</script>

<section class="space-y-4">
  <header>
    <h1 class="text-h1 text-ink">Similarity map</h1>
    <p class="mt-1 max-w-3xl text-small text-muted">
      The real, sequence-derived Stem-I tree of the tandem T-box elements — an exploratory
      similarity map, displayed unrooted. Branch positions reflect sequence similarity, not
      ancestry. Switch between the per-locus and per-element views, the main Stem-I tree and the
      antiterminator-core fallback tree, fade weakly-supported branches, and isolate the
      non-Firmicutes outliers.
    </p>
  </header>

  <PhyloTree />
</section>
