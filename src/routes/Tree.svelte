<script lang="ts">
  // /tree — the sequence-similarity map (PLAN §9④, §6). The persistent
  // NoPolarityBanner (§6/§8.1/§13) sits above the viewer as the standing
  // no-polarity guardrail; the dashboard cross-filter is wired in PhyloTree (S3.2).
  import PhyloTree from '../lib/components/PhyloTree.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'
  import PageHeader from '../lib/components/PageHeader.svelte'
</script>

<section class="space-y-6">
  <!-- Masthead (PLAN §8): shared PageHeader — kicker, fitText hero, measure-capped lead. -->
  <PageHeader kicker="Sequence similarity" title="Similarity map">
    <p class="max-w-measure text-lead text-muted">
      An unrooted map that groups the tandem T-box riboswitches by how alike their Stem I sequences are,
      Stem I being the part of the RNA that carries the specifier codon, which base-pairs the cognate
      tRNA's anticodon to set the amino acid the riboswitch senses. It has no time axis and no outgroup,
      so a cluster means “these sequences resemble each other,” not a lineage or order of appearance:
      branch positions reflect sequence similarity, not ancestry. Use the controls to switch between the
      per-locus and per-element views, swap the main tree for the alternate (fallback) tree, fade
      weakly-supported branches, and isolate the non-Firmicutes minority.
    </p>
  </PageHeader>

  <NoPolarityBanner />

  <PhyloTree />
</section>
