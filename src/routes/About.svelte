<script lang="ts">
  // /about — the method note (PLAN §7.2 /about route, §14, §2/§3.1, §6, §11.4/§8;
  // a Phase-3 deliverable, S3.3).
  // Documents how the tandem T-box database is built (the full Master_tboxes.csv →
  // loci pipeline) and offers a self-contained Python script that reproduces it
  // (public/reproduce_tandem_tbox_db.py, downloaded from the Pages base path), the
  // data caveats (contamination drop, corrupt-codon specifier source, kept-and-flagged
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

  // The self-contained reproduction script ships as a static asset under the
  // Pages base path (committed in public/), so the labmate can download and run
  // it against the public TBDB master table — no clone, no app build.
  const scriptUrl = `${import.meta.env.BASE_URL}reproduce_tandem_tbox_db.py`
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
      How the tandem T-box loci shown here are detected, the caveats behind every view, why the
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
        tbdb.tandem is a companion to {@render code('tbdb.io')} that owns the
        <em>tandem-level</em> story of T-box riboswitches — stacked-element architecture, specifier–tRNA
        pairing, shared-operon regulation, and a sequence-similarity map. It never re-implements
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
    title="How the database is built"
    subtitle="From the raw TBDB master table to the loci shown here — every step is deterministic and scriptable."
  >
    <div class="max-w-3xl space-y-3">
      <p>
        The entire dataset is derived from a <strong class="font-medium text-ink">single public
        source file</strong> — the TBDB master table ({@render code('Master_tboxes.csv')}, ≈23,500
        annotated T-box rows). A deterministic pipeline turns it into the loci, elements, and pairings
        on every panel. The resulting count agrees with the ≈470 tandem estimate of
        Vitreschak et&nbsp;al. (2008).
      </p>
      <ol class="list-decimal space-y-2 pl-5 marker:font-medium marker:text-muted">
        <li>
          <strong class="font-medium text-ink">Drop contamination.</strong> 24 non-bacterial rows
          (phylum ∈ {@render code('Arthropoda, Ascomycota, Nematoda, Streptophyta')}) are removed
          before anything else, so they never reach a locus.
        </li>
        <li>
          <strong class="font-medium text-ink">Orient each T-box.</strong> Strand comes from the
          coordinate order; each core's genomic 5′ anchor (the {@render code('core5')} position) is
          projected so cores can be placed along the leader.
        </li>
        <li>
          <strong class="font-medium text-ink">Cluster nearby cores.</strong> Within each
          {@render code('(accession, strand)')}, cores that sit within 600&nbsp;bp are chained into one
          candidate window (single-linkage — the chaining is transitive).
        </li>
        <li>
          <strong class="font-medium text-ink">Collapse redundant annotations.</strong> The same
          physical T-box is often annotated by several pipelines; cores within 60&nbsp;bp are one
          physical core, and the best representative row is kept (complete &gt; has a called codon &gt;
          has a {@render code('unique_name')} &gt; lowest E-value).
        </li>
        <li>
          <strong class="font-medium text-ink">Keep the tandems.</strong> A window with ≥2 physical
          cores is a tandem locus when its cores are plausibly co-regulated — they share a downstream
          gene, share a specifier amino acid, <em>or</em> sit in overlapping leaders. A locus is
          high-confidence when ≥2 of its cores have a called specifier codon.
        </li>
        <li>
          <strong class="font-medium text-ink">Order &amp; derive.</strong> Elements are numbered
          5′→3′; each specifier is read from {@render code('amino_acid_top')} /
          {@render code('refine_codon_top')}, the Stem I WUSS structure is converted to dot-bracket,
          the downstream function is classified (EC number, then a protein-name regex), and every
          intra-locus pairwise %-identity is aligned.
        </li>
      </ol>
      <p class="text-small text-muted">
        This yields {s ? s.counts.loci : 470} loci and exactly {s ? s.counts.members : 949} T-box
        elements — one representative per physical core (duplicate annotation rows are collapsed) —
        with {s ? s.counts.intra_locus_pairs : 488} intra-locus pairwise identities.
      </p>
    </div>
  </Card>

  <Card
    title="Reproduce it yourself"
    subtitle="One script, one input file — regenerate the entire dataset from scratch."
  >
    <div class="max-w-3xl space-y-4">
      <p>
        The whole pipeline above is packaged as a single, self-contained Python script. Point it at
        the public TBDB master table and it regenerates the same loci, elements, pairings, and summary
        this app loads, then self-verifies the counts on exit.
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <a
          href={scriptUrl}
          download="reproduce_tandem_tbox_db.py"
          class="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-small font-medium text-white transition-colors duration-200 ease-standard hover:bg-brand-strong"
        >
          <svg viewBox="0 0 16 16" class="size-4 shrink-0" aria-hidden="true">
            <path
              d="M8 2.5v7m0 0L5 6.5M8 9.5l3-3M3 11.5v1A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5v-1"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            />
          </svg>
          Download reproduce_tandem_tbox_db.py
        </a>
        <TbdbLink href={scriptUrl} title="View the script source in a new tab">View source</TbdbLink>
      </div>
      <div class="space-y-2">
        <p class="text-small text-muted">
          Get the source table — {@render code('Master_tboxes.csv')} — from the TBDB repository, then
          run:
        </p>
        <pre
          class="overflow-x-auto rounded-md border border-hairline bg-surface-subtle px-4 py-3 font-mono text-[0.8rem] leading-relaxed text-ink"><code
            >pip install "pandas&gt;=2.0" "biopython&gt;=1.81"

python3 reproduce_tandem_tbox_db.py \
  --master Master_tboxes.csv \
  --out ./out --emit-table</code
          ></pre>
        <p class="text-small text-muted">
          The source table lives at <TbdbLink href="https://github.com/mpiersonsmela/tbox"
            >github.com/mpiersonsmela/tbox</TbdbLink
          >. The script writes {@render code('loci.json')}, {@render code('members.json')},
          {@render code('identity.json')}, {@render code('summary.json')}, the tree-input FASTAs, and
          (with {@render code('--emit-table')}) a readable {@render code('tandem_loci.tsv')}.
        </p>
      </div>
      <div class="rounded-md border border-hairline bg-surface-subtle px-4 py-3 text-small text-muted">
        <span class="font-medium text-ink">Faithful to the published dataset.</span> The
        {s ? s.counts.loci : 470}&nbsp;/&nbsp;{s ? s.counts.members : 949}&nbsp;/&nbsp;{s
          ? s.counts.intra_locus_pairs
          : 488} counts, the
        {#if s}{s.confidence.high}&nbsp;/&nbsp;{s.confidence.low}{:else}high&nbsp;/&nbsp;low{/if}
        confidence split, and every specifier and phylum distribution reproduce exactly; 943 of 949
        element records are byte-identical. The few differences are documented curatorial edge cases —
        a handful of physical cores carry several redundant source annotations, and locus IDs are
        re-assigned in genomic order rather than original discovery order. The script's header
        comment explains the logic of every step in full.
      </div>
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
          )}), and only the Stem I consensus columns are used to build the tree.
        </li>
        <li>
          The tree is built with FastTree (GTR + Γ, SH-like local supports) — a quick map, not an
          over-interpretable bootstrap.
        </li>
        <li>
          It is midpoint-rooted internally for a stable on-screen layout only, and is always displayed
          unrooted (radial). Branch support is a fade/collapse control, not printed numbers; there is
          no time axis and no clock.
        </li>
        <li>
          Elements that pass a Stem I length-gate form the main tree; degenerate fragments and the few
          elements lacking a Stem I route to a separate antiterminator-core fallback tree.
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
        the CC-BY license. tbdb.tandem adds only the tandem-level views and layout; the underlying
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
        <dd class="text-muted">A genomic window holding ≥2 T-box elements (the 470).</dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Element (also member)</dt>
        <dd class="text-muted">
          One complete T-box unit — Stem I plus its antiterminator/terminator decision module — within a
          locus (the 949 total). Also called a member.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Specifier</dt>
        <dd class="text-muted">
          The amino acid a T-box senses, read from {@render code('amino_acid_top')}.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Stem I</dt>
        <dd class="text-muted">
          The specifier-presenting structural element; its sequence drives the similarity map.
        </dd>
      </div>
      <div>
        <dt class="font-medium text-ink">WUSS / dot-bracket</dt>
        <dd class="text-muted">
          RNA secondary-structure notations; the Stem I column is WUSS and converted to dot-bracket.
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
