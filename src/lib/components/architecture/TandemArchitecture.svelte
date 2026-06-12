<script lang="ts">
  // The Tandem architecture figure, rendered with the hatchlings library (PLAN §9①):
  //   • the vendored LinearMap draws the to-scale operon track — one specifier-tinted arrow per
  //     T-box element body + a downstream-gene arrow, on a backbone with 5′/3′ caps, hover
  //     tooltips and click-to-select. The diagram is STATIC (fits the container width); it carries
  //     no zoom — the figure is an overview and the zoomable detail lives in the sequence viewer.
  //   • ArchitectureOverlay adds the RNA-structure anatomy on top (Stem I, specifier codon,
  //     antiterminator, terminator hairpin / anti-SD, discriminator) sharing LinearMap's bp→x;
  //   • the published SequenceViewer shows the locus nucleotides + annotations — when the NCBI
  //     `context` is present it is the WHOLE locus as one continuous track (all elements + the
  //     downstream gene); without it, the selected element's leader (click an arrow to switch).
  //     The ONLY zoom in the figure lives here, on the sequence viewer: a continuous slider that
  //     scales the on-screen TEXT SIZE (the library's glyph font is fixed, so we scale the rendered
  //     track with CSS `zoom`) — slid down it fits more of the locus as an overview, slid up it
  //     enlarges the bases for reading. The track wraps to the container; one scroller owns scroll.
  // Same prop shape as the retired ArchitectureDiagram so mount sites need only swap the import.
  // Theming: a local .tv-hatch wrapper maps --hatch-* onto the Slate Instrument palette (no global
  // ThemeProvider). The specifier hue appears only on the data arrows + AA chip (chrome⟂data).
  import { SequenceViewer } from '@molbiohive/hatchlings'
  import { LinearMap } from '../../vendor/hatchlings'
  import type { FuncClass, FuncSource, LocusContext, Member, Strand } from '../../data/types'
  import { buildArchitecture } from '../../architecture'
  import { toLinearMapProps, toSequenceData, toLocusSequenceData, DOWNSTREAM_ORF_ID } from '../../architectureMap'
  import type { Part } from '../../vendor/hatchlings'
  import ArchitectureOverlay from './ArchitectureOverlay.svelte'
  import ArchitectureLegend from './ArchitectureLegend.svelte'

  let {
    members,
    strand,
    funcClass,
    funcSource = 'none',
    downstreamGene = null,
    context = null,
  }: {
    members: Member[]
    strand: Strand
    funcClass: FuncClass
    funcSource?: FuncSource
    downstreamGene?: string | null
    /** NCBI genomic context (downstream gene + interval sequence). Present → the gene is drawn to
     *  scale and the sequence viewer shows the whole locus; null → schematic ORF + per-element view. */
    context?: LocusContext | null
  } = $props()

  const model = $derived(buildArchitecture(members, strand, context))
  const map = $derived(toLinearMapProps(model, funcClass, downstreamGene))

  // Geometry. The track fills the container width (responsive); it does NOT zoom — the diagram is a
  // static overview, so vertical bands are fixed px and the figure simply fits its card. MIN_TRACK
  // keeps the dense figure legible on narrow phones (it scrolls instead). BASE_WIDTH is the fallback
  // before the container is measured (jsdom / first paint). PAD_TOP reserves headroom above the
  // LinearMap arrow band for the tall, now-roomier glyphs (AA chip / Stem I loop / terminator
  // hairpin); FIG_HEIGHT clears the antiterminator lane + the scale bar below the backbone.
  const BASE_WIDTH = 920
  const MIN_TRACK = 560
  const MIN_SEQ_TRACK = 560
  const PAD_TOP = 72
  const FIG_HEIGHT = 156
  let containerW = $state(0) // measured container width (0 until laid out → BASE_WIDTH fallback)
  const width = $derived(Math.round(Math.max(containerW || BASE_WIDTH, MIN_TRACK)))

  let backboneY = $state(0) // bound out of LinearMap (its computed backbone Y, user units)

  // The sequence viewer: the whole-locus continuous track whenever the context carries a valid
  // interval sequence (every locus does, gene-resolved or not — an unresolved-gene locus still
  // shows all its elements together, just without a to-scale gene), else the selected element's
  // leader. `selectedId` (set by clicking a diagram arrow) drives BOTH — it swaps the per-element
  // view, or scrolls to the element within the continuous track.
  const hasLocusTrack = $derived(!!(context && context.seq.length > 0 && context.elements.length > 0))
  let selectedId = $state<string | null>(null)
  const selectedMember = $derived(
    members.find((m) => m.member_id === (selectedId ?? members[0]?.member_id)) ?? members[0] ?? null,
  )
  const seqData = $derived(
    hasLocusTrack
      ? toLocusSequenceData(members, context!, funcClass)
      : selectedMember
        ? toSequenceData(selectedMember)
        : null,
  )

  // Sequence-viewer zoom — the only zoom in the figure (the diagram is a static overview). The
  // hatchlings glyph font is fixed in the library, so widening the viewer only spreads the same-size
  // bases sideways; to actually resize the text we scale the rendered track with CSS `zoom`. The
  // slider runs from SEQ_ZOOM_MIN (a compact whole-locus overview) up to SEQ_ZOOM_MAX (large,
  // readable bases). The viewer is laid out ONCE at the container width (so wrapping is stable) and
  // given a height tall enough to render every row; the CSS below collapses its own scroll so the
  // single outer scroller — sized correctly because CSS `zoom` scales the layout box — owns scroll.
  const SEQ_ZOOM_MIN = 0.5
  const SEQ_ZOOM_MAX = 3
  const SEQ_ZOOM_STEP = 0.05
  // Far taller than any locus track: the SequenceViewer's virtual scroller renders only the rows
  // within `height`, so this forces every row out (its box is then collapsed to content by CSS).
  const SEQ_RENDER_ALL_H = 50000
  // The visible window before the outer scroller takes over (kept modest so a long locus scrolls
  // rather than pushing the rest of the page far down).
  const SEQ_VIEWPORT_H = 440
  let seqZoom = $state(1)
  let seqContainerW = $state(0)
  let seqScroller: HTMLDivElement | undefined = $state()
  // Base (unzoomed) wrap width — fit the container; CSS `zoom` rescales from here.
  const baseSeqWidth = $derived(Math.round(Math.max(seqContainerW || BASE_WIDTH, MIN_SEQ_TRACK)))

  function handlePartClick(part: Part) {
    // gene parts (the proximal one keeps DOWNSTREAM_ORF_ID, operon genes are suffixed) aren't elements.
    if (!part.id || part.id.startsWith(DOWNSTREAM_ORF_ID)) return
    selectedId = part.id
    if (hasLocusTrack) scrollToElement(part.id)
  }

  // Scroll the continuous track so the clicked element is in view (approximate: the element's
  // fractional position along the interval → vertical offset, since the track wraps). scrollHeight
  // already reflects the CSS-zoomed layout. Honours prefers-reduced-motion.
  function scrollToElement(memberId: string) {
    const el = context?.elements.find((e) => e.member_id === memberId)
    if (!el || !seqScroller || !context) return
    const frac = el.offset / Math.max(context.seq.length, 1)
    const target = frac * Math.max(seqScroller.scrollHeight - seqScroller.clientHeight, 0)
    const reduce =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    seqScroller.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' })
  }
</script>

<div class="tv-hatch w-full" bind:clientWidth={containerW}>
  <div class="mb-2">
    <p class="text-caption text-muted">
      Biological 5′→3′, to scale · each element tinted by its specifier · click an element to find it in the sequence
    </p>
  </div>

  <figure class="tv-arch w-full" data-arch-scale={model.toScale ? 'to-scale' : 'schematic'}>
    <div class="relative overflow-x-auto">
      <div class="relative" style:width="{width}px" style:height="{FIG_HEIGHT}px">
        <div style:position="absolute" style:top="{PAD_TOP}px" style:left="0">
          <LinearMap
            name=""
            size={map.size}
            parts={map.parts}
            {width}
            noStack
            showTicks={false}
            showInternalLabels={false}
            interactive
            bind:backboneYOut={backboneY}
            onpartclick={handlePartClick}
          />
        </div>
        <ArchitectureOverlay {model} size={map.size} {width} {backboneY} padTop={PAD_TOP} height={FIG_HEIGHT} />
      </div>
    </div>

    <figcaption class="mt-3 rounded-md border border-hairline bg-surface-subtle px-3 py-2.5">
      <ArchitectureLegend />
    </figcaption>
  </figure>

  {#if seqData}
    <div class="mt-4">
      <div class="mb-1.5 flex items-end justify-between gap-3">
        <div class="min-w-0">
          {#if hasLocusTrack}
            <p class="text-base font-semibold text-ink">Full locus sequence</p>
            <p class="text-caption text-muted">All {members.length} elements + downstream gene, to scale</p>
          {:else}
            <p class="text-base font-semibold text-ink">Element {selectedMember?.ordinal} leader sequence</p>
            {#if selectedMember?.specifier.aa}
              <p class="text-caption text-muted">
                Specifier <span class="font-mono text-ink">{selectedMember.specifier.aa}</span>
              </p>
            {/if}
          {/if}
        </div>
        <!-- Continuous text-size zoom: slid left = compact whole-locus overview, right = larger bases. -->
        <div class="flex shrink-0 items-center gap-2">
          <span class="text-caption text-muted">Zoom</span>
          <input
            type="range"
            class="tv-seq-zoom"
            min={SEQ_ZOOM_MIN}
            max={SEQ_ZOOM_MAX}
            step={SEQ_ZOOM_STEP}
            bind:value={seqZoom}
            aria-label="Sequence text size"
          />
          <button
            type="button"
            class="min-w-[3.5ch] text-caption tabular-nums text-muted hover:text-ink"
            title="Reset zoom"
            onclick={() => (seqZoom = 1)}>{Math.round(seqZoom * 100)}%</button>
        </div>
      </div>
      <!-- Measure the SCROLLER's own content width (clientWidth excludes the border + the
           reserved scrollbar gutter) so the track fits exactly at zoom 1 — no phantom h-scroll. -->
      <div
        class="tv-seqzoom relative overflow-auto rounded-md border border-hairline"
        style:max-height="{SEQ_VIEWPORT_H}px"
        bind:this={seqScroller}
        bind:clientWidth={seqContainerW}
      >
        <div style:zoom={seqZoom}>
          <SequenceViewer
            data={seqData}
            width={baseSeqWidth}
            height={SEQ_RENDER_ALL_H}
            showComplement={false}
            showNumbers
            colorBases={false}
          />
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  /* The SequenceViewer is given a huge height so its virtual scroller renders EVERY row; collapse
     its own box back to the content and silence its internal scroll so the single outer `.tv-seqzoom`
     scroller owns scrolling and CSS `zoom` can scale the whole laid-out track uniformly. */
  .tv-seqzoom {
    /* Reserve the vertical-scrollbar gutter so the measured content width — and therefore the
       track's fit at zoom 1 — stays stable whether or not the locus is tall enough to scroll. */
    scrollbar-gutter: stable;
  }
  .tv-seqzoom :global(.hatch-sequence-viewer) {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }

  /* On-system range slider — brand-teal accent (chrome, never a specifier hue). */
  .tv-seq-zoom {
    width: 7rem;
    max-width: 36vw;
    accent-color: var(--color-brand);
    cursor: pointer;
  }
</style>
