<script lang="ts">
  // /about — the method note: how the tandem T-box database is built (the
  // Master_tboxes.csv → loci pipeline), the self-contained Python script that
  // reproduces it (public/reproduce_tandem_tbox_db.py), the data caveats, the
  // no-polarity disclaimer for the similarity map, the offline structure/tree
  // builds, and the TBDB provenance + citation.
  //
  // NO-POLARITY (a ship gate): nothing here may imply evolutionary direction —
  // no ancestral / redeployed / abandoned / gained / lost language. The figures
  // are bound live from store.summary so the prose never drifts from the build.
  import { link } from 'svelte-spa-router'
  import { store } from '../lib/stores/filters.svelte'
  import { fitText } from '../lib/actions/fitText'
  import Card from '../lib/components/Card.svelte'
  import PageHeader from '../lib/components/PageHeader.svelte'
  import TbdbLink from '../lib/components/TbdbLink.svelte'
  import NoPolarityBanner from '../lib/components/NoPolarityBanner.svelte'
  import {
    buildSha,
    buildCommitDay,
    isReleaseBuild,
    SOURCE_TABLE_ROWS,
    SOURCE_TABLE_SHA256_SHORT,
  } from '../lib/build-info'

  const s = $derived(store.summary)
  // Read the contextual figures off the live distributions so the prose never
  // drifts from the committed build (the §3.1 counts are the single source).
  const firmicutes = $derived(
    s?.distributions.phylum.find((d) => d.value === 'Firmicutes')?.count ?? null,
  )
  const unknownLoci = $derived(
    s?.distributions.specifier.find((d) => d.value === '?')?.count ?? null,
  )
  // The named non-Firmicutes phyla, bound live from the same distribution so the
  // taxonomy caveat lists exactly the phyla present in the build (never a stale subset).
  const nonFirmicutesPhyla = $derived(
    s?.distributions.phylum
      .filter((d) => d.value !== 'Firmicutes')
      .map((d) => d.value)
      .join(', ') ?? 'a few other bacterial phyla',
  )

  // The self-contained reproduction script ships as a static asset under the
  // Pages base path (committed in public/), so the labmate can download and run
  // it against the public TBDB master table — no clone, no app build.
  const scriptUrl = `${import.meta.env.BASE_URL}reproduce_tandem_tbox_db.py`
  // The pre-built member-level base table (one row per T-box element, incl. the
  // component-stem colour spans) ships committed under public/data/ — the same
  // file the build emits and the reproduction script regenerates.
  const membersCsvUrl = `${import.meta.env.BASE_URL}data/members.csv`
</script>

{#snippet code(text: string)}
  <!-- White inline code (no longer cream); a hairline ring keeps it legible as code
       on the white card without adding layout-shifting border box. -->
  <code
    class="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em] text-ink ring-1 ring-hairline ring-inset"
    >{text}</code
  >
{/snippet}

{#snippet stat(value: string | number, label: string)}
  <div
    class="flex flex-col rounded-md border border-hairline bg-surface px-3 py-2 text-center"
  >
    <span
      use:fitText={{ minPx: 12 }}
      class="block overflow-hidden font-mono text-h2 whitespace-nowrap text-ink"
    >{value}</span>
    <span class="text-caption text-muted">{label}</span>
  </div>
{/snippet}

<section class="space-y-6">
  <!-- Masthead (PLAN §8): shared PageHeader — kicker, fitText hero, measure-capped lead. -->
  <PageHeader kicker="Method &amp; provenance" title="About &amp; method">
    <p class="max-w-measure text-lead text-muted">
      How the tandem T-box loci shown here are detected, the caveats behind every view, why the
      similarity map is not a phylogeny, and where the data come from.
    </p>
  </PageHeader>

  <!-- The method cards tile into measure-width masonry columns (CSS multi-column): the column
       COUNT grows with the viewport (1 → ~4 columns on a 2560 screen) while each column stays
       ≈ one reading measure wide — so a wide band is filled with more columns, never longer
       lines. `break-inside-avoid` keeps each card whole; `mb-6` sets the vertical rhythm
       (column-gap handles the horizontal). The prose inside each card no longer needs its own
       max-w cap — the column IS the measure now. -->
  <div class="columns-lg gap-x-6">
  <Card title="What this is" class="mb-6 break-inside-avoid">
    <div class="space-y-3 text-body leading-relaxed">
      <p>
        A <strong class="font-medium text-ink">T-box riboswitch</strong> is a regulatory RNA in the 5′
        leader of a bacterial mRNA. It binds one cognate tRNA and senses whether that tRNA is charged
        with its amino acid: when the amino acid is scarce, the uncharged tRNA stabilizes an
        <em>antiterminator</em> that lets transcription read through, switching the downstream gene
        <strong class="font-medium text-ink">on</strong>; otherwise a <em>terminator</em> hairpin forms
        and the gene stays off. Which tRNA a T-box reads is fixed by a codon-like <em>specifier</em> in
        its Stem&nbsp;I, so each T-box is named for the amino acid it senses. Originally described in
        <em>Bacillus subtilis</em>, T-boxes were the first <em>classical</em> riboswitch family to be
        discovered, predating the metabolite-binding riboswitches
        (<TbdbLink href="https://doi.org/10.1093/nar/gkaa721">Marchand et al., 2021</TbdbLink>), and are
        the most prominent RNA-based regulatory mechanism known to be employed by members of the Firmicutes
        (<TbdbLink href="https://doi.org/10.1128/MMBR.00026-08">Gutiérrez-Preciado et al., 2009</TbdbLink>).
      </p>
      <p>
        A <strong class="font-medium text-ink">tandem</strong> locus stacks two or more complete T-box
        elements in the same leader, all regulating the same downstream gene or operon. Such
        arrangements were systematically surveyed across bacterial genomes by
        <TbdbLink href="https://doi.org/10.1261/rna.819308">Vitreschak et al., 2008</TbdbLink>
        and catalogued in the T-box review of
        <TbdbLink href="https://doi.org/10.1128/MMBR.00026-08">Gutiérrez-Preciado et al., 2009</TbdbLink>.
      </p>
      <p>
        tbdb.tandem is a companion to {@render code('tbdb.io')} focused on the
        <em>tandem-level</em> view of T-box riboswitches: stacked-element architecture, specifier–tRNA
        pairing, shared-operon regulation, and a sequence-similarity map. It does not duplicate the
        single-element views in tbdb.io; every element deep-links back to its canonical tbdb.io entry
        for the structure render, genome browser, and tRNA pairing.
      </p>
      {#if s}
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
    subtitle="From the raw TBDB master table to the loci shown here: every step is deterministic and scriptable."
    class="mb-6 break-inside-avoid"
  >
    <div class="text-body space-y-3 leading-relaxed">
      <p>
        The entire dataset is derived from a <strong class="font-medium text-ink">single public
        source file</strong>: the TBDB master table ({@render code('Master_tboxes.csv')}, ≈23,500
        annotated T-box rows). A deterministic pipeline turns it into the loci, elements, and pairings
        on every panel.
      </p>
      <ol class="list-decimal space-y-2 pl-5 marker:font-medium marker:text-muted">
        <li>
          <strong class="font-medium text-ink">Orient each T-box.</strong> Strand comes from the
          coordinate order; each element's genomic 5′ anchor (the {@render code('core5')} position) is
          then computed, so elements can be ordered along the transcript.
        </li>
        <li>
          <strong class="font-medium text-ink">Cluster nearby elements.</strong> Within each
          {@render code('(accession, strand)')}, neighboring elements within 600&nbsp;bp of each other are
          chained into one candidate window (single-linkage, so the chaining is transitive).
        </li>
        <li>
          <strong class="font-medium text-ink">Collapse redundant annotations.</strong> The same
          physical T-box is often annotated by several pipelines; annotations within 60&nbsp;bp of each
          other are collapsed to one physical element, and the single best representative row is kept
          (complete &gt; has a called codon &gt; carries a TBDB id &gt; lowest E-value).
        </li>
        <li>
          <strong class="font-medium text-ink">Keep the tandems.</strong> A window with ≥2 physical
          elements is a tandem locus when its elements are plausibly co-regulated: they share a downstream
          gene, share a specifier amino acid, <em>or</em> sit in overlapping leaders. A locus is
          high-confidence when ≥2 of its elements have a called specifier codon.
        </li>
        <li>
          <strong class="font-medium text-ink">Order &amp; derive.</strong> Elements are numbered
          5′→3′; each specifier is read from {@render code('amino_acid_top')} /
          {@render code('refine_codon_top')}, the Stem I WUSS structure is converted to dot-bracket,
          the downstream function is classified (EC number first, then annotation-text evidence), and
          each intra-locus element pair is aligned to a percent identity.
        </li>
      </ol>
      <p class="text-small text-muted">
        This yields {s ? s.counts.loci : 470} loci and exactly {s ? s.counts.members : 949} T-box
        elements (one representative per physical element; duplicate annotation rows are collapsed) and
        {s ? s.counts.intra_locus_pairs : 488} intra-locus pairwise identities.
      </p>
    </div>
  </Card>

  <Card
    title="Reproduce it yourself"
    subtitle="One script, one input file: regenerate the core dataset offline."
    class="mb-6 break-inside-avoid"
  >
    <div class="text-body space-y-4 leading-relaxed">
      <p>
        The pipeline above is packaged as a single, self-contained Python script. Point it at the
        public TBDB master table and it regenerates the same loci, elements, pairings, summary, and
        member table this app loads, fully offline, then self-verifies the counts on exit. The
        similarity tree, the 3-D cloud, and the R2DT structure diagrams are heavier, separately
        generated offline steps (cluster alignment then FastTree, a PCoA embedding, and the R2DT
        pipeline); they ship committed alongside the data.
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
      <div class="rounded-md border border-hairline bg-surface px-4 py-3">
        <p class="text-small text-muted">
          <span class="font-medium text-ink">Prefer the finished table?</span> Download the
          member-level base table directly: one row per T-box element, every per-element field plus the
          component-stem spans (Stem&nbsp;I / II / IIA-B / III / antiterminator) the app colours the RNA
          secondary structure by, and the NCBI genomic-context columns (the downstream gene's
          coordinates, the locus interval, and each element's offset within it) that drive the
          continuous locus view, filled for the 408 of 470 loci whose downstream gene resolves on
          NCBI. It is the same {@render code('members.csv')} the build emits and the script regenerates.
        </p>
        <a
          href={membersCsvUrl}
          download="tbdb-tandem-members.csv"
          class="mt-2.5 inline-flex items-center justify-center gap-1.5 rounded-md border border-hairline bg-surface px-3 py-1.5 text-small font-medium text-ink transition-colors duration-200 ease-standard hover:bg-brand-subtle"
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
          Download members.csv ({s ? s.counts.members : 949} elements)
        </a>
      </div>
      <div class="space-y-2">
        <p class="text-small text-muted">
          Get the source table ({@render code('Master_tboxes.csv')}) from the TBDB repository, then
          run:
        </p>
        <pre
          class="overflow-x-auto rounded-md border border-hairline bg-surface px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-ink sm:text-[0.8rem]"><code
            >pip install "pandas&gt;=2.0" "biopython&gt;=1.81"

python3 reproduce_tandem_tbox_db.py \
  --master Master_tboxes.csv \
  --out ./out --emit-table</code
          ></pre>
        <p class="text-small text-muted">
          The source table lives at <TbdbLink href="https://github.com/mpiersonsmela/tbox"
            >github.com/mpiersonsmela/tbox</TbdbLink
          >. The script writes {@render code('loci.json')}, {@render code('members.json')},
          {@render code('identity.json')}, {@render code('summary.json')}, {@render code('members.csv')}
          (above), the tree-input FASTAs, and, with {@render code('--emit-table')}, a readable
          {@render code('tandem_loci.tsv')}.
        </p>
        <p class="text-small text-muted">
          The genomic-context columns are blank in that default, offline run. To fill them (and
          reconstruct the continuous locus view), add {@render code('--genomic-context')}, which
          fetches each downstream gene's coordinates from NCBI, the script's one networked step:
        </p>
        <pre
          class="overflow-x-auto rounded-md border border-hairline bg-surface px-4 py-3 font-mono text-[0.72rem] leading-relaxed text-ink sm:text-[0.8rem]"><code
            >NCBI_EMAIL=you@example.org python3 reproduce_tandem_tbox_db.py \
  --master Master_tboxes.csv --out ./out --genomic-context</code
          ></pre>
      </div>
      <div class="rounded-md border border-hairline bg-surface px-4 py-3 text-small text-muted">
        <span class="font-medium text-ink">Faithful to the published dataset.</span> The
        {s ? s.counts.loci : 470}&nbsp;/&nbsp;{s ? s.counts.members : 949}&nbsp;/&nbsp;{s
          ? s.counts.intra_locus_pairs
          : 488} counts, the
        {#if s}{s.confidence.high}&nbsp;/&nbsp;{s.confidence.low}{:else}high&nbsp;/&nbsp;low{/if}
        confidence split, and every specifier and phylum distribution reproduce exactly, and 943 of 949
        element records are byte-identical. The few differences are curatorial edge cases: a handful of
        physical elements carry redundant source annotations, and locus IDs follow genomic order rather than
        original discovery order. The script's header comment documents every step.
      </div>
    </div>
  </Card>

  <Card
    title="Data caveats"
    subtitle="Read these before drawing conclusions from any panel."
    class="mb-6 break-inside-avoid"
  >
    <div class="text-body leading-relaxed">
      <dl class="space-y-4">
        <div>
          <dt class="font-medium text-ink">Detection finds canonical T-boxes and can miss divergent or double ones.</dt>
          <dd class="mt-0.5 text-muted">
            The source catalogue is built by covariance-model homology search against the Rfam T-box model
            (<TbdbLink href="https://rfam.org/family/RF00230">RF00230</TbdbLink>, with a separate model for
            the translational class). That reliably recovers canonical, well-conserved elements but can
            miss highly divergent or degenerate ones. The model also represents only a single
            antiterminator at a time, so genuinely double or partially-double leaders, the very
            arrangements this resource is about, can be truncated to one element or have the boundary
            between stacked elements mislabeled upstream, meaning some real tandems are missed before they
            ever reach this app. The loci shown here, and any tandem inferred from neighboring elements,
            are bounded by what the model can recognize.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">Tandem co-regulation is inferred, not measured.</dt>
          <dd class="mt-0.5 text-muted">
            Tandem grouping and shared regulation are read from genomic context: neighboring elements that
            share a downstream gene, a specifier amino acid, or overlapping leaders.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">Some loci have no confident specifier.</dt>
          <dd class="mt-0.5 text-muted">
            Which amino acid each T-box senses is read from its specifier, a codon-like trinucleotide
            in Stem I that base-pairs with the cognate tRNA's anticodon. TBDB does not take that
            triplet at face value: it tests the candidate reading frames against a real tRNA (anticodon
            match, acceptor-end pairing, and the downstream gene's function) and keeps only the
            validated call, {@render code('amino_acid_top')} / {@render code('refine_codon_top')}. The
            raw per-row {@render code('codon')} field is the unvalidated read, and a one-base frame
            shift can name a different amino acid entirely, so it is never used.
            {#if unknownLoci != null}<span
                >Validation cannot always succeed: for {unknownLoci} of the {s?.counts.loci} loci no
                cognate tRNA could be confidently resolved, so the specifier shows as “?”, genuinely
                unknown rather than merely uncertain. That is real data loss: the metabolic role
                cannot be recovered from sequence alone. Every count, color, and filter keyed on
                specifier therefore covers only the loci with a resolved call, not all {s?.counts.loci}.</span
              >{/if}
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">The taxonomy mirrors the source, not this subset.</dt>
          <dd class="mt-0.5 text-muted">
            {#if firmicutes != null}{firmicutes} of {s?.counts.loci}{:else}Most{/if} loci are Firmicutes
            (Bacillota), but that skew is not an effect of restricting to tandem loci: the whole TBDB is
            itself overwhelmingly Firmicutes, so the dominance reflects T-box biology rather than this
            subset. T-boxes are not exclusive to Firmicutes; the {s ? s.counts.non_firmicutes : 16}
            non-Firmicutes loci here span {nonFirmicutesPhyla}, but they are far fewer. Specifier, not
            phylum, is therefore the primary color axis, and those loci have a dedicated filter. Any
            taxonomic reading also carries genome-sequencing sampling bias, since sequenced genomes
            over-represent cultured organisms, so the apparent dominance reflects both real biology and
            uneven sampling.
          </dd>
        </div>
        <div>
          <dt class="font-medium text-ink">Low-confidence loci are kept and flagged.</dt>
          <dd class="mt-0.5 text-muted">
            {#if s}{s.confidence.low} of {s.counts.loci}{:else}The low-confidence{/if} loci are badged,
            never silently dropped. Filters can hide them.
          </dd>
        </div>
      </dl>
    </div>
  </Card>

  <Card title="The similarity map is not a phylogeny" class="mb-6 break-inside-avoid">
    <div class="text-body space-y-3 leading-relaxed">
      <NoPolarityBanner />
      <p>
        The tree on the <a
          use:link
          href="/tree"
          class="text-brand underline decoration-brand/30 underline-offset-2">Similarity map</a
        >
        is an exploratory sequence-similarity map for visual grouping. It is <strong>not</strong> an
        ancestral-state reconstruction. Several method choices keep it a map rather than a polarity
        instrument:
      </p>
      <ul class="list-disc space-y-1.5 pl-5 marker:text-muted">
        <li>
          Each leader is structurally aligned to the RF00230 T-box covariance model (Infernal {@render code(
            'cmalign',
          )}), and the tree is built from the Stem&nbsp;I consensus columns only. Stem&nbsp;I is the
          conserved, alignable region the model captures, and it carries the specifier that pairs the cognate
          tRNA, so it is the standard region for comparing T-boxes across the family.
        </li>
        <li>
          The trade-off is that the map sees Stem&nbsp;I only: it does not read variation elsewhere in the
          leader (Stem&nbsp;II, the Stem&nbsp;IIA/B pseudoknot, Stem&nbsp;III, the antiterminator, or
          taxon-specific insertions), so elements that differ only outside Stem&nbsp;I can still look
          alike here.
        </li>
        <li>
          It is midpoint-rooted internally for a stable on-screen layout only, and is always displayed
          unrooted (radial). Branch support is a fade/collapse control, not printed numbers; there is
          no time axis and no clock.
        </li>
        <li>
          Elements that pass a Stem I length-gate form the main tree; degenerate fragments and the few
          elements lacking a Stem I route to a separate antiterminator fallback tree.
        </li>
      </ul>
      <p class="text-small text-muted">
        The alignment and tree are computed offline on the lab cluster as a single CPU-only batch job;
        only the resulting trees and small JSON enter the repository.
      </p>
    </div>
  </Card>

  <Card
    title="RNA secondary-structure diagrams"
    subtitle="Two complementary 2° structure renders on every element, both colored by structural domain."
    class="mb-6 break-inside-avoid"
  >
    <div class="text-body space-y-3 leading-relaxed">
      <p>
        Each element's detail page renders its RNA secondary structure two ways, toggled in place. Both
        color every nucleotide by its structural domain (Stem&nbsp;I, Stem&nbsp;II, Stem&nbsp;IIA/B,
        Stem&nbsp;III, and the antiterminator) from one shared palette, and a link to the element's
        canonical tbdb.io VARNA drawing always sits alongside. Either render can also be switched between
        the gene-on antiterminator and gene-off terminator conformations: full-length folds that share
        the same upstream stems and differ only at the 3′ end.
      </p>
      <ul class="list-disc space-y-1.5 pl-5 marker:text-muted">
        <li>
          <strong class="font-medium text-ink">R2DT</strong> draws the canonical <TbdbLink
            href="https://github.com/r2dt-bio/R2DT">R2DT</TbdbLink
          > layout on the RF00230 / T-box template: the recognizable, reproducible textbook shape, drawn
          the same way for every element so they are directly comparable.
        </li>
        <li>
          <strong class="font-medium text-ink">Fornac</strong> gives a force-directed layout of the
          whole-leader antiterminator conformation (best-effort; the base pairs are exact, the layout is
          approximate).
        </li>
      </ul>
      <p class="text-small text-muted">
        Like the similarity map, the R2DT diagrams are computed offline (R2DT cannot run in the browser)
        and committed as small per-element files the app fetches and colors on the fly, so they are
        generated by a separate step, not by the master-only reproduction script above. R2DT draws a
        faithful full-leader diagram for most elements; a minority with degenerate or atypically long
        leaders fall back to the fornac view.
      </p>
      <p class="text-small text-muted">
        The tandem-architecture figure also shows the regulated <strong class="font-medium text-ink"
          >downstream gene</strong
        > to scale and a continuous full-locus sequence track. The source table records the gene's name
        and protein id but not its genomic coordinates, so those — and the surrounding interval sequence —
        are fetched once from <TbdbLink href="https://www.ncbi.nlm.nih.gov/">NCBI</TbdbLink> for each locus
        and committed as small per-locus files. Like the structure and tree builds this runs as a separate,
        cached step (not the master-only reproduction script), so the app stays fully static. The gene
        resolves for most loci; where its annotation can't be located on the leader's molecule, the figure
        draws the gene schematically instead.
      </p>
    </div>
  </Card>

  <Card title="Provenance &amp; citation" class="mb-6 break-inside-avoid">
    <div class="text-body space-y-3 leading-relaxed">
      <p>
        All data derive from <TbdbLink href="https://tbdb.io">TBDB (tbdb.io)</TbdbLink>, which is free to
        access and download. tbdb.tandem adds only the tandem-level views and layout; the underlying
        annotations are TBDB's. The TBDB paper is open-access under
        <TbdbLink href="https://creativecommons.org/licenses/by/4.0/">CC&nbsp;BY&nbsp;4.0</TbdbLink>;
        please attribute the data with the citation below.
      </p>
      <p>
        If you use this resource, please cite the TBDB database paper (the data source) together with
        the foundational analyses of the T-box mechanism and its tandem arrangement:
      </p>
      <ul class="space-y-2">
        <li class="rounded-md border border-hairline bg-surface px-4 py-3 text-small">
          Marchand, Pierson Smela, Jordan, Narasimhan &amp; Church (2021). <em
            >TBDB: a database of structurally annotated T-box riboswitch:tRNA pairs.</em
          >
          Nucleic Acids Research 49(D1):D229–D235.
          <TbdbLink href="https://doi.org/10.1093/nar/gkaa721">doi:10.1093/nar/gkaa721</TbdbLink>
        </li>
        <li class="rounded-md border border-hairline bg-surface px-4 py-3 text-small">
          Vitreschak, Mironov, Lyubetsky &amp; Gelfand (2008). <em
            >Comparative genomic analysis of T-box regulatory systems in bacteria.</em
          >
          RNA 14(4):717–735.
          <TbdbLink href="https://doi.org/10.1261/rna.819308">doi:10.1261/rna.819308</TbdbLink>
        </li>
        <li class="rounded-md border border-hairline bg-surface px-4 py-3 text-small">
          Gutiérrez-Preciado, Henkin, Grundy, Yanofsky &amp; Merino (2009). <em
            >Biochemical features and functional implications of the RNA-based T-box regulatory
            mechanism.</em
          >
          Microbiology and Molecular Biology Reviews 73(1):36–61.
          <TbdbLink href="https://doi.org/10.1128/MMBR.00026-08">doi:10.1128/MMBR.00026-08</TbdbLink>
        </li>
      </ul>
      <p class="text-small text-muted">
        For citation guidance see <TbdbLink href="https://tbdb.io/citing.html"
          >tbdb.io/citing.html</TbdbLink
        >.
      </p>
      <!-- Build + source stamp (audit follow-up): which deployment, from which source commit,
           and the exact frozen source table behind every count. The commit SHA/date come from
           src/lib/build-info.ts (vite-injected); the source identifiers are static. This card
           is not in any visual baseline, and nothing here touches the deterministic footer. -->
      <p class="border-t border-hairline pt-3 text-caption text-muted">
        <span class="font-medium text-ink">This build:</span>
        {#if isReleaseBuild}commit {@render code(buildSha)}{#if buildCommitDay}, {buildCommitDay}{/if}{:else}local
          build{/if}. Derived from the TBDB master table ({SOURCE_TABLE_ROWS.toLocaleString('en-US')}
        rows; SHA-256 {@render code(SOURCE_TABLE_SHA256_SHORT)}).
      </p>
    </div>
  </Card>

  <Card title="Glossary" class="mb-6 break-inside-avoid">
    <dl class="space-y-3">
      <div>
        <dt class="font-medium text-ink">Locus / tandem</dt>
        <dd class="text-muted">A genomic window holding ≥2 T-box elements (the 470).</dd>
      </div>
      <div>
        <dt class="font-medium text-ink">Element (also member)</dt>
        <dd class="text-muted">
          One complete T-box unit (Stem I plus its antiterminator/terminator decision module) within a
          locus (the 949 total).
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
          The structural element that presents the specifier codon to the cognate tRNA's anticodon; its
          sequence drives the similarity map.
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
          unknown), EC-backed or text-inferred; its provenance is {@render code('func_source')}, and
          text-inferred classes are marked with an asterisk.
        </dd>
      </div>
    </dl>
  </Card>
  </div>
</section>
