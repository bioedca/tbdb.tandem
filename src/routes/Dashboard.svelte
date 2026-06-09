<script lang="ts">
  // Dashboard — the centerpiece (PLAN §9). The KPI strip, the three viz panels
  // (specificity bar + symmetric matrix, specifier×phylum heatmap, operon
  // breakdown + Sankey), the sequence-similarity tree, and the faceted table all
  // share ONE cross-filter store (§7.3): selecting a value in any panel narrows
  // every other panel + the table live (S2.6/S3.2). The tree panel (S3.2) RESPONDS
  // to the shared selection (dims loci outside it) and SELECTS by specifier on a
  // tip click. The KPI strip stays the dataset overview (470/949/488 are fixed
  // facts, §3.1); the live selection count lives in the table toolbar.
  import { link } from 'svelte-spa-router'
  import KpiStrip from '../lib/components/KpiStrip.svelte'
  import TripleLociPanel from '../lib/components/TripleLociPanel.svelte'
  import SpecificityChart from '../lib/components/SpecificityChart.svelte'
  import OperonBreakdown from '../lib/components/OperonBreakdown.svelte'
  import PhyloTree from '../lib/components/PhyloTree.svelte'
  import FacetTable from '../lib/components/FacetTable.svelte'
  import PageHeader from '../lib/components/PageHeader.svelte'
</script>

<section class="space-y-6">
  <!-- Masthead (PLAN §8): the shared PageHeader — kicker, fitText hero, then the LEAD
       (the definition). The smaller helper note is the masthead aside, so it sits
       up-and-right of the lead on a wide screen (filling the otherwise-empty right half)
       and stacks beneath the lead below xl. Prose stays measure-capped, never band-wide. -->
  <PageHeader kicker="Overview" title="Dashboard">
    <p class="max-w-measure text-lead text-body">
      A <strong class="font-medium text-ink">T-box riboswitch</strong> is a regulatory RNA in a bacterial
      mRNA leader that senses whether its cognate tRNA is charged with its amino acid, switching the
      downstream gene on when that amino acid is scarce. A
      <strong class="font-medium text-ink">tandem</strong> locus stacks two or more T-box elements in one
      leader. This explorer covers all 470 such loci.
    </p>
    {#snippet aside()}
      <p class="max-w-measure text-small text-muted">
        Filter once: every panel and the table update together, so a selection in any chart
        narrows the whole dashboard live. New here? Start with
        <a
          use:link
          href="/about"
          class="text-brand underline decoration-brand/30 underline-offset-2 hover:text-brand-strong"
          >About &amp; method</a
        > for what a tandem T-box locus is and how these 470 loci were detected.
      </p>
    {/snippet}
  </PageHeader>

  <KpiStrip />

  <TripleLociPanel />

  <SpecificityChart />

  <OperonBreakdown />

  <PhyloTree selectable height="clamp(22rem, 52vh, 40rem)" />

  <FacetTable height="clamp(24rem, 56vh, 44rem)" />
</section>
