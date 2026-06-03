<script lang="ts">
  // /about — the method note (PLAN §7.2 /about route, §14, §2/§3.1, §6, §11.4/§8;
  // a Phase-3 deliverable, S3.3).
  // Documents how the 470 tandem loci are detected, the data caveats
  // (contamination drop, corrupt-codon specifier source, kept-and-flagged
  // low-confidence loci, near-monochrome taxonomy), the no-polarity disclaimer for
  // the similarity map (§6 — the tree is NOT a phylogeny / ancestral-state
  // reconstruction), the offline cluster build, and the TBDB provenance + citation
  // (CC-BY). The per-page "Data: TBDB" footer (§11.4/§8) is app-wide in App.svelte.
  //
  // NO-POLARITY (§6/§13, a ship gate): nothing here may imply evolutionary
  // direction — no ancestral / redeployed / abandoned / gained / lost language.
  import { link } from 'svelte-spa-router'
  import { store } from '../lib/stores/filters.svelte'
  import Card from '../lib/components/Card.svelte'
  import TbdbLink from '../lib/components/TbdbLink.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'

  const s = $derived(store.summary)
  // Read the contextual figures off the live distributions so the prose never
  // drifts from the committed build (the §3.1 counts are the single source).
  const firmicutes = $derived(
    s?.distributions.phylum.find((d) => d.value === 'Firmicutes')?.count ?? null,
  )
  const unknownLoci = $derived(
    s?.distributions.specifier.find((d) => d.value === '?')?.count ?? null,
  )
</script>

{#snippet code(text: string)}
  <code class="rounded bg-surface-subtle px-1 py-0.5 font-mono text-[0.85em] text-ink"
    >{text}</code
  >
{/snippet}

{#snippet stat(value: string | number, label: string)}
  <div
    class="flex flex-col rounded-md border border-hairline bg-surface-subtle px-3 py-2 text-center"
  >
    <span class="font-mono text-h2 text-ink">{value}</span>
    <span class="text-caption text-muted">{label}</span>
  </div>
{/snippet}

<section class="space-y-6">
  <header>
    <h1 class="text-h1 text-ink">About &amp; method</h1>
    <p class="mt-1 max-w-3xl text-small text-muted">
      How the tandem T-box loci shown here are detected, the caveats that govern every view, why the
      similarity map is not a phylogeny, and where the data come from.
    </p>
  </header>

  <Card title="What this is">
    <div class="max-w-3xl space-y-3">
      <p>
        A <strong class="font-medium text-ink">T-box riboswitch</strong> is a regulatory RNA in the 5′
        leader of a bacterial mRNA. It binds one specific tRNA and senses whether that tRNA is charged
        with its amino acid: when the amino acid is scarce (the tRNA is uncharged), the T-box switches
        its downstream gene <strong class="font-medium text-ink">on</strong>. The amino acid each T-box
        responds to is its <em>specifier</em>. A <strong class="font-medium text-ink">tandem</strong> locus
        stacks two or more complete T-box units in the same leader, regulating the same downstream gene
        or operon.
      </p>
      <p>
        TandemView is a companion to {@render code('tbdb.io')} that owns the
        <em>tandem-level</em> story of T-box riboswitches — stacked-element architecture, specificity
        pairing, regulated-operon coupling, and a sequence-similarity map. It never re-implements
        the single-element views in tbdb.io; instead every element deep-links back to its canonical
        tbdb.io entry for the structure render, genome browser, and tRNA pairing.
      </p>
      {#if s}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {@render stat(s.counts.loci, 'tandem loci')}
          {@render stat(s.counts.members, 'T-box elements')}
          {@render stat(s.counts.intra_locus_pairs, 'intra-locus pairs')}
          {@render stat(`${s.counts.pairs} + ${s.counts.triples}`, 'pairs + triples')}
          {@render stat(`${s.confidence.high} / ${s.confidence.low}`, 'high / low confidence')}
          {@render stat(s.counts.non_firmicutes, 'non-Firmicutes')}
        </div>
      {/if}
    </div>
  </Card>

  <Card
    title="How the 470 loci are detected"
    subtitle="The locus-detection pipeline that produced this dataset — it runs upstream of TandemView."
  >
    <div class="max-w-3xl space-y-3">
      <p>
        The tandem loci are derived from the TBDB master table by a deterministic pipeline. The math
        is consistent with the ≈470 tandem estimate of Vitreschak et&nbsp;al. (2008).
      </p>
      <ol class="list-decimal space-y-2 pl-5 marker:font-medium marker:text-muted">
        <li>
          Drop the 24 confirmed non-bacterial contaminant rows (phylum ∈ {@render code(
            'Arthropoda, Ascomycota, Nematoda, Streptophyta',
          )}) before the join.
        </li>
        <li>
          Assign each T-box's strand from its coordinate order and project each one's genomic 5′ start
          (the {@render code('core5')} anchor), so cores can be ordered along the leader.
        </li>
        <li>
          Group cores on the same {@render code('(accession, strand)')} into one locus whenever a core
          sits within 600&nbsp;bp of another in the group (single-linkage clustering — chaining nearby
          cores). This is the locus-detection step.
        </li>
        <li>
          Collapse cores within 60&nbsp;bp to one representative per physical core, keeping the best
          row (complete &gt; has a start codon &gt; has a {@render code('unique_name')} &gt; lowest
          E-value).
        </li>
        <li>
          Keep a window as a tandem locus when it holds ≥2 distinct cores that share a gene ID
          <em>or</em> a specifier amino acid; mark it high-confidence when ≥2 of those cores are complete.
        </li>
      </ol>
      <p class="text-small text-muted">
        This yields {s ? s.counts.loci : 470} loci and exactly {s ? s.counts.members : 949} T-box
        elements — one representative row per physical T-box core (duplicate annotation rows are
        collapsed); the intra-locus pairwise %-identity payload covers {s
          ? s.counts.intra_locus_pairs
          : 488} pairs.
      </p>
    </div>
  </Card>

  <Card
    title="Data caveats"
    subtitle="Read these before drawing conclusions from any panel."
  >
    <div class="max-w-3xl">
      <dl class="space-y-4">
        <div>
          <dt class="font-medium text-ink">Contamination is dropped first.</dt>
          <dd class="mt-0.5 text-muted">
            24 confirmed non-bacterial rows (phyla Arthropoda, Ascomycota, Nematoda, Streptophyta) are
            removed before the join, so they never reach a view.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">The raw codon column is corrupt.</dt>
          <dd class="mt-0.5 text-muted">
            Every specifier is read from {@render code('amino_acid_top')} / {@render code(
              'refine_codon_top',
            )}, never the raw {@render code('codon')} field.
            {#if unknownLoci != null}<span
                >{unknownLoci} of the {s?.counts.loci} loci have no confident specifier and are shown
                as “?”.</span
              >{/if}
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">Low-confidence loci are kept and flagged.</dt>
          <dd class="mt-0.5 text-muted">
            {#if s}{s.confidence.low} of {s.counts.loci}{:else}The low-confidence{/if} loci are badged,
            never silently dropped. Filters can hide them — but that is your choice, not an editorial one.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">Taxonomy is near-monochrome.</dt>
          <dd class="mt-0.5 text-muted">
            {#if firmicutes != null}{firmicutes} of {s?.counts.loci}{:else}Most{/if} loci are
            Firmicutes, so phylum carries little color signal. Specifier is the primary color axis, and
            the {s ? s.counts.non_firmicutes : 16} non-Firmicutes loci have a dedicated filter.
          </dd>
        </div>
      </dl>
    </div>
  </Card>

  <Card
    title="The similarity map is not a phylogeny"
    subtitle="A lab standard: no polarity is read from the tips."
  >
    <div class="max-w-3xl space-y-3">
      <NoPolarityBanner />
      <p>
        The tree on the <a
          use:link
          href="/tree"
          class="text-brand underline decoration-brand/30 underline-offset-2">Similarity map</a
        >
        is an exploratory sequence-similarity map for visual grouping. It is <strong>not</strong> an
        ancestral-state reconstruction, and it is decoupled from any formal rooted analysis. Several
        method choices keep it a map rather than a polarity instrument:
      </p>
      <ul class="list-disc space-y-1.5 pl-5 marker:text-muted">
        <li>
          Each leader is structurally aligned to the RF00230 covariance model (Infernal {@render code(
            'cmalign',
          )}), and only the Stem-I consensus columns are used to build the tree.
        </li>
        <li>
          The tree is built with FastTree (GTR + Γ, SH-like local supports) — a quick map, not an
          over-interpretable bootstrap.
        </li>
        <li>
          It is midpoint-rooted for a stable on-screen layout only, and is always displayed
          unrooted (radial). Branch support is a fade/collapse control, not printed numbers; there is
          no time axis and no clock.
        </li>
        <li>
          Elements that pass a Stem-I length-gate form the main tree; degenerate fragments and the few
          Stem-I-less elements route to a separate antiterminator-core fallback tree.
        </li>
      </ul>
      <p class="text-small text-muted">
        The alignment and tree are computed offline on the lab cluster as a single CPU-only batch job;
        only the resulting trees and small JSON enter the repository.
      </p>
    </div>
  </Card>

  <Card title="Provenance &amp; citation">
    <div class="max-w-3xl space-y-3">
      <p>
        All data derive from <TbdbLink href="https://tbdb.io">TBDB (tbdb.io)</TbdbLink>, used under
        the CC-BY license. TandemView adds only the tandem-level views and layout; the underlying
        annotations are TBDB's.
      </p>
      <p class="rounded-md border border-hairline bg-surface-subtle px-4 py-3 text-small">
        Marchand, Pierson Smela, Jordan, Narasimhan &amp; Church (2021). <em
          >TBDB: a database of structurally annotated T-box riboswitch:tRNA pairs.</em
        >
        Nucleic Acids Research 49(D1):D229–D235.
        <TbdbLink href="https://doi.org/10.1093/nar/gkaa721">doi:10.1093/nar/gkaa721</TbdbLink>
      </p>
      <p class="text-small text-muted">
        For citation guidance see <TbdbLink href="https://tbdb.io/citing.html"
          >tbdb.io/citing.html</TbdbLink
        >.
      </p>
    </div>
  </Card>

  <Card title="Glossary">
    <dl class="grid max-w-4xl gap-x-8 gap-y-3 sm:grid-cols-2">
      <div>
        <dt class="font-medium text-ink">Locus / tandem</dt>
        <dd class="text-muted">A genomic window holding ≥2 T-box cores (the 470).</dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Element (core, member)</dt>
        <dd class="text-muted">
          One complete T-box unit — Stem I plus its switch — within a locus (the 949 total). “Core” and
          “member” are used interchangeably for the same unit.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Specifier</dt>
        <dd class="text-muted">
          The amino acid a T-box senses, read from {@render code('amino_acid_top')}.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Stem-I</dt>
        <dd class="text-muted">
          The specifier-presenting structural element; its sequence drives the similarity map.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">WUSS / dot-bracket</dt>
        <dd class="text-muted">
          RNA secondary-structure notations; the Stem-I column is WUSS and converted to dot-bracket.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">{@render code('func_class')}</dt>
        <dd class="text-muted">
          The regulated downstream function (aaRS, biosynthesis, transporter, oxidoreductase, or
          unknown), EC-backed or text-inferred — its provenance is {@render code('func_source')}, and
          text-inferred classes are marked with an asterisk.
        </dd>
      </div>
    </dl>
  </Card>
</section>
