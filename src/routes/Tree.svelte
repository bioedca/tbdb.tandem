<script lang="ts">
  // /tree — the sequence-similarity map (PLAN §9④, §6). The persistent
  // NoPolarityBanner (§6/§8.1/§13) sits above the viewer as the standing
  // no-polarity guardrail; the dashboard cross-filter is wired in PhyloTree (S3.2).
  import PhyloTree from '../lib/components/PhyloTree.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'
  import { fitText } from '../lib/actions/fitText'
  import { fitMeasure } from '../lib/actions/fitMeasure'
</script>

<section class="space-y-4">
  <!-- Banner (PLAN §8 responsive): fitText hero title + full-banner-width lead whose
       font `fitMeasure` scales to hold a steady reading measure at every screen width. -->
  <header>
    <h1 use:fitText={{ minPx: 18 }} class="text-hero text-ink">Similarity map</h1>
    <p use:fitMeasure class="mt-1 text-lead text-muted">
      An unrooted map that groups the tandem T-box riboswitches by how alike their Stem I sequences are —
      Stem I being the part of the RNA that carries the specifier codon, which base-pairs the cognate
      tRNA's anticodon to set the amino acid the riboswitch senses. It has no time axis and no outgroup,
      so a cluster means “these sequences resemble each other,” not a lineage or order of appearance —
      branch positions reflect sequence similarity, not ancestry. Use the controls to switch between the
      per-locus and per-element views, swap the main tree for the alternate (fallback) tree, fade
      weakly-supported branches, and isolate the non-Firmicutes minority.
    </p>
  </header>

  <NoPolarityBanner />

  <PhyloTree />
</section>
