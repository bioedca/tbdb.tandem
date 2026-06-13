<script lang="ts">
  // The "minor SVG elements on top of the LinearMap" (PLAN §9①): the calm chrome drawn over the
  // hatchlings LinearMap feature track. LinearMap draws each element body as a to-scale tinted
  // arrow + the backbone + 5′/3′ caps; this transparent overlay adds, per element, the specifier
  // amino-acid chip + the ordinal tag (via ArchitectureElementGlyph), plus the explicit inter-
  // element spacer / overlap markers and a scale bar. The RNA-structure anatomy (Stem I, the
  // specifier-codon tick, the antiterminator bulge, the terminator hairpin / anti-SD, the
  // discriminator) is no longer drawn — the figure is an operon overview and that detail lives in
  // the R2DT secondary-structure viewer. It shares LinearMap's bp→x projection so the chips stay
  // pixel-aligned, and is pointer-events:none so clicks fall through to the clickable arrows.
  import type { ArchitectureModel, ElementLayout, FeatureBox } from '../../architecture'
  import { aaColor } from '../../color'
  import { neutral } from '../../design/tokens'
  import { linearMapBpToX } from '../../architectureMap'
  import { spreadLabelXs, type ArchitectureGlyphDims, type Band } from '../../architectureIllustration'
  import ArchitectureElementGlyph from './ArchitectureElementGlyph.svelte'

  let {
    model,
    size,
    width,
    backboneY,
    padTop,
    height,
  }: {
    model: ArchitectureModel
    /** LinearMap `size` (bio-axis domain max); MUST equal what the strip was given. */
    size: number
    /** LinearMap rendered width in px (scales with zoom). */
    width: number
    /** Backbone Y in LinearMap's own user units (bound out of LinearMap). */
    backboneY: number
    /** Vertical offset of the LinearMap strip within the figure (headroom for the tall glyphs). */
    padTop: number
    /** Overlay svg height (= figure height) in px. */
    height: number
  } = $props()

  // LinearMap (single forward lane, showTicks=false) puts the feature-arrow band exactly
  // `ARROW_TO_BACKBONE` above the backbone: fwdFeatureZoneH (1·(FEATURE_H+LANE_GAP)+ZONE_GAP = 21)
  // + RULER_TICK_UP (4). We derive the glyph bands from the BOUND backboneY so the overlay tracks
  // the strip even if those constants shift upstream.
  const ARROW_TO_BACKBONE = 25
  const FEATURE_H = 14

  const bbY = $derived(padTop + backboneY) // backbone Y in overlay coords
  // The AA chip sits just above the element body (`yAa`), joined to the specifier position on the
  // body by a short connector — no Stem-I loop / codon tick between them any more, so the lane is a
  // single clean step above the arrow rather than a tall three-rung stack.
  const dims: ArchitectureGlyphDims = $derived.by(() => {
    const yBodyT = padTop + backboneY - ARROW_TO_BACKBONE
    return { yBodyT, yBodyB: yBodyT + FEATURE_H, yAa: yBodyT - 30 }
  })
  const yGapLabel = $derived(bbY + 13)

  // Per-element AA-chip x, anchored over the specifier (the codon position) and spread just enough
  // that two close elements' chips never overlap. The connector's foot stays at the true codon bp
  // position — only the label chip shifts — so the bp→x alignment the tests pin is untouched.
  // CHIP_MIN_SEP ≈ chip width (26) + gap.
  const CHIP_MIN_SEP = 32
  const specifierXs = $derived(
    model.elements.map((el) => (el.features.codon ? centre(el.features.codon) : null)),
  )
  const chipXs = $derived.by(() => {
    const present = specifierXs
      .map((x, i) => ({ x, i }))
      .filter((e): e is { x: number; i: number } => e.x !== null)
    const spread = spreadLabelXs(
      present.map((e) => e.x),
      CHIP_MIN_SEP,
    )
    const out = specifierXs.slice()
    present.forEach((e, k) => {
      out[e.i] = spread[k]
    })
    return out
  })

  const bpToX = $derived((bp: number) => linearMapBpToX(bp, size, width))
  function centre(box: FeatureBox): number {
    return (bpToX(box.start) + bpToX(box.end)) / 2
  }
  function bodyBand(el: ElementLayout): Band {
    const a = bpToX(el.bodyStart)
    return { x: a, w: Math.max(bpToX(el.bodyEnd) - a, 4) }
  }

  // Scale bar — largest "nice" bp ≤ a third of the span (mirrors the standalone figure).
  const scaleBp = $derived.by(() => {
    const target = model.span / 3
    const steps = [25, 50, 100, 200, 250, 500, 1000, 2000]
    let pick = steps[0]
    for (const s of steps) if (s <= target) pick = s
    return pick
  })
  const scaleW = $derived(bpToX(scaleBp) - bpToX(0))
  const yScale = $derived(bbY + 26)
</script>

<svg
  class="tv-arch-overlay"
  viewBox="0 0 {width} {height}"
  width={width}
  {height}
  role="img"
  aria-label="Tandem architecture: {model.elements.length} T-box elements, biological 5′ to 3′, {model.strand} strand; each element labelled with its specifier amino acid, to scale over the element track."
>
  <!-- Inter-element spacers along the backbone: a dashed bp gap, or an explicit overlap/nest
       marker (~6% of loci; never shown silently as a clean tandem gap — PLAN §6). -->
  {#each model.spacers as sp, i (i)}
    {#if sp.overlap}
      {@const ox1 = bpToX(sp.end)}
      {@const ox2 = bpToX(sp.start)}
      <rect
        class="tv-arch-overlap"
        data-overlap={-sp.gap}
        x={ox1}
        y={bbY - 3}
        width={Math.max(ox2 - ox1, 2)}
        height="6"
        fill={neutral.muted}
        fill-opacity="0.4"
      />
      <text x={(ox1 + ox2) / 2} y={yGapLabel} class="tv-arch-gap" text-anchor="middle">
        {-sp.gap} bp overlap
      </text>
    {:else if sp.gap > 0}
      <line x1={bpToX(sp.start)} y1={bbY} x2={bpToX(sp.end)} y2={bbY} stroke={neutral.muted} stroke-width="1" stroke-dasharray="3 3" class="tv-arch-spacer" />
      <line x1={bpToX(sp.start)} y1={bbY - 3} x2={bpToX(sp.start)} y2={bbY + 3} stroke={neutral.muted} stroke-width="1" />
      <line x1={bpToX(sp.end)} y1={bbY - 3} x2={bpToX(sp.end)} y2={bbY + 3} stroke={neutral.muted} stroke-width="1" />
      <text x={(bpToX(sp.start) + bpToX(sp.end)) / 2} y={yGapLabel} class="tv-arch-gap" text-anchor="middle">
        {sp.gap} bp
      </text>
    {/if}
  {/each}

  <!-- Per-element chrome: the specifier AA chip + ordinal (the body is the LinearMap arrow). -->
  {#each model.elements as el, i (el.member.member_id)}
    <ArchitectureElementGlyph
      {el}
      tint={aaColor(el.aa)}
      body={bodyBand(el)}
      codonX={el.features.codon ? centre(el.features.codon) : null}
      aaChipX={chipXs[i]}
      {dims}
    />
  {/each}

  <!-- Scale bar (the to-scale reference; LinearMap's own tick ruler is suppressed to keep the
       sub-backbone band clear for the spacer labels). -->
  <g class="tv-arch-scale">
    <line x1={bpToX(0)} y1={yScale} x2={bpToX(0) + scaleW} y2={yScale} stroke={neutral.muted} stroke-width="1.4" />
    <line x1={bpToX(0)} y1={yScale - 3} x2={bpToX(0)} y2={yScale + 3} stroke={neutral.muted} stroke-width="1.4" />
    <line x1={bpToX(0) + scaleW} y1={yScale - 3} x2={bpToX(0) + scaleW} y2={yScale + 3} stroke={neutral.muted} stroke-width="1.4" />
    <text x={bpToX(0) + scaleW + 6} y={yScale + 3.5} class="tv-arch-scale-label" text-anchor="start">{scaleBp} bp</text>
  </g>
</svg>

<style>
  .tv-arch-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none; /* clicks fall through to the LinearMap feature arrows */
    overflow: visible;
  }
  .tv-arch-gap,
  .tv-arch-scale-label {
    font-family: var(--font-mono);
    font-size: 9px;
    fill: var(--color-muted);
  }
</style>
