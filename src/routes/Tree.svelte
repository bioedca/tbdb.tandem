<script lang="ts">
  // /tree — the sequence-similarity map (PLAN §9④, §6). The persistent
  // NoPolarityBanner (§6/§8.1/§13) sits above the viewer as the standing
  // no-polarity guardrail; the dashboard cross-filter is wired in PhyloTree (S3.2).
  import PhyloTree from '../lib/components/PhyloTree.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'
</script>

<section class="space-y-4">
  <header>
    <h1 class="text-h1 text-ink">Similarity map</h1>
    <p class="mt-1 max-w-3xl text-small text-muted">
      An unrooted map that groups the tandem T-box elements by how alike their Stem-I sequences are —
      Stem I being the part of the RNA that carries the specifier codon and contacts the tRNA. It has
      no time axis and no outgroup, so a cluster means “these sequences resemble each other,” not a
      lineage or order of appearance — branch positions reflect sequence similarity, not ancestry. Use
      the controls to switch per-locus vs per-element, the main vs fallback tree, fade weakly-supported
      branches, and isolate the non-Firmicutes minority.
    </p>
  </header>

  <NoPolarityBanner />

  <PhyloTree />
</section>
