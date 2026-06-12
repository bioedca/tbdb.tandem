<script lang="ts">
  // The Tandem architecture figure, rendered with the hatchlings library (PLAN §9①):
  //   • the vendored LinearMap draws the to-scale operon track — one specifier-tinted arrow per
  //     T-box element body + a downstream-gene arrow, on a backbone with 5′/3′ caps, hover
  //     tooltips and click-to-select. The diagram is STATIC (fits the container width); it carries
  //     no zoom — the figure is an overview and the zoomable detail lives in the sequence viewer.
  //   • ArchitectureOverlay adds the RNA-structure anatomy on top (Stem I, specifier codon,
  //     antiterminator, terminator hairpin / anti-SD, discriminator) sharing LinearMap's bp→x;
  //   • the published SequenceViewer shows the locus nucleotides + annotations — when the NCBI
  //     `context` is present it is the WHOLE locus as one continuous, zoomable track (all elements +
  //     the downstream gene); without it, the selected element's leader (click an arrow to switch).
  //     The ONLY zoom in the figure lives here, on the sequence viewer.
  // Same prop shape as the retired ArchitectureDiagram so mount sites need only swap the import.
  // Theming: a local .tv-hatch wrapper maps --hatch-* onto the Slate Instrument palette (no global
  // ThemeProvider). The specifier hue appears only on the data arrows + AA chip (chrome⟂data).
  import { SequenceViewer, ZoomControls } from '@molbiohive/hatchlings'
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
  // viewer widens and overflow-scrolls; vertical layout is the viewer's own.
  let seqZoom = $state(1)
  let seqContainerW = $state(0)
  let seqScroller: HTMLDivElement | undefined = $state()
  const seqWidth = $derived(Math.round(Math.max(seqContainerW || BASE_WIDTH, MIN_SEQ_TRACK) * seqZoom))

  function handlePartClick(part: Part) {
    // gene parts (the proximal one keeps DOWNSTREAM_ORF_ID, operon genes are suffixed) aren't elements.
    if (!part.id || part.id.startsWith(DOWNSTREAM_ORF_ID)) return
    selectedId = part.id
    if (hasLocusTrack) scrollToElement(part.id)
  }

  // Scroll the continuous track so the clicked element is in view (approximate: the element's
  // fractional position along the interval). Honours prefers-reduced-motion.
  function scrollToElement(memberId: string) {
    const el = context?.elements.find((e) => e.member_id === memberId)
    if (!el || !seqScroller || !context) return
    const frac = el.offset / Math.max(context.seq.length, 1)
    const target = frac * Math.max(seqWidth - seqScroller.clientWidth, 0)
    const reduce =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    seqScroller.scrollTo({ left: target, behavior: reduce ? 'auto' : 'smooth' })
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
    <div class="mt-4" bind:clientWidth={seqContainerW}>
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
        <ZoomControls zoom={seqZoom} minZoom={0.5} maxZoom={6} step={0.5} onzoomchange={(z) => (seqZoom = z)} />
      </div>
      <div class="relative overflow-x-auto" bind:this={seqScroller}>
        <SequenceViewer data={seqData} width={seqWidth} showComplement={false} showNumbers colorBases={false} />
      </div>
    </div>
  {/if}
</div>
