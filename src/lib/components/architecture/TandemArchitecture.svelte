<script lang="ts">
  // The Tandem architecture figure, rendered with the hatchlings library (PLAN §9①):
  //   • the vendored LinearMap draws the to-scale operon track — one specifier-tinted arrow per
  //     T-box element body + a downstream-gene arrow, on a backbone with 5′/3′ caps, hover
  //     tooltips, click-to-select, and width-driven zoom;
  //   • ArchitectureOverlay adds the RNA-structure anatomy on top (Stem I, specifier codon,
  //     antiterminator, terminator hairpin / anti-SD, discriminator) sharing LinearMap's bp→x;
  //   • the published SequenceViewer shows the selected element's leader nucleotides + annotations.
  // Same prop shape as the retired ArchitectureDiagram so mount sites need only swap the import.
  // Theming: a local .tv-hatch wrapper maps --hatch-* onto the Slate Instrument palette (no global
  // ThemeProvider). The specifier hue appears only on the data arrows + AA chip (chrome⟂data).
  import { SequenceViewer, ZoomControls } from '@molbiohive/hatchlings'
  import { LinearMap } from '../../vendor/hatchlings'
  import type { FuncClass, FuncSource, Member, Strand } from '../../data/types'
  import { buildArchitecture } from '../../architecture'
  import { toLinearMapProps, toSequenceData } from '../../architectureMap'
  import type { Part } from '../../vendor/hatchlings'
  import ArchitectureOverlay from './ArchitectureOverlay.svelte'
  import ArchitectureLegend from './ArchitectureLegend.svelte'

  let {
    members,
    strand,
    funcClass,
    funcSource = 'none',
    downstreamGene = null,
  }: {
    members: Member[]
    strand: Strand
    funcClass: FuncClass
    funcSource?: FuncSource
    downstreamGene?: string | null
  } = $props()

  const model = $derived(buildArchitecture(members, strand))
  const map = $derived(toLinearMapProps(model, funcClass, downstreamGene))

  // Geometry. At zoom 1 the track fills the container width (responsive, like the old figure);
  // zoom multiplies that, and the figure overflow-scrolls rather than shrinking labels. Vertical
  // bands are fixed px, so zooming spreads the track horizontally only. MIN_TRACK keeps the dense
  // figure legible on narrow phones (it scrolls instead). BASE_WIDTH is the fallback before the
  // container is measured (jsdom / first paint). PAD_TOP reserves headroom above the LinearMap arrow
  // band for the tall glyphs (AA chip / Stem I loop / hairpin); FIG_HEIGHT clears the scale bar.
  const BASE_WIDTH = 920
  const MIN_TRACK = 560
  const PAD_TOP = 52
  const FIG_HEIGHT = 134
  let zoom = $state(1)
  let containerW = $state(0) // measured container width (0 until laid out → BASE_WIDTH fallback)
  const width = $derived(Math.round(Math.max(containerW || BASE_WIDTH, MIN_TRACK) * zoom))

  let backboneY = $state(0) // bound out of LinearMap (its computed backbone Y, user units)

  // Selected element → its sequence detail. Default to the most-5′ element so a detail shows.
  let selectedId = $state<string | null>(null)
  const selectedMember = $derived(
    members.find((m) => m.member_id === (selectedId ?? members[0]?.member_id)) ?? members[0] ?? null,
  )
  const seqData = $derived(selectedMember ? toSequenceData(selectedMember) : null)

  function handlePartClick(part: Part) {
    if (part.id && part.id !== 'downstream-orf') selectedId = part.id
  }
</script>

<div class="tv-hatch w-full" bind:clientWidth={containerW}>
  <div class="mb-2 flex items-center justify-between gap-3">
    <p class="text-caption text-muted">
      Biological 5′→3′, to scale · each element tinted by its specifier · click an element for its sequence
    </p>
    <ZoomControls {zoom} minZoom={0.5} maxZoom={4} step={0.25} onzoomchange={(z) => (zoom = z)} />
  </div>

  <figure class="tv-arch w-full">
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

  {#if selectedMember && seqData}
    <div class="mt-4">
      <p class="mb-1.5 text-small text-muted">
        Element {selectedMember.ordinal} leader sequence
        {#if selectedMember.specifier.aa}· specifier <span class="font-mono text-ink">{selectedMember.specifier.aa}</span>{/if}
      </p>
      <div class="relative overflow-x-auto">
        <SequenceViewer data={seqData} width={width} showComplement={false} showNumbers colorBases={false} />
      </div>
    </div>
  {/if}
</div>
