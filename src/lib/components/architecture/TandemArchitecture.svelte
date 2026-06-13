<script lang="ts">
  // The Tandem architecture figure, rendered with the hatchlings library (PLAN §9①):
  //   • the vendored LinearMap draws the to-scale operon track — one specifier-tinted arrow per
  //     T-box element body + a downstream-gene arrow, on a backbone with 5′/3′ caps, hover
  //     tooltips and click-to-select. The diagram is STATIC (fits the container width); it carries
  //     no zoom — the figure is an overview and the zoomable detail lives in the sequence viewer.
  //   • ArchitectureOverlay adds the calm chrome on top (the specifier amino-acid chip + ordinal
  //     per element, the inter-element spacers, the scale bar) sharing LinearMap's bp→x; the
  //     RNA-structure anatomy lives in the R2DT secondary-structure viewer, not here;
  //   • the published SequenceViewer shows the locus nucleotides + annotations — when the NCBI
  //     `context` is present it is the WHOLE locus as one continuous track (all elements + the
  //     downstream gene); without it, the selected element's leader (click an arrow to switch).
  //     The ONLY zoom in the figure lives here, on the sequence viewer. Zoom = BASES PER ROW: the
  //     viewer wraps at exactly `n` bases (`charsPerRow`) drawn in a natural cell, and we CSS-`zoom`
  //     the whole track by `frameWidth / rowWidthPx(n)` so a row ALWAYS fills the fixed-width frame
  //     edge-to-edge — no horizontal whitespace or scroll. Fewer bases ⇒ bigger text (max zoom =
  //     60 bp across); more bases ⇒ the whole locus fits the window height (min zoom). Content grows
  //     only vertically and scrolls inside a fixed window whose height tracks the viewport. The
  //     fit/fill geometry math lives in `locusSeqZoom`.
  // Same prop shape as the retired ArchitectureDiagram so mount sites need only swap the import.
  // Theming: a local .tv-hatch wrapper maps --hatch-* onto the Slate Instrument palette (no global
  // ThemeProvider). The specifier hue appears only on the data arrows + AA chip (chrome⟂data).
  import { LinearMap, SequenceViewer, SelectionState } from '../../vendor/hatchlings'
  import type { FuncClass, FuncSource, LocusContext, Member, Strand } from '../../data/types'
  import { buildArchitecture } from '../../architecture'
  import { toLinearMapProps, toSequenceData, toLocusSequenceData, DOWNSTREAM_ORF_ID } from '../../architectureMap'
  import type { Part } from '../../vendor/hatchlings'
  import {
    rowWidthPx,
    basesPerRowBounds,
    defaultBasesPerRow,
    numbersVisibleAt,
    CHAR_CELL_PX,
    type BasesPerRowBounds,
  } from '../../locusSeqZoom'
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
    /** NCBI genomic context (downstream gene + interval sequence). Resolved → the gene is drawn to
     *  scale and the sequence viewer shows the whole locus; present-but-unresolved → no gene is
     *  drawn (the elements alone + the "gene could not be found" banner); null → still fetching, so
     *  no gene and no banner (the per-element leader view), never a schematic stand-in. */
    context?: LocusContext | null
  } = $props()

  const model = $derived(buildArchitecture(members, strand, context))
  const map = $derived(toLinearMapProps(model, funcClass, downstreamGene))

  // Gene resolution drives the figure: a gene arrow + "+ downstream gene" sub-label appear only
  // when NCBI placed the gene to scale on the leader's molecule. When the context has LOADED but
  // no gene resolved (the loci whose annotation can't be located on the leader's molecule) the
  // figure shows the T-box elements alone and a muted banner says so — there is no schematic-ORF
  // fallback. Gating on `context` being present keeps the banner from flashing during the async
  // context load (null → still fetching, not "not found").
  const geneResolved = $derived(model.toScale)
  const geneMissing = $derived(!!context && !geneResolved)

  // Geometry. The track fills the container width (responsive); it does NOT zoom — the diagram is a
  // static overview, so vertical bands are fixed px and the figure simply fits its card. MIN_TRACK
  // keeps the dense figure legible on narrow phones (it scrolls instead). BASE_WIDTH is the fallback
  // before the container is measured (jsdom / first paint). PAD_TOP reserves headroom above the
  // LinearMap arrow band for the specifier AA chip; FIG_HEIGHT clears the ordinal tags + the scale
  // bar below the backbone. (The figure is now a calm operon overview — no RNA-anatomy lanes.)
  const BASE_WIDTH = 920
  const MIN_TRACK = 560
  const PAD_TOP = 48
  const FIG_HEIGHT = 132
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

  // The viewer's selection model: drives a mouse drag / click to a base caret + highlight, and makes
  // clicking a specifier tag select that element's underlying span (the vendored SequenceViewer only
  // selects-on-part-click when a selectionState is supplied). Its `sequenceLength` is fixed at
  // construction, so we rebuild it only when the displayed sequence CHANGES — keyed on the seq string,
  // not on `seqData` identity (which re-derives on unrelated reactivity like `funcClass`, only the
  // part colours; keying on the string preserves a live selection across that churn and still resets
  // when the locus/element actually switches). PR3 reads `selectionState.range` for copy.
  let selectionState = $state<SelectionState | null>(null)
  let lastSeq = ''
  $effect(() => {
    const seq = seqData?.seq ?? ''
    if (seq !== lastSeq) {
      lastSeq = seq
      selectionState = seq.length > 0 ? new SelectionState(seq.length) : null
    }
  })

  // Sequence-viewer zoom — the only zoom in the figure (the diagram is a static overview). Zoom is
  // BASES PER ROW (`n`): the viewer wraps at exactly `n` bases in a natural CHAR_CELL_PX cell, then we
  // CSS-`zoom` the whole track by `frameWidth / rowWidthPx(n)` so a row fills the fixed-width frame
  // exactly — no horizontal whitespace/scroll, text grows as `n` shrinks. `n` runs from `bounds.lo`
  // (60 bp across, max zoom) to `bounds.hi` (the whole locus fits the window height, min zoom),
  // computed in locusSeqZoom from the frame size + the laid-out content height.
  // Far taller than any locus track: the SequenceViewer's virtual scroller renders only the rows
  // within `height`, so this forces every row out (its box is then collapsed to content by CSS).
  const SEQ_RENDER_ALL_H = 50000
  // The window's on-screen height tracks the viewport (responsive) — clamped so it stays a usable
  // window on small laptops and doesn't dominate tall monitors. Content beyond it scrolls vertically.
  const SEQ_FRAME_MIN_H = 320
  const SEQ_FRAME_MAX_H = 720
  let viewportH = $state(0)
  $effect(() => {
    const update = () => (viewportH = window.innerHeight)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  })
  const frameH = $derived(
    Math.round(Math.min(Math.max((viewportH || 900) * 0.58, SEQ_FRAME_MIN_H), SEQ_FRAME_MAX_H)),
  )

  let seqContainerW = $state(0)
  let seqScroller: HTMLDivElement | undefined = $state()
  // The fill width is the scroller's ACTUAL measured content width (no minimum floor) — on a phone
  // the row must fill the real frame, not a wider floored track that would overflow and clip. Falls
  // back to BASE_WIDTH only until the container is first measured (jsdom / first paint).
  const frameW = $derived(Math.round(seqContainerW || BASE_WIDTH))

  // The track-feature flags that drive row heights. The position ruler is `'auto'`: it hides once the
  // bases shrink past legibility (low zoom), so the fit math folds that per-`n` visibility in — keeping
  // the predictor and the SequenceViewer in lock-step (their disagreement would mis-size the fit bound).
  // The specifier-codon translation is always on; no complement strand.
  const SEQ_TRACK_OPTS = { showNumbers: 'auto', showComplement: false, showTranslations: true } as const

  // [max-zoom, fit-whole] bases-per-row range for this locus in this frame (recomputes on resize).
  const bounds: BasesPerRowBounds = $derived(
    seqData ? basesPerRowBounds(seqData, frameW, frameH, SEQ_TRACK_OPTS) : { lo: 60, hi: 60 },
  )
  // The zoom value: bases per row. `null` until the user moves the slider → tracks the default, which
  // itself follows the locus (a short leader opens already whole). Kept inside [lo, hi] on resize.
  let basesPerRow = $state<number | null>(null)
  const n = $derived(
    basesPerRow === null
      ? defaultBasesPerRow(bounds)
      : Math.min(Math.max(basesPerRow, bounds.lo), bounds.hi),
  )
  $effect(() => {
    if (basesPerRow !== null) {
      const clamped = Math.min(Math.max(basesPerRow, bounds.lo), bounds.hi)
      if (clamped !== basesPerRow) basesPerRow = clamped
    }
  })
  // Deterministic from `n` (matches the library's svgWidth); the CSS zoom fills the frame from here.
  const svgWidth = $derived(rowWidthPx(n))
  const seqZoom = $derived(frameW / svgWidth)
  // Drop the per-base position ruler once it would be too small to read (zoomed out); the specifier
  // tags stay (they are annotation parts, not the ruler). Matches the 'auto' in the fit math above.
  const showSeqNumbers = $derived(numbersVisibleAt(n, frameW))

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

  <figure class="tv-arch w-full" data-arch-scale={geneResolved ? 'to-scale' : 'no-gene'}>
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

    <!-- Gene-unresolved note: the source table named a downstream gene (or none), but NCBI could not
         place it on the leader's molecule, so no gene is drawn (no schematic stand-in). Muted, not an
         alarm — it is an expected outcome for ~13% of loci. -->
    {#if geneMissing}
      <p
        class="tv-arch-no-gene mt-3 flex items-center gap-2 rounded-md border border-hairline bg-surface-subtle px-3 py-2 text-caption text-muted"
        role="note"
      >
        <svg viewBox="0 0 16 16" class="size-3.5 shrink-0" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.3" />
          <line x1="8" y1="7" x2="8" y2="11.25" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
          <circle cx="8" cy="4.75" r="0.85" fill="currentColor" />
        </svg>
        <span>Downstream gene could not be found for this locus.</span>
      </p>
    {/if}

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
            <p class="text-caption text-muted">
              All {members.length} elements{geneResolved ? ' + downstream gene' : ''}, to scale
            </p>
          {:else}
            <p class="text-base font-semibold text-ink">Element {selectedMember?.ordinal} leader sequence</p>
            {#if selectedMember?.specifier.aa}
              <p class="text-caption text-muted">
                Specifier <span class="font-mono text-ink">{selectedMember.specifier.aa}</span>
              </p>
            {/if}
          {/if}
        </div>
        <!-- Bases-per-row zoom: slid right = fewer bases / bigger text (max zoom 60 bp across), left
             = the whole locus fits the window. The slider is reversed (its value is the bp-per-row
             mirrored about the range) so rightward always reads as "zoom in". -->
        <div class="flex shrink-0 items-center gap-2">
          <span class="text-caption text-muted">Zoom</span>
          <input
            type="range"
            class="tv-seq-zoom"
            min={bounds.lo}
            max={bounds.hi}
            step="1"
            value={bounds.lo + bounds.hi - n}
            oninput={(e) =>
              (basesPerRow = Math.min(
                Math.max(bounds.lo + bounds.hi - e.currentTarget.valueAsNumber, bounds.lo),
                bounds.hi,
              ))}
            disabled={bounds.hi <= bounds.lo}
            aria-label="Sequence zoom"
          />
          <button
            type="button"
            class="min-w-[5.5ch] text-caption tabular-nums text-muted hover:text-ink"
            title="Reset zoom"
            onclick={() => (basesPerRow = defaultBasesPerRow(bounds))}>{n} bp/row</button>
        </div>
      </div>
      <!-- Fixed-width window: a row is laid out at the natural `svgWidth` then CSS-zoomed to fill the
           frame exactly, so there is never horizontal whitespace or scroll (overflow-x hidden). The
           window height tracks the viewport; taller content scrolls vertically inside it. clientWidth
           excludes the border + reserved scrollbar gutter, so it is the true fill width. -->
      <div
        class="tv-seqzoom relative rounded-md border border-hairline"
        style:max-height="{frameH}px"
        bind:this={seqScroller}
        bind:clientWidth={seqContainerW}
        data-seq-numbers={showSeqNumbers}
      >
        <div style:zoom={seqZoom}>
          <!-- showNumbers is the live `showSeqNumbers` (ruler drops at low zoom); the other flags come
               from SEQ_TRACK_OPTS so the viewer stays in lock-step with the fit predictor. -->
          <SequenceViewer
            data={seqData}
            selectionState={selectionState ?? undefined}
            width={svgWidth}
            height={SEQ_RENDER_ALL_H}
            charsPerRow={n}
            charWidth={CHAR_CELL_PX}
            showComplement={SEQ_TRACK_OPTS.showComplement}
            showNumbers={showSeqNumbers}
            showTranslations={SEQ_TRACK_OPTS.showTranslations}
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
    /* The fixed window: vertical scroll for overflow, NEVER horizontal — a row is CSS-zoomed to
       exactly the frame width, so overflow-x is hidden to guarantee no phantom h-scroll/whitespace. */
    overflow-x: hidden;
    overflow-y: auto;
    /* Reserve the vertical-scrollbar gutter so the measured content width — and therefore the
       fill width — stays stable whether or not the locus is tall enough to scroll. */
    scrollbar-gutter: stable;
  }
  .tv-seqzoom :global(.hatch-sequence-viewer) {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
  }
  /* The library's in-SVG selection readout (`.selection-bar`) sits inside the CSS-zoomed wrapper, so it
     would scale with the bases (its 10 px font × the fill zoom). Hide it; the unzoomed selection
     readout + copy affordances live in the header (PR3). */
  .tv-seqzoom :global(.selection-bar) {
    display: none !important;
  }

  /* On-system range slider — brand-teal accent (chrome, never a specifier hue). */
  .tv-seq-zoom {
    width: 7rem;
    max-width: 36vw;
    accent-color: var(--color-brand);
    cursor: pointer;
  }
</style>
