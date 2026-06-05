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
  import SpecificityChart from '../lib/components/SpecificityChart.svelte'
  import SpecPhylumHeatmap from '../lib/components/SpecPhylumHeatmap.svelte'
  import OperonBreakdown from '../lib/components/OperonBreakdown.svelte'
  import PhyloTree from '../lib/components/PhyloTree.svelte'
  import FacetTable from '../lib/components/FacetTable.svelte'
</script>

<section class="space-y-6">
  <header>
    <h1 class="text-h1 text-ink">Dashboard</h1>
    <!-- Intro reads as a fluid LEAD (text-lead scales ≈15→19px) capped at the shared
         reading measure, so each column holds a comfortable line-length and WIDENS
         with the font instead of locking to an arbitrary 768px. On wide screens the
         two paragraphs sit side by side to use the horizontal canvas; they stack
         below xl. (Coherent-readability system — see app.css `--container-measure`.) -->
    <div class="mt-2 grid gap-x-10 gap-y-2 xl:grid-cols-2">
      <p class="max-w-measure text-lead text-body">
        A <strong class="font-medium text-ink">T-box riboswitch</strong> is a regulatory RNA in a bacterial
        mRNA leader that senses whether its cognate tRNA is charged with its amino acid, switching the
        downstream gene on when that amino acid is scarce. A
        <strong class="font-medium text-ink">tandem</strong> locus stacks two or more T-box elements in one
        leader — this explorer covers all 470 such loci.
      </p>
      <p class="max-w-measure text-lead text-muted">
        Filter once: every panel and the table update together, so a selection in any chart
        narrows the whole dashboard live. New here? Start with
        <a
          use:link
          href="/about"
          class="text-brand underline decoration-brand/30 underline-offset-2 hover:text-brand-strong"
          >About &amp; method</a
        > for what a tandem T-box locus is and how these 470 loci were detected.
      </p>
    </div>
  </header>

  <KpiStrip />

  <SpecificityChart />

  <SpecPhylumHeatmap />

  <OperonBreakdown />

  <PhyloTree selectable height="clamp(22rem, 52vh, 40rem)" />

  <FacetTable height="clamp(24rem, 56vh, 44rem)" />
</section>
